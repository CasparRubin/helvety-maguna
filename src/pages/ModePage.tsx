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
import {
  stripChatArtifacts,
  visibleInferenceOutput,
  shouldPreserveReasoningTrace,
} from "@/lib/inference-output";
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
  ModelThinkingSettings,
} from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { open } from "@tauri-apps/plugin-dialog";
import {
  Brain,
  ClipboardPaste,
  ImagePlus,
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

const LANG_SELECT_ITEMS = LANGS.map((l) => ({ label: l.label, value: l.value }));

const DEFAULT_MODE_ROUTE = "/mode/chat";

type ClearArchiveTarget = "chat" | "runs";

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
  /** Hy-MT-style glossary rows for Translate modes (source → target). */
  const [terminologyRows, setTerminologyRows] = useState<
    { source: string; target: string }[]
  >([]);
  const [keepFormatting, setKeepFormatting] = useState(false);
  const [chatImagePath, setChatImagePath] = useState<string | null>(null);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [inferPhase, setInferPhase] = useState<InferencePhase | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runDurationMs, setRunDurationMs] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [enableModelThinking, setEnableModelThinking] = useState(false);
  const [thinkingBusy, setThinkingBusy] = useState(false);
  const enableModelThinkingRef = useRef(false);
  const [clearArchiveConfirm, setClearArchiveConfirm] =
    useState<ClearArchiveTarget | null>(null);
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
  const effectiveModelIdRef = useRef<string | null>(null);
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

  useEffect(() => {
    effectiveModelIdRef.current = modelBinding?.effective_model_id ?? null;
  }, [modelBinding?.effective_model_id]);

  useEffect(() => {
    enableModelThinkingRef.current = enableModelThinking;
  }, [enableModelThinking]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const th = await invoke<ModelThinkingSettings>("get_model_thinking_settings");
        if (!cancelled) {
          enableModelThinkingRef.current = th.enabled;
          setEnableModelThinking(th.enabled);
        }
      } catch {
        /* keep default off */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modeId]);

  const toggleModelThinking = useCallback(async () => {
    if (thinkingBusy) return;
    const next = !enableModelThinking;
    setThinkingBusy(true);
    setErr(null);
    try {
      await invoke("set_model_thinking_settings", {
        value: { enabled: next },
      });
      enableModelThinkingRef.current = next;
      setEnableModelThinking(next);
    } catch (e) {
      setErr(String(e));
    } finally {
      setThinkingBusy(false);
    }
  }, [enableModelThinking, thinkingBusy]);

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
      const outputOpts = {
        preserveReasoning: shouldPreserveReasoningTrace(
          effectiveModelIdRef.current,
          enableModelThinkingRef.current,
        ),
      };
      const visible = visibleInferenceOutput(streamOutRef.current, outputOpts);
      if (streamModeRef.current === "chat") {
        setChatMessages((prev) => {
          const n = [...prev];
          const tail = n.length - 1;
          if (tail >= 0 && n[tail]?.role === "assistant") {
            n[tail] = { role: "assistant", content: visible };
          }
          return n;
        });
      } else {
        setOut(visible);
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
          const outputOpts = {
            preserveReasoning: shouldPreserveReasoningTrace(
              effectiveModelIdRef.current,
              enableModelThinkingRef.current,
            ),
          };
          const finalOut = stripChatArtifacts(streamOutRef.current, outputOpts);
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
      const outputOpts = {
        preserveReasoning: shouldPreserveReasoningTrace(
          effectiveModelIdRef.current,
          enableModelThinkingRef.current,
        ),
      };
      const finalOut = stripChatArtifacts(streamOutRef.current, outputOpts);
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

  const modelSelectItems = useMemo(
    () => [
      { label: "Choose an installed model…", value: null },
      ...installed.map((m) => ({
        label: compactModelDisplayName(m.display_name),
        value: m.id,
      })),
    ],
    [installed],
  );

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
          terminology:
            layout === "translate"
              ? terminologyRows
                  .filter((r) => r.source.trim() && r.target.trim())
                  .map((r) => [r.source.trim(), r.target.trim()] as [string, string])
              : null,
          keepFormatting: layout === "translate" ? keepFormatting : null,
        });
      } catch (e) {
        setErr(String(e));
        setInferPhase(null);
        setRunStartedAt(null);
        setBusy(false);
      }
    },
    [
      draft,
      inputText,
      modeId,
      layout,
      fromLang,
      toLang,
      terminologyRows,
      keepFormatting,
    ],
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

  const requestClearArchive = useCallback((target: ClearArchiveTarget) => {
    setClearArchiveConfirm(target);
  }, []);

  const confirmClearArchive = useCallback(() => {
    if (!modeId || clearArchiveConfirm === null) return;
    if (clearArchiveConfirm === "chat") {
      clearChatSessions(modeId);
      setChatSessions([]);
      activeChatSessionIdRef.current = null;
      setActiveChatSessionId(null);
      setChatMessages([]);
      setChatComposerText("");
    } else {
      clearModeRunArchive(modeId);
      setArchive([]);
    }
    setClearArchiveConfirm(null);
  }, [modeId, clearArchiveConfirm]);

  const startNewChat = useCallback(() => {
    activeChatSessionIdRef.current = null;
    setActiveChatSessionId(null);
    setChatMessages([]);
    setChatComposerText("");
    void invoke("reset_chat_kv").catch(() => {});
  }, []);

  const openStoredSession = useCallback((entry: ChatSessionArchiveEntry) => {
    activeChatSessionIdRef.current = entry.id;
    setActiveChatSessionId(entry.id);
    setChatMessages(entry.messages);
    setChatComposerText("");
    setErr(null);
    void invoke("reset_chat_kv").catch(() => {});
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
          imagePath: chatImagePath,
        });
        setChatImagePath(null);
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
    [draft, modeId, layout, chatComposerText, chatMessages, chatImagePath],
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
            <Button
              variant="link"
              className="h-auto p-0"
              render={<Link to={DEFAULT_MODE_ROUTE} />}
              nativeButton={false}
            >
              Go to Chat
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
      className={cn("mx-auto flex max-w-4xl flex-col gap-6")}
    >
      <header className="flex items-start justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">{draft.name}</h2>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant={enableModelThinking ? "default" : "outline"}
            size="sm"
            className="gap-2"
            disabled={thinkingBusy || busy}
            aria-pressed={enableModelThinking}
            title={
              enableModelThinking
                ? "Thinking on for Qwen / Gemma 4 / GLM-4.7 — chain-of-thought may appear (slower). DeepSeek-R1 / GLM-Z1 always reason."
                : "Thinking off for Qwen / Gemma 4 / GLM-4.7 — polished answers. DeepSeek-R1 / GLM-Z1 still show reasoning."
            }
            onClick={() => void toggleModelThinking()}
          >
            <Brain className="size-4" aria-hidden />
            {enableModelThinking ? "Thinking on" : "Thinking off"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setConfigOpen(true)}
          >
            <Settings2 className="size-4" aria-hidden />
            Edit configuration
          </Button>
        </div>
      </header>

      {err ? (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : null}

      <Dialog
        open={clearArchiveConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setClearArchiveConfirm(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear archive?</DialogTitle>
            <DialogDescription>
              {clearArchiveConfirm === "chat"
                ? "Delete all saved chats for Chat mode on this computer? This cannot be undone."
                : "Delete all archived runs for this mode? This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearArchiveConfirm(null)}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmClearArchive}>
              Delete all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader className="pr-8">
            <DialogTitle>Mode configuration</DialogTitle>
          </DialogHeader>

          <div className="-mx-4 max-h-[min(70vh,640px)] overflow-y-auto px-4">
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
                    <Select
                      items={LANG_SELECT_ITEMS}
                      value={fromLang}
                      onValueChange={(v) => {
                        if (v != null) setFromLang(v);
                      }}
                    >
                      <SelectTrigger id="cfg-from" className="w-full">
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
                    <Select
                      items={LANG_SELECT_ITEMS}
                      value={toLang}
                      onValueChange={(v) => {
                        if (v != null) setToLang(v);
                      }}
                    >
                      <SelectTrigger id="cfg-to" className="w-full">
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

            <Separator className="my-4" />

            <div className="flex flex-col gap-3 pb-1">
              <h3 className="text-sm font-medium">Model</h3>
              {installed.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No models installed.{" "}
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      render={<Link to="/models" />}
                      nativeButton={false}
                    >
                      Open Model library
                    </Button>{" "}
                    to download or import a GGUF (catalog or{" "}
                    <strong>Choose file…</strong>).
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
                      items={modelSelectItems}
                      value={modelBinding.effective_model_id ?? null}
                      onValueChange={(v) => {
                        if (v != null) void onPickModel(v);
                      }}
                    >
                      <SelectTrigger id={`mode-model-${modeId}`} className="w-full">
                        <SelectValue />
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

          <DialogFooter className="flex-wrap">
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
          <CardHeader>
            <CardTitle className="text-base inline-flex items-center gap-2">
              <MessageSquare className="size-4 shrink-0" aria-hidden />
              Chat
            </CardTitle>
            <CardAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startNewChat}
                disabled={busy}
              >
                New chat
              </Button>
            </CardAction>
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
                    chatMessages.map((m, i) => {
                      const hasContent = m.content.trim() !== "";
                      const isThinking =
                        m.role === "assistant" &&
                        busy &&
                        i === chatMessages.length - 1 &&
                        !hasContent;

                      return (
                        <div
                          key={`${i}-${m.role}`}
                          className={cn(
                            "relative min-w-0 rounded-lg border pl-3 py-2",
                            hasContent ? "pr-10" : "pr-3",
                            m.role === "user"
                              ? "ml-6 border-muted-foreground/20 bg-background"
                              : "mr-6 border-primary/25 bg-muted/40",
                          )}
                        >
                          {hasContent ? (
                            <CopyTextControl
                              text={m.content}
                              className="absolute right-1.5 top-1.5 z-10"
                            />
                          ) : null}
                          <div className="min-w-0 space-y-1">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {m.role === "user" ? "You" : "Maguna"}
                            </p>
                            <pre className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words font-mono text-sm">
                              {hasContent ? (
                                m.content
                              ) : isThinking ? (
                                <span className="maguna-label-thinking">
                                  Thinking...
                                </span>
                              ) : null}
                            </pre>
                          </div>
                        </div>
                      );
                    })
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
                {chatImagePath ? (
                  <p className="text-xs text-muted-foreground">
                    Image attached: {chatImagePath.split(/[/\\]/).pop()}{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setChatImagePath(null)}
                    >
                      Remove
                    </button>
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      try {
                        const selected = await open({
                          multiple: false,
                          filters: [
                            {
                              name: "Images",
                              extensions: ["png", "jpg", "jpeg", "webp", "gif"],
                            },
                          ],
                        });
                        if (typeof selected === "string") {
                          setChatImagePath(selected);
                        }
                      } catch (e) {
                        setErr(String(e));
                      }
                    })();
                  }}
                >
                  <ImagePlus aria-hidden />
                  Attach image
                </Button>
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
                  The bubble shows Thinking... until answer text streams in; absorbing
                  the prompt is often the slowest part.
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
                    onClick={() => requestClearArchive("chat")}
                  >
                    Clear archive
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Saved conversations (newest first). Continue a chat, delete one row, or
                clear all—Clear archive opens a confirmation dialog first.
              </p>
              {chatSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved chats yet.</p>
              ) : (
                <ScrollArea className="h-[min(40vh,360px)] rounded-md border">
                  <ul className="divide-y p-2">
                    {chatSessions.map((row) => (
                      <li key={row.id} className="flex gap-2 py-3 first:pt-2 last:pb-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto min-w-0 flex-1 justify-start rounded-lg px-2 py-1 text-left font-normal"
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
                        </Button>
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
            {layout === "translate" && fromLang !== toLang ? (
              <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Terminology (optional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setTerminologyRows((rows) => [
                        ...rows,
                        { source: "", target: "" },
                      ])
                    }
                  >
                    Add term
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Hy-MT-style glossary: preferred source → target pairs for this run.
                </p>
                {terminologyRows.map((row, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[8rem] flex-1">
                      <Label className="text-xs">Source</Label>
                      <Input
                        value={row.source}
                        onChange={(e) =>
                          setTerminologyRows((rows) =>
                            rows.map((r, j) =>
                              j === i ? { ...r, source: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="min-w-[8rem] flex-1">
                      <Label className="text-xs">Target</Label>
                      <Input
                        value={row.target}
                        onChange={(e) =>
                          setTerminologyRows((rows) =>
                            rows.map((r, j) =>
                              j === i ? { ...r, target: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setTerminologyRows((rows) => rows.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={keepFormatting}
                    onChange={(e) => setKeepFormatting(e.target.checked)}
                  />
                  Keep formatting / structure
                </label>
              </div>
            ) : null}
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
                Cancel requested. Stopping generation and cleaning up…
              </p>
            ) : null}
            {busy && inferPhase === "prefill" ? (
              <p className="text-xs text-muted-foreground">
                Output fills in once generation starts; absorbing the prompt is often
                the slowest part.
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
                    onClick={() => requestClearArchive("runs")}
                  >
                    Clear archive
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Successful runs are saved here (newest first). Delete individual rows or
                clear all—Clear archive opens a confirmation dialog first.
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
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Input
                              </p>
                              <CopyTextControl text={row.input} className="h-6 w-6" />
                            </div>
                            <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-xs">
                              {row.input}
                            </pre>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Output
                              </p>
                              <CopyTextControl text={row.output} className="h-6 w-6" />
                            </div>
                            <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-xs">
                              {row.output}
                            </pre>
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
