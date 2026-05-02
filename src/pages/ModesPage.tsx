import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@/lib/tauri-api";
import { useInferenceListeners } from "@/hooks/useInferenceListeners";
import { stripChatArtifacts } from "@/lib/inference-output";
import type { ModeDefinition } from "@/lib/types";
import { InferenceBackendBanner } from "@/components/InferenceBackendBanner";
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
import { ScrollArea } from "@/components/ui/scroll-area";
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

export function ModesPage() {
  const [modes, setModes] = useState<ModeDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ModeDefinition | null>(null);
  const [inputText, setInputText] = useState("");
  const [locale, setLocale] = useState("de");
  const [fromLang, setFromLang] = useState("de");
  const [toLang, setToLang] = useState("en");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadErr(null);
    try {
      const list = await invoke<ModeDefinition[]>("get_modes");
      setModes(list);
      setSelectedId((cur) => {
        if (cur && list.some((m) => m.id === cur)) return cur;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setLoadErr(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const m = modes.find((x) => x.id === selectedId);
    setDraft(m ? { ...m } : null);
  }, [modes, selectedId]);

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
    if (!draft) return;
    setErr(null);
    try {
      const next = modes.map((m) => (m.id === draft.id ? { ...draft } : m));
      await invoke("set_modes", { modes: next });
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  }, [draft, modes, refresh]);

  const run = useCallback(async () => {
    if (!draft || !inputText.trim()) return;
    setErr(null);
    setOut("");
    setBusy(true);
    try {
      await invoke("run_mode", {
        modeId: draft.id,
        input: inputText,
        locale: needsLocale ? locale : null,
        fromLang: needsFromTo ? fromLang : null,
        toLang: needsFromTo ? toLang : null,
      });
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }, [draft, inputText, needsLocale, needsFromTo, locale, fromLang, toLang]);

  const selectedMode = useMemo(
    () => modes.find((m) => m.id === selectedId),
    [modes, selectedId],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Modes</h2>
        <p className="text-sm text-muted-foreground">
          Choose the active model in Model library, then pick a mode here. Maguna only
          ships default system text for the built-in Correction and Translate modes;
          every other mode is fully yours (system + user template). User templates must
          include <code className="text-xs">{"{{input}}"}</code>. Built-ins can be reset
          to those defaults anytime.
        </p>
      </header>

      <InferenceBackendBanner />

      {loadErr ? (
        <p className="text-sm text-destructive" role="alert">
          {loadErr}
        </p>
      ) : null}
      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      <div className="flex min-h-[560px] flex-col gap-4 lg:flex-row">
        <Card className="lg:w-56 lg:shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mode list</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => {
                void (async () => {
                  setErr(null);
                  try {
                    const list = await invoke<ModeDefinition[]>("get_modes");
                    const n = newCustomMode();
                    await invoke("set_modes", { modes: [...list, n] });
                    await refresh();
                    setSelectedId(n.id);
                  } catch (e) {
                    setErr(String(e));
                  }
                })();
              }}
            >
              <Plus className="size-4" aria-hidden />
              Add mode
            </Button>
            <ScrollArea className="h-64 pr-2 lg:h-[420px]">
              <ul className="space-y-1">
                {modes.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className={`w-full rounded-md border px-2 py-2 text-left text-sm transition-colors ${
                        m.id === selectedId
                          ? "border-primary bg-secondary"
                          : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <span className="font-medium">{m.name}</span>
                      {m.builtin ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (built-in)
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {draft ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Mode definition</CardTitle>
                  <CardDescription>
                    Optional placeholders in the user template:{" "}
                    <code className="text-xs">{"{{locale}}"}</code>,{" "}
                    <code className="text-xs">{"{{from}}"}</code>,{" "}
                    <code className="text-xs">{"{{to}}"}</code>. For custom modes, leave
                    system empty if you want the model to follow only what you put in
                    the user template.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="mode-name">Name</Label>
                      <Input
                        id="mode-name"
                        value={draft.name}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                        }
                      />
                    </div>
                    <div className="space-y-2">
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
                  <div className="space-y-2">
                    <Label htmlFor="mode-system">System prompt</Label>
                    <Textarea
                      id="mode-system"
                      value={draft.system_prompt}
                      onChange={(e) =>
                        setDraft((d) =>
                          d ? { ...d, system_prompt: e.target.value } : d,
                        )
                      }
                      placeholder="Optional persistent instruction (empty is fine for custom modes)."
                      className="min-h-[120px] font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
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
                              await invoke("reset_mode_to_default", {
                                modeId: draft.id,
                              });
                              await refresh();
                            } catch (e) {
                              setErr(String(e));
                            }
                          })();
                        }}
                      >
                        <RotateCcw className="size-4" aria-hidden />
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
                              await refresh();
                              setSelectedId("spelling");
                            } catch (e) {
                              setErr(String(e));
                            }
                          })();
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
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
                            await refresh();
                            setSelectedId(copy.id);
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
                <CardContent className="space-y-4">
                  {needsLocale ? (
                    <div className="space-y-2">
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
                      <div className="space-y-2">
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
                      <div className="space-y-2">
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
                  <div className="space-y-2">
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
                    disabled={busy || !inputText.trim()}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Running…
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" aria-hidden />
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
            </>
          ) : selectedMode ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <p className="text-sm text-muted-foreground">No modes loaded.</p>
          )}
        </div>
      </div>
    </div>
  );
}
