import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearModeRunArchive,
  loadModeRunArchive,
  MODE_RUN_ARCHIVE_MAX,
  removeModeRunArchiveStorage,
  saveModeRunArchive,
  sortArchiveNewestFirst,
  trimArchiveToMax,
  type ModeRunArchiveEntry,
} from "./mode-run-archive";

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

describe("sortArchiveNewestFirst", () => {
  it("sorts by createdAt descending", () => {
    const older: ModeRunArchiveEntry = {
      id: "a",
      createdAt: 100,
      input: "x",
      output: "y",
    };
    const newer: ModeRunArchiveEntry = {
      id: "b",
      createdAt: 200,
      input: "x",
      output: "y",
    };
    expect(sortArchiveNewestFirst([older, newer])).toEqual([newer, older]);
    expect(sortArchiveNewestFirst([newer, older])).toEqual([newer, older]);
  });

  it("does not mutate the original array order of equal timestamps", () => {
    const a = { id: "a", createdAt: 1, input: "", output: "" };
    const b = { id: "b", createdAt: 1, input: "", output: "" };
    const arr = [a, b];
    sortArchiveNewestFirst(arr);
    expect(arr).toEqual([a, b]);
  });
});

describe("trimArchiveToMax", () => {
  it("returns the list unchanged when at or below max", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      id: `${i}`,
      createdAt: i,
      input: "",
      output: "",
    }));
    expect(trimArchiveToMax(entries, 5)).toEqual(entries);
    expect(trimArchiveToMax(entries, 10)).toEqual(entries);
  });

  it("keeps only the first max entries", () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({
      id: `${i}`,
      createdAt: i,
      input: "",
      output: "",
    }));
    expect(trimArchiveToMax(entries, 4)).toHaveLength(4);
    expect(trimArchiveToMax(entries, 4).map((e) => e.id)).toEqual(["0", "1", "2", "3"]);
  });

  it("defaults max to MODE_RUN_ARCHIVE_MAX", () => {
    const entries = Array.from({ length: MODE_RUN_ARCHIVE_MAX + 2 }, (_, i) => ({
      id: `id-${i}`,
      createdAt: i,
      input: "",
      output: "",
    }));
    expect(trimArchiveToMax(entries)).toHaveLength(MODE_RUN_ARCHIVE_MAX);
  });
});

describe("mode run archive persistence (localStorage)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const modeId = "test-mode-1";

  it("load returns empty array when nothing stored", () => {
    expect(loadModeRunArchive(modeId)).toEqual([]);
  });

  it("roundtrips save and load", () => {
    const entries: ModeRunArchiveEntry[] = [
      { id: "1", createdAt: 10, input: "in", output: "out" },
    ];
    saveModeRunArchive(modeId, entries);
    expect(loadModeRunArchive(modeId)).toEqual(entries);
  });

  it("load sorts by createdAt descending", () => {
    const a: ModeRunArchiveEntry = {
      id: "old",
      createdAt: 1,
      input: "a",
      output: "b",
    };
    const b: ModeRunArchiveEntry = {
      id: "new",
      createdAt: 99,
      input: "c",
      output: "d",
    };
    saveModeRunArchive(modeId, [a, b]);
    expect(loadModeRunArchive(modeId)).toEqual([b, a]);
  });

  it("load filters out invalid array elements", () => {
    const key = `maguna.modeRunArchive.v1:${modeId}`;
    localStorage.setItem(
      key,
      JSON.stringify([
        { id: "ok", createdAt: 1, input: "x", output: "y" },
        { bad: true },
        null,
        { id: 1, createdAt: "x", input: 1, output: 2 },
      ]),
    );
    expect(loadModeRunArchive(modeId)).toEqual([
      { id: "ok", createdAt: 1, input: "x", output: "y" },
    ]);
  });

  it("load returns empty array for non-array JSON", () => {
    const key = `maguna.modeRunArchive.v1:${modeId}`;
    localStorage.setItem(key, JSON.stringify({ not: "array" }));
    expect(loadModeRunArchive(modeId)).toEqual([]);
  });

  it("load returns empty array for invalid JSON", () => {
    const key = `maguna.modeRunArchive.v1:${modeId}`;
    localStorage.setItem(key, "{");
    expect(loadModeRunArchive(modeId)).toEqual([]);
  });

  it("clearModeRunArchive removes the key", () => {
    saveModeRunArchive(modeId, [{ id: "1", createdAt: 1, input: "", output: "" }]);
    clearModeRunArchive(modeId);
    expect(loadModeRunArchive(modeId)).toEqual([]);
  });

  it("removeModeRunArchiveStorage clears like clearModeRunArchive", () => {
    saveModeRunArchive(modeId, [{ id: "1", createdAt: 1, input: "", output: "" }]);
    removeModeRunArchiveStorage(modeId);
    expect(loadModeRunArchive(modeId)).toEqual([]);
  });

  it("isolates keys per modeId", () => {
    saveModeRunArchive("mode-a", [{ id: "1", createdAt: 1, input: "a", output: "a" }]);
    saveModeRunArchive("mode-b", [{ id: "2", createdAt: 2, input: "b", output: "b" }]);
    expect(loadModeRunArchive("mode-a")).toEqual([
      { id: "1", createdAt: 1, input: "a", output: "a" },
    ]);
    expect(loadModeRunArchive("mode-b")).toEqual([
      { id: "2", createdAt: 2, input: "b", output: "b" },
    ]);
  });
});
