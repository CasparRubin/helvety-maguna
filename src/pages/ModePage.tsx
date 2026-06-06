import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { invoke } from "@/lib/tauri-api";
import {
  useInferenceListeners,
  type InferencePhase,
} from "@/hooks/useInferenceListeners";
import { useAutosizeTextarea } from "@/hooks/use-autosize-textarea";
import { useModesNav } from "@/context/modes-nav-context";
import { stripChatArtifacts } from "@/lib/inference-output";
import {
  clearChatSessions,
  loadChatSessions,
  type ChatSessionArchiveEntry,
  removeChatSessionArchiveStorage,
  saveChatSessions,
  sessionTitleFromMessages,
  sortSessionsNewestFirst,
  trimArchiveToMax as trimChatSessionsToMax,
} from "@/lib/chat-session-archive";
import {
  clearModeRunArchive,
  loadModeRunArchive,
  type ModeRunArchiveEntry,
  removeModeRunArchiveStorage,
  saveModeRunArchive,
  trimArchiveToMax,
} from "@/lib/mode-run-archive";
import { compactModelDisplayName } from "@/lib/model-display";
import { createNewCustomMode } from "@/lib/new-custom-mode";
import type {
  ChatMessage,
  InstalledModel,
  ModeDefinition,
  ModeModelBinding,
} from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CopyTextControl } from "@/components/copy-text-control";
import { cn } from "@/lib/utils";
import {
  ClipboardPaste,
  Loader2,
  MessageSquare,
  RotateCcw,
  Settings2,
  Sparkles,
  SquareSplitHorizontal,
  Trash2,
} from "lucide-react";

const LANGS = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
];

const DEFAULT_MODE_ROUTE = "/mode/chat";

