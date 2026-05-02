import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { invoke } from "@/lib/tauri-api";
import { useInferenceListeners } from "@/hooks/useInferenceListeners";
import { useModesNav } from "@/context/modes-nav-context";
import { stripChatArtifacts } from "@/lib/inference-output";
import type { InstalledModel, ModeDefinition, ModeModelBinding } from "@/lib/types";
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
import { Loader2, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";

const LANGS = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
];

function newCustomMode(): ModeDefinition {
  return {
    id: `mode-${crypto.randomUUID()}`,
    name: "New mode",
    system_prompt: "",
    user_message_template: "{{input}}",
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
  const [locale, setLocale] = useState("de");
  const [fromLang, setFromLang] = useState("de");
  const [toLang, setToLang] = useState("en");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    setErr(null);
  }, [selectedMode]);

  useInferenceListeners({
    onChunk: (s) => setOut((o) => o + s),
    onDone: () => {
      setOut((o) => stripChatArtifacts(o));
      setBusy(false);
    },
    onError: (msg) => {
      setErr(msg);
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

  const tpl = draft?.user_message_template ?? "";
  const needsLocale = tpl.includes("{{locale}}");
  const needsFromTo = tpl.includes("{{from}}") || tpl.includes("{{to}}");

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
    setBusy(true);
    try {
      await invoke("run_mode", {
        modeId,
        input: inputText,
        locale: needsLocale ? locale : null,
        fromLang: needsFromTo ? fromLang : null,
        toLang: needsFromTo ? toLang : null,
      });
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }, [draft, inputText, modeId, needsLocale, needsFromTo, locale, fromLang, toLang]);

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
              <Link to="/mode/spelling">Go to Correction</Link>
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
          Edit this mode, pick which installed GGUF it uses, then run it below. Built-in
          Correction and Translate can be reset to factory defaults anytime.
        </p>
      </header>

      {err ? (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model for this mode</CardTitle>
          <CardDescription>
            Choose an installed GGUF. If you clear the override, this mode uses the{" "}
            <strong>default model</strong> from Model library.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
            <p className="text-sm text-muted-foreground">Loading model assignment…</p>
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
                        {m.display_name}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mode definition</CardTitle>
          <CardDescription>
            Optional placeholders: <code className="text-xs">{"{{locale}}"}</code>,{" "}
            <code className="text-xs">{"{{from}}"}</code>,{" "}
            <code className="text-xs">{"{{to}}"}</code>. User template must include{" "}
            <code className="text-xs">{"{{input}}"}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label htmlFor="mode-max">Max tokens</Label>
              <Input
                id="mode-max"
                type="number"
                min={64}
                max={8192}
                value={draft.max_tokens}
                onChange={(e) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          max_tokens: Number(e.target.value) || 64,
                        }
                      : d,
                  )
                }
              />
            </div>
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="mode-user-tpl">User message template</Label>
            <Textarea
              id="mode-user-tpl"
              value={draft.user_message_template}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, user_message_template: e.target.value } : d,
                )
              }
              className="min-h-[160px] font-mono text-sm"
            />
          </div>
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
                      navigate("/mode/spelling", { replace: true });
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run</CardTitle>
          <CardDescription>
            Your text replaces <code className="text-xs">{"{{input}}"}</code>.
            Ctrl+Enter to run; Escape cancels.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {needsLocale ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="run-locale">Locale hint</Label>
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger id="run-locale">
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
          ) : null}
          {needsFromTo ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="run-from">From</Label>
                <Select value={fromLang} onValueChange={setFromLang}>
                  <SelectTrigger id="run-from">
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
                <Label htmlFor="run-to">To</Label>
                <Select value={toLang} onValueChange={setToLang}>
                  <SelectTrigger id="run-to">
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="run-input">Input</Label>
            <Textarea
              id="run-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void run();
                }
              }}
              className="min-h-[140px]"
              placeholder="Text to process…"
            />
          </div>
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
                Running…
              </>
            ) : (
              <>
                <Sparkles aria-hidden />
                Run mode
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Output</CardTitle>
          <CardDescription>Streams while generating.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={out}
            readOnly
            aria-live="polite"
            className="min-h-[160px] font-mono text-sm"
          />
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
