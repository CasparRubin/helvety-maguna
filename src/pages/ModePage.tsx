import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { invoke } from "@/lib/tauri-api";
import {
  useInferenceListeners,
  type InferencePhase,
} from "@/hooks/useInferenceListeners";
import { useModesNav } from "@/context/modes-nav-context";
import { stripChatArtifacts } from "@/lib/inference-output";
import { compactModelDisplayName } from "@/lib/model-display";
import type {
  InstalledModel,
  ModeDefinition,
  ModeModelBinding,
  PromptLayout,
} from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";

const LANGS = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
];

const DEFAULT_MODE_ROUTE = "/mode/correction-de";

function formatDurationMs(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

function newCustomMode(): ModeDefinition {
  return {
    id: `mode-${crypto.randomUUID()}`,
    name: "New mode",
    system_prompt: "",
    prompt_layout: "plain",
    max_tokens: 768,
    builtin: false,
  };
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
    setDraft(selectedMode ? { ...selectedMode } : null);
    setInputText("");
    setOut("");
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
    onChunk: (s) => setOut((o) => o + s),
    onPhase: (phase) => setInferPhase(phase),
    onDone: () => {
      if (runStartedAt !== null) {
        setRunDurationMs(Math.max(0, Date.now() - runStartedAt));
      }
      setRunStartedAt(null);
      setOut((o) => stripChatArtifacts(o));
      setInferPhase(null);
      setCancelling(false);
      setBusy(false);
    },
    onError: (msg) => {
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
        void invoke("cancel_generation").catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);

  const layout: PromptLayout = draft?.prompt_layout ?? "plain";

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

  const run = useCallback(async () => {
    if (!draft || !inputText.trim() || !modeId) return;
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
        input: inputText,
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
  }, [draft, inputText, modeId, layout, fromLang, toLang]);

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
              <Link to={DEFAULT_MODE_ROUTE}>Go to Correction DE</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{draft.name}</h2>
        <p className="text-sm text-muted-foreground">
          Use input and output below. Open{" "}
          <strong className="font-medium">Mode configuration</strong> for name, user
          message shape, system prompt, languages in/out, and model.
        </p>
      </header>

      {err ? (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 rounded-md text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={configOpen}
            onClick={() => setConfigOpen((o) => !o)}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-base">Mode configuration</CardTitle>
              <CardDescription>
                Name, mode (user message shape), system prompt, input and output
                language, then which installed model runs for this page.
              </CardDescription>
            </div>
            <ChevronDown
              className={cn(
                "mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform",
                configOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </CardHeader>
        {configOpen ? (
          <CardContent className="flex flex-col gap-6 pt-0">
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
                <Label htmlFor="mode-layout">Mode</Label>
                <Select
                  value={draft.prompt_layout}
                  disabled={draft.builtin}
                  onValueChange={(v) =>
                    setDraft((d) =>
                      d ? { ...d, prompt_layout: v as PromptLayout } : d,
                    )
                  }
                >
                  <SelectTrigger id="mode-layout">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plain">
                      Plain — only your typed text is sent as the user message
                    </SelectItem>
                    <SelectItem value="locale">
                      Locale — structured turn (language in, text, language out); kept
                      for older custom modes
                    </SelectItem>
                    <SelectItem value="translate">
                      Translate — structured turn (language in, text, language out);
                      built-in corrections use this with the same language twice (DE–DE,
                      EN–EN) by default
                    </SelectItem>
                  </SelectContent>
                </Select>
                {draft.builtin ? (
                  <p className="text-xs text-muted-foreground">
                    Built-in modes use a fixed mode; <strong>Reset to default</strong>{" "}
                    restores the factory choice.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mode-system">System prompt</Label>
                <Textarea
                  id="mode-system"
                  value={draft.system_prompt}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, system_prompt: e.target.value } : d))
                  }
                  placeholder="Optional persistent instruction (empty is fine for custom modes)."
                  className="min-h-[120px] font-mono text-sm"
                />
              </div>
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
              {layout === "plain" ? (
                <p className="text-xs text-muted-foreground">
                  With <strong>Plain</strong> mode, language choices are not included in
                  the user turn; they stay here so every mode uses the same fields.
                </p>
              ) : null}
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Model</h3>
              <p className="text-xs text-muted-foreground">
                Choose an installed GGUF. Clear the override to use the{" "}
                <strong>default model</strong> from Model library.
              </p>
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
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Using the default model from Model library (no per-mode override).
                    </p>
                  )}
                </>
              )}
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
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
                        await invoke("delete_mode", { modeId: draft.id });
                        await refreshModes();
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
                      navigate(`/mode/${copy.id}`, { replace: false });
                    } catch (e) {
                      setErr(String(e));
                    }
                  })();
                }}
              >
                Duplicate
              </Button>
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Input &amp; output</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="run-input">Input</Label>
            <Textarea
              id="run-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void run();
                }
              }}
              className="min-h-[160px]"
              placeholder="Text to process…"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
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
              Absorbing the prompt on CPU is often the slowest part; streamed text
              appears once this finishes.
            </p>
          ) : null}
          {runDurationMs !== null ? (
            <p className="text-xs text-muted-foreground">
              Response time: {formatDurationMs(runDurationMs)}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="run-output">Output</Label>
            <Textarea
              id="run-output"
              value={out}
              readOnly
              aria-live="polite"
              className="min-h-[180px] font-mono text-sm"
              placeholder="Reply will appear here..."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AddModeNavButton() {
  const navigate = useNavigate();
  const { modes, refreshModes } = useModesNav();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2"
      onClick={() => {
        void (async () => {
          try {
            const n = newCustomMode();
            await invoke("set_modes", { modes: [...modes, n] });
            await refreshModes();
            navigate(`/mode/${n.id}`);
          } catch (e) {
            console.error(e);
          }
        })();
      }}
    >
      <Plus aria-hidden />
      Add mode
    </Button>
  );
}
