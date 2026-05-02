import type { ChatMessage } from "@/lib/types";

const STORAGE_KEY_PREFIX = "maguna.chatSessions.v1:";

export const CHAT_SESSION_ARCHIVE_MAX = 400;

export type ChatSessionArchiveEntry = {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** First line preview for the session list */
  title: string | null;
  messages: ChatMessage[];
};

function storageKey(modeId: string): string {
  return `${STORAGE_KEY_PREFIX}${modeId}`;
}

function isChatMessage(x: unknown): x is ChatMessage {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (o.role === "user" || o.role === "assistant") && typeof o.content === "string";
}

function isEntry(x: unknown): x is ChatSessionArchiveEntry {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.createdAt !== "number" ||
    typeof o.updatedAt !== "number"
  ) {
    return false;
  }
  if (o.title !== null && typeof o.title !== "string") return false;
  if (!Array.isArray(o.messages)) return false;
  return o.messages.every(isChatMessage);
}

export function sortSessionsNewestFirst(
  entries: ChatSessionArchiveEntry[],
): ChatSessionArchiveEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function trimArchiveToMax(
  entries: ChatSessionArchiveEntry[],
  max = CHAT_SESSION_ARCHIVE_MAX,
): ChatSessionArchiveEntry[] {
  if (entries.length <= max) return entries;
  return entries.slice(0, max);
}

export function loadChatSessions(modeId: string): ChatSessionArchiveEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(modeId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list = parsed.filter(isEntry);
    return sortSessionsNewestFirst(list);
  } catch {
    return [];
  }
}

export function saveChatSessions(
  modeId: string,
  entries: ChatSessionArchiveEntry[],
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(modeId), JSON.stringify(entries));
  } catch {
    /* quota or private mode */
  }
}

export function deleteChatSession(
  modeId: string,
  sessionId: string,
): ChatSessionArchiveEntry[] {
  const prev = loadChatSessions(modeId);
  const next = prev.filter((e) => e.id !== sessionId);
  saveChatSessions(modeId, next);
  return next;
}

export function clearChatSessions(modeId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(modeId));
  } catch {
    /* ignore */
  }
}

/** Remove persisted chat sessions for `modeId` (e.g. when a custom mode is deleted; built-ins are not removable). */
export function removeChatSessionArchiveStorage(modeId: string): void {
  clearChatSessions(modeId);
}

export function sessionTitleFromMessages(messages: ChatMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  const line = firstUser.content.trim().split(/\r?\n/)[0] ?? "";
  if (!line) return null;
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}