function formatDurationMs(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

export function ModePage() {
  const { modeId } = useParams<{ modeId: string }>();
  const navigate = useNavigate();
  const { modes, modesReady, refreshModes } = useModesNav();

  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [modelBinding, setModelBinding] = useState<ModeModelBinding | null>(null);
  const [draft, setDraft] = useState<ModeDefinition | null>(null);
  const [inputText, setInputText] = useState("");
  const [fromLang, setFromLang] = useState("en");
  const [toLang, setToLang] = useState("en");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [inferPhase, setInferPhase] = useState<InferencePhase | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runDurationMs, setRunDurationMs] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [archive, setArchive] = useState<ModeRunArchiveEntry[]>([]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatComposerText, setChatComposerText] = useState("");
  const [chatSessions, setChatSessions] = useState<ChatSessionArchiveEntry[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);

  const lastRunInputRef = useRef("");
  const streamOutRef = useRef("");
  const modeIdRef = useRef(modeId ?? "");
  const streamModeRef = useRef<"legacy" | "chat">("legacy");
  const userCancelledChatRef = useRef(false);
  const activeChatSessionIdRef = useRef<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null);
  const outputTextareaRef = useRef<HTMLTextAreaElement>(null);
  const chatComposerRef = useRef<HTMLTextAreaElement>(null);
  const modePageLayoutRef = useRef<HTMLDivElement>(null);
  const chatTranscriptSlotRef = useRef<HTMLDivElement>(null);
  const chatComposerShellRef = useRef<HTMLDivElement>(null);
  const [chatTranscriptHeightPx, setChatTranscriptHeightPx] = useState(280);

  useAutosizeTextarea(inputTextareaRef, inputText);
  useAutosizeTextarea(outputTextareaRef, out);
  useAutosizeTextarea(chatComposerRef, chatComposerText);

  useEffect(() => {
    activeChatSessionIdRef.current = activeChatSessionId;
  }, [activeChatSessionId]);

  const selectedMode = useMemo(
    () => (modeId ? modes.find((m) => m.id === modeId) : undefined),
    [modes, modeId],
  );

  const refreshInstalled = useCallback(async () => {
    try {
      const list = await invoke<InstalledModel[]>("list_installed_models");
      setInstalled(list);
    } catch {
      setInstalled([]);
    }
  }, []);

  const refreshBinding = useCallback(async () => {
    if (!modeId) return;
    try {
      const b = await invoke<ModeModelBinding>("get_mode_model_binding", { modeId });
      setModelBinding(b);
    } catch {
      setModelBinding(null);
    }
  }, [modeId]);

  useEffect(() => {
    void refreshInstalled();
  }, [refreshInstalled]);

  useEffect(() => {
    void refreshBinding();
  }, [refreshBinding]);

  useEffect(() => {
    modeIdRef.current = modeId ?? "";
  }, [modeId]);

  useEffect(() => {
    if (!modeId) return;
    setArchive(loadModeRunArchive(modeId));
  }, [modeId]);

  useEffect(() => {
    if (!modeId || selectedMode?.prompt_layout !== "chat") return;
    setChatSessions(loadChatSessions(modeId));
  }, [modeId, selectedMode?.prompt_layout]);

  useEffect(() => {
    setDraft(selectedMode ? { ...selectedMode } : null);
    setInputText("");
    setOut("");
    setChatMessages([]);
    setChatComposerText("");
    setActiveChatSessionId(null);
    activeChatSessionIdRef.current = null;
    setRunStartedAt(null);
    setRunDurationMs(null);
    setCancelling(false);
    setErr(null);
    if (selectedMode?.id === "correction-en") {
      setFromLang("en");
      setToLang("en");
    } else if (selectedMode?.id === "correction-de") {
      setFromLang("de");
      setToLang("de");
    } else if (selectedMode?.id === "translate-de-en") {
      setFromLang("de");
      setToLang("en");
    } else if (selectedMode?.id === "translate-en-de") {
      setFromLang("en");
      setToLang("de");
    } else {
      setFromLang("en");
      setToLang("en");
    }
  }, [selectedMode]);

  useInferenceListeners({
    onChunk: (s) => {
      streamOutRef.current += s;
      if (streamModeRef.current === "chat") {
        const acc = streamOutRef.current;
        setChatMessages((prev) => {
          const n = [...prev];
          const tail = n.length - 1;
          if (tail >= 0 && n[tail]?.role === "assistant") {
            n[tail] = { role: "assistant", content: acc };
          }
          return n;
        });
      } else {
        setOut((o) => o + s);
      }
    },
    onPhase: (phase) => setInferPhase(phase),
    onDone: () => {
      if (streamModeRef.current === "chat") {
        const mid = modeIdRef.current;
        const cancelled = userCancelledChatRef.current;
        userCancelledChatRef.current = false;

        if (cancelled) {
          setChatMessages((prev) => {
            const last = prev[prev.length - 1];
            return last?.role === "assistant" ? prev.slice(0, -1) : prev;
          });
        } else {
          const finalOut = stripChatArtifacts(streamOutRef.current);
          let nextThread: ChatMessage[] = [];
          setChatMessages((prev) => {
            nextThread =
              prev.length > 0 && prev[prev.length - 1].role === "assistant"
                ? [
                    ...prev.slice(0, -1),
                    { role: "assistant" as const, content: finalOut },
                  ]
                : prev;
            return nextThread;
          });

          if (mid && nextThread.length > 0) {
            let sid = activeChatSessionIdRef.current ?? crypto.randomUUID();
            if (!activeChatSessionIdRef.current) {
              activeChatSessionIdRef.current = sid;
              setActiveChatSessionId(sid);
            }
            sid = activeChatSessionIdRef.current!;
            const now = Date.now();
            setChatSessions((prevS) => {
              const prior = prevS.find((e) => e.id === sid);
              const createdAt = prior?.createdAt ?? now;
              const updatedAt = now;
              const title =
                sessionTitleFromMessages(nextThread) ?? prior?.title ?? null;
              const entry: ChatSessionArchiveEntry = {
                id: sid,
                createdAt,
                updatedAt,
                title,
                messages: nextThread,
              };
              const merged = trimChatSessionsToMax(
                sortSessionsNewestFirst([entry, ...prevS.filter((e) => e.id !== sid)]),
              );
              saveChatSessions(mid, merged);
              return merged;
            });
          }
        }

        streamModeRef.current = "legacy";

        if (runStartedAt !== null) {
          setRunDurationMs(Math.max(0, Date.now() - runStartedAt));
        }
        setRunStartedAt(null);
        setInferPhase(null);
        setCancelling(false);
        setBusy(false);
        return;
      }

      const mid = modeIdRef.current;
      const finalOut = stripChatArtifacts(streamOutRef.current);
      if (mid) {
        const entry: ModeRunArchiveEntry = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          input: lastRunInputRef.current,
          output: finalOut,
        };
        setArchive((prev) => {
          const next = trimArchiveToMax([entry, ...prev]);
          saveModeRunArchive(mid, next);
          return next;
        });
      }
      if (runStartedAt !== null) {
        setRunDurationMs(Math.max(0, Date.now() - runStartedAt));
      }
      setRunStartedAt(null);
      setOut(() => finalOut);
      setInferPhase(null);
      setCancelling(false);
      setBusy(false);
    },
    onError: (msg) => {
      if (streamModeRef.current === "chat") {
        streamModeRef.current = "legacy";
        setChatMessages((prev) => {
          const last = prev[prev.length - 1];
          return last?.role === "assistant" ? prev.slice(0, -1) : prev;
        });
      }
      setErr(msg);
      setInferPhase(null);
      setRunStartedAt(null);
      setCancelling(false);
      setBusy(false);
    },
  });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && busy) {
        userCancelledChatRef.current = streamModeRef.current === "chat";
        void invoke("cancel_generation").catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);

  const layout = draft?.prompt_layout ?? "translate";

  // Chat transcript height: keep the Message block inside `#main-content`'s visible area
  // (matches App shell). Observes layout/composer size; see README "Chat page".
  useLayoutEffect(() => {
    if (layout !== "chat") return;

    const measure = () => {
      const main = document.getElementById("main-content");
      const slot = chatTranscriptSlotRef.current;
      const composer = chatComposerShellRef.current;
      if (!main || !slot || !composer) return;

      const mainRect = main.getBoundingClientRect();
      const slotTop = slot.getBoundingClientRect().top;
      const gapTranscriptComposer = 16;
      const bottomBreathing = 20;
      const composerH = composer.offsetHeight;

      const raw = Math.floor(
        mainRect.bottom - bottomBreathing - slotTop - gapTranscriptComposer - composerH,
      );
      const maxByMainPane = Math.max(160, Math.floor(mainRect.height * 0.68));
      const h = Math.max(140, Math.min(raw, maxByMainPane));

      setChatTranscriptHeightPx((prev) => (prev === h ? prev : h));
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        requestAnimationFrame(measure);
      });
      if (modePageLayoutRef.current) {
        ro.observe(modePageLayoutRef.current);
      }
      const mainEl = document.getElementById("main-content");
      if (mainEl) {
        ro.observe(mainEl);
      }
      if (chatComposerShellRef.current) {
        ro.observe(chatComposerShellRef.current);
      }
    }

    measure();
    window.addEventListener("resize", measure);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [
    layout,
    configOpen,
    chatMessages.length,
    busy,
    inferPhase,
    cancelling,
    runDurationMs,
    err,
    chatComposerText,
  ]);

  const saveDraftToList = useCallback(async () => {
    if (!draft || !modeId) return;
    setErr(null);
    try {
      const next = modes.map((m) => (m.id === draft.id ? { ...draft } : m));
      await invoke("set_modes", { modes: next });
      await refreshModes();
    } catch (e) {
      setErr(String(e));
    }
  }, [draft, modes, modeId, refreshModes]);

  const run = useCallback(
    async (inputOverride?: string) => {
      const effectiveInput = (inputOverride ?? inputText).trim();
      if (!draft || !effectiveInput || !modeId) return;
      lastRunInputRef.current = effectiveInput;
      streamOutRef.current = "";
      setErr(null);
      setOut("");
      setInferPhase(null);
      setRunDurationMs(null);
      setRunStartedAt(Date.now());
      setCancelling(false);
      setBusy(true);
      try {
        await invoke("run_mode", {
          modeId,
          input: effectiveInput,
          locale: null,
          fromLang: layout === "plain" ? null : fromLang,
          toLang: layout === "plain" ? null : toLang,
        });
      } catch (e) {
        setErr(String(e));
        setInferPhase(null);
        setRunStartedAt(null);
        setBusy(false);
      }
    },
    [draft, inputText, modeId, layout, fromLang, toLang],
  );

  const onPickModel = useCallback(
    async (modelId: string) => {
      if (!modeId) return;
      setErr(null);
      try {
        await invoke("set_mode_model_override", { modeId, modelId });
        await refreshBinding();
      } catch (e) {
        setErr(String(e));
      }
    },
    [modeId, refreshBinding],
  );

  const onClearModelOverride = useCallback(async () => {
    if (!modeId) return;
    setErr(null);
    try {
      await invoke("clear_mode_model_override", { modeId });
      await refreshBinding();
    } catch (e) {
      setErr(String(e));
    }
  }, [modeId, refreshBinding]);

  const deleteArchiveEntry = useCallback(
    (entryId: string) => {
      if (!modeId) return;
      setArchive((prev) => {
        const next = prev.filter((e) => e.id !== entryId);
        saveModeRunArchive(modeId, next);
        return next;
      });
    },
    [modeId],
  );

  const clearEntireArchive = useCallback(() => {
    if (!modeId) return;
    if (
      !window.confirm("Delete all archived runs for this mode? This cannot be undone.")
    ) {
      return;
    }
    clearModeRunArchive(modeId);
    setArchive([]);
  }, [modeId]);

  const startNewChat = useCallback(() => {
    activeChatSessionIdRef.current = null;
    setActiveChatSessionId(null);
    setChatMessages([]);
    setChatComposerText("");
  }, []);

  const openStoredSession = useCallback((entry: ChatSessionArchiveEntry) => {
    activeChatSessionIdRef.current = entry.id;
    setActiveChatSessionId(entry.id);
    setChatMessages(entry.messages);
    setChatComposerText("");
    setErr(null);
  }, []);

  const deleteStoredSession = useCallback(
    (sessionId: string) => {
      if (!modeId) return;
      setChatSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        saveChatSessions(modeId, next);
        return next;
      });
      if (activeChatSessionId === sessionId) {
        activeChatSessionIdRef.current = null;
        setActiveChatSessionId(null);
        setChatMessages([]);
      }
    },
    [modeId, activeChatSessionId],
  );

  const clearAllChatSessions = useCallback(() => {
    if (!modeId) return;
    if (
      !window.confirm(
        "Delete all saved chats for Chat mode on this computer? This cannot be undone.",
      )
    ) {
      return;
    }
    clearChatSessions(modeId);
    setChatSessions([]);
    activeChatSessionIdRef.current = null;
    setActiveChatSessionId(null);
    setChatMessages([]);
    setChatComposerText("");
  }, [modeId]);

  const sendChat = useCallback(
    async (textOverride?: string) => {
      if (!draft || !modeId || layout !== "chat") return;
      const text = (textOverride ?? chatComposerText).trim();
      if (!text) return;

      const msgsForInfer = [...chatMessages, { role: "user" as const, content: text }];
      streamModeRef.current = "chat";
      streamOutRef.current = "";
      setErr(null);
      setInferPhase(null);
      setRunDurationMs(null);
      setRunStartedAt(Date.now());
      setCancelling(false);
      setChatComposerText("");
      setChatMessages([...msgsForInfer, { role: "assistant", content: "" }]);
      setBusy(true);

      try {
        await invoke("run_mode_chat", {
          modeId,
          messages: msgsForInfer,
        });
      } catch (e) {
        streamModeRef.current = "legacy";
        setErr(String(e));
        setChatMessages(msgsForInfer);
        setChatComposerText(text);
        setInferPhase(null);
        setRunStartedAt(null);
        setBusy(false);
      }
    },
    [draft, modeId, layout, chatComposerText, chatMessages],
  );

  const pasteAndSendChat = useCallback(async () => {
    if (busy || !modelBinding?.effective_model_id) return;
    setErr(null);
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (!clip) {
        setErr("Clipboard is empty or whitespace only.");
        return;
      }
      await sendChat(clip);
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Could not read the clipboard. Check permissions or try again.",
      );
    }
  }, [busy, modelBinding?.effective_model_id, sendChat]);

  const pasteAndRunLegacy = useCallback(async () => {
    if (busy || !modelBinding?.effective_model_id) return;
    setErr(null);
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        setErr("Clipboard is empty or whitespace only.");
        return;
      }
      setInputText(clip);
      await run(clip);
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Could not read the clipboard. Check permissions or try again.",
      );
    }
  }, [busy, modelBinding?.effective_model_id, run]);

  useEffect(() => {
    if (layout !== "chat") return;
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, layout, busy]);

  if (!modeId) {
    return null;
  }

  if (!modesReady) {
    return (
      <p className="text-sm text-muted-foreground" aria-busy="true">
        Loading modes…
      </p>
    );
  }

  if (!selectedMode || !draft) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <Alert>
          <AlertDescription>
            This mode does not exist or was removed.{" "}
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to={DEFAULT_MODE_ROUTE}>Go to Chat</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isChat = layout === "chat";
  const showLangInConfig = !isChat && layout !== "plain";

  return (
    <div
      ref={modePageLayoutRef}
      className={cn("mx-auto flex flex-col gap-6", isChat ? "max-w-4xl" : "max-w-3xl")}
    >
      <header className="flex items-start justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">{draft.name}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => setConfigOpen(true)}
        >
          <Settings2 className="size-4" aria-hidden />
          Edit configuration
        </Button>
      </header>

      {err ? (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : null}

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[min(90vh,800px)] gap-0 overflow-y-auto p-0 sm:max-w-xl"
        >
          <div className="flex flex-col gap-6 p-6 pb-4">
            <DialogHeader className="space-y-2 pr-8">
              <DialogTitle>Mode configuration</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="mode-name">Name</Label>
                <Input
                  id="mode-name"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mode-system">System prompt</Label>
                <div className="relative">
                  <CopyTextControl
                    text={draft.system_prompt}
                    className="absolute right-1.5 top-1.5 z-10"
                  />
                  <Textarea
                    id="mode-system"
                    value={draft.system_prompt}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, system_prompt: e.target.value } : d))
                    }
                    placeholder="Optional persistent instruction (empty is fine for custom modes)."
                    className="min-h-[120px] max-h-[40vh] resize-y overflow-y-auto pr-10 font-mono text-sm"
                  />
                </div>
              </div>
              {!isChat && showLangInConfig ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="cfg-from">Language in</Label>
                    <Select value={fromLang} onValueChange={setFromLang}>
                      <SelectTrigger id="cfg-from">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="cfg-to">Language out</Label>
                    <Select value={toLang} onValueChange={setToLang}>
                      <SelectTrigger id="cfg-to">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Model</h3>
              {installed.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No models installed.{" "}
                    <Button variant="link" className="h-auto p-0" asChild>
                      <Link to="/models">Open Model library</Link>
                    </Button>{" "}
                    to download or import a GGUF.
                  </AlertDescription>
                </Alert>
              ) : modelBinding === null ? (
                <p className="text-sm text-muted-foreground">
                  Loading model assignment…
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`mode-model-${modeId}`}>Installed model</Label>
                    <Select
                      value={modelBinding.effective_model_id ?? undefined}
                      onValueChange={(v) => void onPickModel(v)}
                    >
                      <SelectTrigger id={`mode-model-${modeId}`}>
                        <SelectValue placeholder="Choose an installed model…" />
                      </SelectTrigger>
                      <SelectContent>
                        {installed.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {compactModelDisplayName(m.display_name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!modelBinding.effective_model_id ? (
                    <Alert variant="destructive">
                      <AlertDescription>
                        No default model is set and this mode has no assignment. Pick a
                        model above or set a default in Model library.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {modelBinding.override_model_id ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      onClick={() => void onClearModelOverride()}
                    >
                      Use default model from library
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-row flex-wrap justify-end gap-2 border-t border-border bg-muted/30 p-4 sm:space-x-0">
            <Button type="button" onClick={() => void saveDraftToList()}>
              Save mode
            </Button>
            {draft.builtin ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void (async () => {
                    setErr(null);
                    try {
                      await invoke("reset_mode_to_default", { modeId: draft.id });
                      await refreshModes();
                    } catch (e) {
                      setErr(String(e));
                    }
                  })();
                }}
              >
                <RotateCcw aria-hidden />
                Reset to default
              </Button>
            ) : null}
            {!draft.builtin ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  void (async () => {
                    setErr(null);
                    try {
                      await invoke("delete_mode", {
                        modeId: draft.id,
                      });
                      removeModeRunArchiveStorage(draft.id);
                      removeChatSessionArchiveStorage(draft.id);
                      await refreshModes();
                      setConfigOpen(false);
                      navigate(DEFAULT_MODE_ROUTE, { replace: true });
                    } catch (e) {
                      setErr(String(e));
                    }
                  })();
                }}
              >
                <Trash2 aria-hidden />
                Delete
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const base = draft;
                const copy: ModeDefinition = {
                  ...base,
                  id: `mode-${crypto.randomUUID()}`,
                  name: `${base.name} (copy)`,
                  builtin: false,
                };
                void (async () => {
                  setErr(null);
                  try {
                    await invoke("set_modes", { modes: [...modes, copy] });
                    await refreshModes();
                    setConfigOpen(false);
                    navigate(`/mode/${copy.id}`, { replace: false });
                  } catch (e) {
                    setErr(String(e));
                  }
                })();
              }}
            >
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isChat ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <MessageSquare className="size-4 shrink-0" aria-hidden />
              Chat
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startNewChat}
              disabled={busy}
            >
              New chat
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div
              ref={chatTranscriptSlotRef}
              className="min-h-[7rem] shrink-0"
              style={{ height: chatTranscriptHeightPx }}
            >
              <ScrollArea className="h-full rounded-md border bg-muted/20 p-3">
                <div className="flex flex-col gap-3">
                  {chatMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No messages yet. Type below and press Send (Enter sends,
                      Shift+Enter for a new line).
                    </p>
                  ) : (
                    chatMessages.map((m, i) => (
                      <div
                        key={`${i}-${m.role}`}
                        className={cn(
                          "relative min-w-0 rounded-lg border pl-3 pr-10 py-2",
                          m.role === "user"
                            ? "ml-6 border-muted-foreground/20 bg-background"
                            : "mr-6 border-primary/25 bg-muted/40",
                        )}
                      >
                        <CopyTextControl
                          text={m.content}
                          className="absolute right-1.5 top-1.5 z-10"
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {m.role === "user" ? (
                              "You"
                            ) : (
                              <span
                                className={cn(
                                  busy &&
                                    i === chatMessages.length - 1 &&
                                    "maguna-label-thinking",
                                )}
                              >
                                Maguna
                              </span>
                            )}
                          </p>
                          <pre className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words font-mono text-sm">
                            {m.content ||
                              (m.role === "assistant" && busy
                                ? inferPhase === "prefill"
                                  ? "…"
                                  : ""
                                : m.content)}
                          </pre>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </ScrollArea>
            </div>

            <div ref={chatComposerShellRef} className="flex shrink-0 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="chat-composer">Message</Label>
                <div className="relative">
                  <CopyTextControl
                    text={chatComposerText}
                    className="absolute right-1.5 top-1.5 z-10"
                  />
                  <Textarea
                    ref={chatComposerRef}
                    id="chat-composer"
                    value={chatComposerText}
                    onChange={(e) => setChatComposerText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendChat();
                      }
                    }}
                    className="min-h-24 resize-none overflow-y-hidden px-3 py-2 pr-10"
                    placeholder="Write a message…"
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void pasteAndSendChat()}
                  disabled={
                    busy || modelBinding === null || !modelBinding.effective_model_id
                  }
                >
                  <ClipboardPaste aria-hidden />
                  Paste and run
                </Button>
                <Button
                  type="button"
                  onClick={() => void sendChat()}
                  disabled={
                    busy ||
                    !chatComposerText.trim() ||
                    modelBinding === null ||
                    !modelBinding.effective_model_id
                  }
                >
                  {busy ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      {inferPhase === "prefill"
                        ? "Encoding prompt…"
                        : inferPhase === "generating"
                          ? "Generating…"
                          : "Starting…"}
                    </>
                  ) : (
                    <>
                      <Sparkles aria-hidden />
                      Send
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!busy || cancelling}
                  onClick={() => {
                    userCancelledChatRef.current = streamModeRef.current === "chat";
                    setCancelling(true);
                    void invoke("cancel_generation").catch(() => {
                      setCancelling(false);
                    });
                  }}
                >
                  {cancelling ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Cancelling...
                    </>
                  ) : (
                    "Cancel"
                  )}
                </Button>
              </div>
              {busy && cancelling ? (
                <p className="text-xs text-muted-foreground">
                  Cancel requested. Stopping generation and cleaning up…
                </p>
              ) : null}
              {busy && inferPhase === "prefill" ? (
                <p className="text-xs text-muted-foreground">
                  Absorbing the prompt is often the slowest part; streamed text appears
                  once prefill finishes.
                </p>
              ) : null}
              {runDurationMs !== null ? (
                <p className="text-xs text-muted-foreground">
                  Last response time: {formatDurationMs(runDurationMs)}
                </p>
              ) : null}
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Archive</h3>
                {chatSessions.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={clearAllChatSessions}
                  >
                    Clear archive
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Saved conversations (newest first). Continue a chat or delete one row;
                Clear removes all.
              </p>
              {chatSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved chats yet.</p>
              ) : (
                <ScrollArea className="h-[min(40vh,360px)] rounded-md border">
                  <ul className="divide-y p-2">
                    {chatSessions.map((row) => (
                      <li key={row.id} className="flex gap-2 py-3 first:pt-2 last:pb-2">
                        <button
                          type="button"
                          className="min-w-0 flex-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60"
                          onClick={() => openStoredSession(row)}
                        >
                          <p className="text-xs font-medium text-foreground line-clamp-2">
                            {row.title ?? "Untitled chat"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(row.updatedAt).toLocaleString()}
                            {activeChatSessionId === row.id ? (
                              <span className="ml-2 text-primary">• open</span>
                            ) : null}
                          </p>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="Delete saved chat"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteStoredSession(row.id);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Input &amp; output</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="run-input">Input</Label>
              <div className="relative">
                <CopyTextControl
                  text={inputText}
                  className="absolute right-1.5 top-1.5 z-10"
                />
                <Textarea
                  ref={inputTextareaRef}
                  id="run-input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void run();
                    }
                  }}
                  className="min-h-10 resize-none overflow-y-hidden px-3 py-2 pr-10"
                  placeholder="Text to process…"
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void pasteAndRunLegacy()}
                disabled={
                  busy || modelBinding === null || !modelBinding.effective_model_id
                }
              >
                <ClipboardPaste aria-hidden />
                Paste and run
              </Button>
              <Button
                type="button"
                onClick={() => void run()}
                disabled={
                  busy ||
                  !inputText.trim() ||
                  modelBinding === null ||
                  !modelBinding.effective_model_id
                }
              >
                {busy ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    {inferPhase === "prefill"
                      ? "Encoding prompt…"
                      : inferPhase === "generating"
                        ? "Generating…"
                        : "Starting…"}
                  </>
                ) : (
                  <>
                    <Sparkles aria-hidden />
                    Run
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!busy || cancelling}
                onClick={() => {
                  userCancelledChatRef.current = streamModeRef.current === "chat";
                  setCancelling(true);
                  void invoke("cancel_generation").catch(() => {
                    setCancelling(false);
                  });
                }}
              >
                {cancelling ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Cancelling...
                  </>
                ) : (
                  "Cancel"
                )}
              </Button>
            </div>
            {busy && cancelling ? (
              <p className="text-xs text-muted-foreground">
                Cancel requested. Stopping generation and cleaning up...
              </p>
            ) : null}
            {busy && inferPhase === "prefill" ? (
              <p className="text-xs text-muted-foreground">
                Absorbing the prompt is often the slowest part; streamed text appears
                once prefill finishes.
              </p>
            ) : null}
            {runDurationMs !== null ? (
              <p className="text-xs text-muted-foreground">
                Response time: {formatDurationMs(runDurationMs)}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="run-output">Output</Label>
              <div className="relative">
                <CopyTextControl
                  text={out}
                  className="absolute right-1.5 top-1.5 z-10"
                />
                <Textarea
                  ref={outputTextareaRef}
                  id="run-output"
                  value={out}
                  readOnly
                  aria-live="polite"
                  className="min-h-10 resize-none overflow-y-hidden px-3 py-2 pr-10 font-mono text-sm"
                  placeholder="Reply will appear here..."
                />
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Archive</h3>
                {archive.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={clearEntireArchive}
                  >
                    Clear archive
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Successful runs are saved here (newest first). Delete individual rows or
                clear everything.
              </p>
              {archive.length === 0 ? (
                <p className="text-sm text-muted-foreground">No archived runs yet.</p>
              ) : (
                <ScrollArea className="h-[min(50vh,420px)] rounded-md border">
                  <ul className="divide-y p-2">
                    {archive.map((row) => (
                      <li key={row.id} className="flex gap-2 py-3 first:pt-2 last:pb-2">
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {new Date(row.createdAt).toLocaleString()}
                          </p>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Input
                            </p>
                            <div className="relative">
                              <CopyTextControl
                                text={row.input}
                                className="absolute right-1.5 top-1.5 z-10"
                              />
                              <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 pr-10 font-mono text-xs">
                                {row.input}
                              </pre>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Output
                            </p>
                            <div className="relative">
                              <CopyTextControl
                                text={row.output}
                                className="absolute right-1.5 top-1.5 z-10"
                              />
                              <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 pr-10 font-mono text-xs">
                                {row.output}
                              </pre>
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="Delete archived run"
                          onClick={() => deleteArchiveEntry(row.id)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AddModeNavButton() {
  const navigate = useNavigate();
  const { modes, refreshModes } = useModesNav();

  const createAndOpen = useCallback(
    (def: ModeDefinition) => {
      void (async () => {
        try {
          await invoke("set_modes", { modes: [...modes, def] });
          await refreshModes();
          navigate(`/mode/${def.id}`);
        } catch (e) {
          console.error(e);
        }
      })();
    },
    [modes, refreshModes, navigate],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Add mode
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        onClick={() => createAndOpen(createNewCustomMode("chat"))}
      >
        <MessageSquare className="size-4 shrink-0" aria-hidden />
        Chat
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        onClick={() => createAndOpen(createNewCustomMode("simple"))}
      >
        <SquareSplitHorizontal className="size-4 shrink-0" aria-hidden />
        One input / one output
      </Button>
    </div>
  );
}
