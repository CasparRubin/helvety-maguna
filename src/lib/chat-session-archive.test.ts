import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHAT_SESSION_ARCHIVE_MAX,
  clearChatSessions,
  deleteChatSession,
  loadChatSessions,
  removeChatSessionArchiveStorage,
  saveChatSessions,
  sessionTitleFromMessages,
  sortSessionsNewestFirst,
  trimArchiveToMax,
  type ChatSessionArchiveEntry,
} from "./chat-session-archive";

function createMemoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

describe("sessionTitleFromMessages", () => {
  it("uses first user line and truncates long titles", () => {
    expect(
      sessionTitleFromMessages([
        { role: "assistant", content: "ignored" },
        { role: "user", content: "first line\nsecond" },
      ]),
    ).toBe("first line");
    const eighty = "x".repeat(80);
    expect(sessionTitleFromMessages([{ role: "user", content: eighty }])).toBe(eighty);
    const eightyOne = "x".repeat(81);
    expect(sessionTitleFromMessages([{ role: "user", content: eightyOne }])).toBe(
      `${"x".repeat(77)}…`,
    );
  });

  it("returns null when no user message", () => {
    expect(
      sessionTitleFromMessages([{ role: "assistant", content: "only" }]),
    ).toBeNull();
  });

  it("returns null for blank first user line", () => {
    expect(sessionTitleFromMessages([{ role: "user", content: "   " }])).toBeNull();
    expect(sessionTitleFromMessages([{ role: "user", content: "\n\n" }])).toBeNull();
  });

  it("uses first line after trim across CRLF", () => {
    expect(
      sessionTitleFromMessages([{ role: "user", content: "  hello\r\nrest  " }]),
    ).toBe("hello");
  });
});

describe("sortSessionsNewestFirst", () => {
  it("sorts by updatedAt descending", () => {
    const older: ChatSessionArchiveEntry = {
      id: "a",
      createdAt: 50,
      updatedAt: 100,
      title: "x",
      messages: [],
    };
    const newer: ChatSessionArchiveEntry = {
      id: "b",
      createdAt: 60,
      updatedAt: 200,
      title: "y",
      messages: [],
    };
    expect(sortSessionsNewestFirst([older, newer])).toEqual([newer, older]);
    expect(sortSessionsNewestFirst([newer, older])).toEqual([newer, older]);
  });
});

describe("trimArchiveToMax", () => {
  it("returns the list unchanged when at or below max", () => {
    const entries = [entry("a", 1), entry("b", 2)];
    expect(trimArchiveToMax(entries, 5)).toEqual(entries);
    expect(trimArchiveToMax(entries, 2)).toEqual(entries);
  });

  it("keeps only the first max entries", () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry(`id-${i}`, i));
    expect(trimArchiveToMax(entries, 4)).toHaveLength(4);
    expect(trimArchiveToMax(entries, 4).map((e) => e.id)).toEqual([
      "id-0",
      "id-1",
      "id-2",
      "id-3",
    ]);
  });

  it("defaults max to CHAT_SESSION_ARCHIVE_MAX", () => {
    const entries = Array.from({ length: CHAT_SESSION_ARCHIVE_MAX + 2 }, (_, i) => ({
      id: `id-${i}`,
      createdAt: i,
      updatedAt: i,
      title: null as string | null,
      messages: [],
    }));
    expect(trimArchiveToMax(entries)).toHaveLength(CHAT_SESSION_ARCHIVE_MAX);
  });
});

function entry(id: string, updatedAt: number): ChatSessionArchiveEntry {
  return {
    id,
    createdAt: 0,
    updatedAt,
    title: null,
    messages: [],
  };
}

describe("chat session archive persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const modeId = "chat";

  it("load returns empty when missing", () => {
    expect(loadChatSessions(modeId)).toEqual([]);
  });

  it("roundtrips save and load", () => {
    const entries: ChatSessionArchiveEntry[] = [
      {
        id: "s1",
        createdAt: 10,
        updatedAt: 15,
        title: "Hi",
        messages: [{ role: "user", content: "hello" }],
      },
    ];
    saveChatSessions(modeId, entries);
    expect(loadChatSessions(modeId)).toEqual(entries);
  });

  it("filters invalid elements", () => {
    const key = `maguna.chatSessions.v1:${modeId}`;
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          id: "ok",
          createdAt: 1,
          updatedAt: 2,
          title: "t",
          messages: [{ role: "user", content: "x" }],
        },
        { bad: true },
        null,
      ]),
    );
    expect(loadChatSessions(modeId)).toHaveLength(1);
  });

  it("load sorts by updatedAt descending", () => {
    saveChatSessions(modeId, [
      {
        id: "old",
        createdAt: 1,
        updatedAt: 1,
        title: "A",
        messages: [],
      },
      {
        id: "new",
        createdAt: 2,
        updatedAt: 99,
        title: "B",
        messages: [],
      },
    ]);
    expect(loadChatSessions(modeId).map((e) => e.id)).toEqual(["new", "old"]);
  });

  it("filters entries with invalid messages", () => {
    const key = `maguna.chatSessions.v1:${modeId}`;
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          id: "bad-msg",
          createdAt: 1,
          updatedAt: 1,
          title: null,
          messages: [{ role: "system", content: "nope" }],
        },
        {
          id: "good",
          createdAt: 1,
          updatedAt: 2,
          title: null,
          messages: [{ role: "user", content: "ok" }],
        },
      ]),
    );
    expect(loadChatSessions(modeId).map((e) => e.id)).toEqual(["good"]);
  });

  it("load returns empty array for non-array JSON", () => {
    const key = `maguna.chatSessions.v1:${modeId}`;
    localStorage.setItem(key, JSON.stringify({ not: "array" }));
    expect(loadChatSessions(modeId)).toEqual([]);
  });

  it("load returns empty array for invalid JSON", () => {
    const key = `maguna.chatSessions.v1:${modeId}`;
    localStorage.setItem(key, "{");
    expect(loadChatSessions(modeId)).toEqual([]);
  });

  it("clearChatSessions removes key", () => {
    saveChatSessions(modeId, [
      {
        id: "1",
        createdAt: 1,
        updatedAt: 1,
        title: null,
        messages: [],
      },
    ]);
    clearChatSessions(modeId);
    expect(loadChatSessions(modeId)).toEqual([]);
  });

  it("removeChatSessionArchiveStorage clears", () => {
    saveChatSessions(modeId, [
      {
        id: "1",
        createdAt: 1,
        updatedAt: 1,
        title: null,
        messages: [],
      },
    ]);
    removeChatSessionArchiveStorage(modeId);
    expect(loadChatSessions(modeId)).toEqual([]);
  });

  it("deleteChatSession removes one entry and returns the new list", () => {
    saveChatSessions(modeId, [
      {
        id: "keep",
        createdAt: 1,
        updatedAt: 1,
        title: "A",
        messages: [],
      },
      {
        id: "gone",
        createdAt: 2,
        updatedAt: 2,
        title: "B",
        messages: [],
      },
    ]);
    const next = deleteChatSession(modeId, "gone");
    expect(next.map((e) => e.id)).toEqual(["keep"]);
    expect(loadChatSessions(modeId).map((e) => e.id)).toEqual(["keep"]);
  });
});
