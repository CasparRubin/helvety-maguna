import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke, listen } from "@/lib/tauri-api";
import { ggufBasename, suggestedImportDisplayName } from "@/lib/gguf-import";
import { isTauri } from "@/lib/tauri-runtime";
import {
  FolderOpen,
  Trash2,
  Download,
  HardDrive,
  FolderInput,
  Loader2,
  Shield,
} from "lucide-react";

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
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  formatApproxDownloadGb,
  formatCatalogReleaseDate,
  RECOMMENDED_CATALOG_MODEL_ID,
  sortCatalogBySizeAscending,
} from "@/lib/catalog-order";
import { compactModelDisplayName } from "@/lib/model-display";
import { cn } from "@/lib/utils";
import type { CatalogEntry, GuardrailsSettings, InstalledModel } from "@/lib/types";

type DownloadPhase = "downloading" | "installing";

type DownloadProgress = {
  modelId: string;
  phase: DownloadPhase;
  /** When set, this download event is an optional catalog sidecar (mmproj / mtp). */
  sidecar: string | null;
  received: number;
  total: number | null;
};

function sidecarDownloadLabel(sidecar: string | null): string | null {
  if (sidecar === "mmproj") return "vision projector";
  if (sidecar === "mtp") return "MTP draft sidecar";
  return null;
}

function catalogDownloadButtonLabel(
  entryId: string,
  progress: DownloadProgress | null,
  pct: number | undefined,
): string {
  if (!progress || progress.modelId !== entryId) {
    return "Download";
  }
  if (progress.phase === "installing") {
    return "Finishing install…";
  }
  const sidecarLabel = sidecarDownloadLabel(progress.sidecar);
  if (sidecarLabel) {
    if (pct !== undefined) {
      return `Downloading ${sidecarLabel}… ${pct}%`;
    }
    return `Downloading ${sidecarLabel}…`;
  }
  if (pct !== undefined) {
    return `Downloading… ${pct}%`;
  }
  return "Downloading…";
}

export function ModelsPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [importPath, setImportPath] = useState("");
  const [importName, setImportName] = useState("Imported model");
  const [importing, setImporting] = useState(false);
  const [settingDefaultModelId, setSettingDefaultModelId] = useState<string | null>(
    null,
  );
  const [guardrailsDraft, setGuardrailsDraft] = useState<{ customText: string }>({
    customText: "",
  });
  const [guardrailsSaving, setGuardrailsSaving] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [c, i, a, g] = await Promise.all([
        invoke<CatalogEntry[]>("get_catalog"),
        invoke<InstalledModel[]>("list_installed_models"),
        invoke<string | null>("get_active_model_id"),
        invoke<GuardrailsSettings>("get_guardrails_settings"),
      ]);
      setCatalog(c);
      setInstalled(i);
      setActiveId(a);
      setGuardrailsDraft({
        customText: g.customText ?? "",
      });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{
      model_id: string;
      phase?: DownloadPhase;
      sidecar?: string;
      received: number;
      total: number | null;
    }>("download-progress", (ev) => {
      const phase: DownloadPhase =
        ev.payload.phase === "installing" ? "installing" : "downloading";
      setDownloadProgress({
        modelId: ev.payload.model_id,
        phase,
        sidecar:
          typeof ev.payload.sidecar === "string" && ev.payload.sidecar.length > 0
            ? ev.payload.sidecar
            : null,
        received: ev.payload.received,
        total: ev.payload.total,
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const isInstalled = (id: string) => installed.some((m) => m.id === id);

  const catalogSorted = useMemo(() => sortCatalogBySizeAscending(catalog), [catalog]);

  const pct =
    downloadProgress &&
    downloadProgress.phase === "downloading" &&
    downloadProgress.total
      ? Math.min(
          100,
          Math.round((downloadProgress.received / downloadProgress.total) * 100),
        )
      : downloadProgress && downloadProgress.phase === "downloading"
        ? undefined
        : 0;

  const setDefaultModel = useCallback(
    async (modelId: string) => {
      if (settingDefaultModelId !== null) return;
      setError(null);
      setSettingDefaultModelId(modelId);
      try {
        await invoke("set_active_model", { modelId });
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setSettingDefaultModelId(null);
      }
    },
    [refresh, settingDefaultModelId],
  );

  const pickGgufFile = useCallback(async () => {
    if (!isTauri()) {
      setError("Import is only available in the desktop app.");
      return;
    }
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "GGUF model", extensions: ["gguf"] }],
        title: "Choose a GGUF file",
      });
      if (selected === null || Array.isArray(selected)) {
        return;
      }
      setImportPath(selected);
      setImportName((current) =>
        current === "Imported model" || !current.trim()
          ? suggestedImportDisplayName(selected)
          : current,
      );
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const runImport = useCallback(async () => {
    if (!importPath.trim() || importing) {
      return;
    }
    setError(null);
    setImporting(true);
    try {
      await invoke("import_gguf", {
        sourcePath: importPath,
        displayName: importName,
      });
      setImportPath("");
      setImportName("Imported model");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  }, [importName, importPath, importing, refresh]);

  const saveGuardrails = useCallback(async () => {
    if (guardrailsSaving) return;
    setGuardrailsSaving(true);
    setError(null);
    try {
      await invoke("set_guardrails_settings", {
        value: {
          enabled: true,
          customText:
            guardrailsDraft.customText.trim().length > 0
              ? guardrailsDraft.customText
              : null,
        },
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardrailsSaving(false);
    }
  }, [guardrailsDraft, guardrailsSaving]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Model library</h2>
        <p className="text-sm text-muted-foreground">
          Pick a model, download or import the GGUF, then set it as default if you want
          every mode to use it unless you choose otherwise on that mode&apos;s page.
          Installed weights live in per-user app data and survive app updates. While a
          catalog download runs, that card&apos;s <strong>Download</strong> button shows{" "}
          <strong>Downloading…</strong> (with a percentage when known), then any
          optional <strong>vision projector</strong> / <strong>MTP draft</strong>{" "}
          sidecars, then <strong>Finishing install…</strong>; the progress card on this
          page also tracks the stream and the rename-or-copy step into managed storage
          (large models can take minutes, especially across volumes). Card size badges
          show the main GGUF only—sidecars add extra download when the catalog lists
          them.
        </p>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {downloadProgress ? (
        <Card>
          <CardHeader>
            <CardTitle
              className={cn(
                "flex items-center gap-2 text-base",
                downloadProgress.phase === "downloading" && "tabular-nums",
              )}
            >
              {downloadProgress.phase === "installing" ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Finishing install…
                </>
              ) : (
                (() => {
                  const sidecarLabel = sidecarDownloadLabel(downloadProgress.sidecar);
                  if (sidecarLabel) {
                    return pct !== undefined
                      ? `Downloading ${sidecarLabel}… ${pct}%`
                      : `Downloading ${sidecarLabel}…`;
                  }
                  return pct !== undefined ? `Downloading… ${pct}%` : "Downloading…";
                })()
              )}
            </CardTitle>
            <CardDescription>
              {downloadProgress.phase === "installing" ? (
                <>
                  <span className="font-medium text-foreground">
                    {downloadProgress.modelId}
                  </span>
                  {" — "}
                  Renaming or copying the weights into managed storage (
                  <code className="text-xs">maguna/models</code>). This step can take a
                  long time for multi-gigabyte files—especially when the temporary
                  download file and the models folder are on different drives. Leave the
                  app open until this card disappears.
                </>
              ) : (
                <>
                  {downloadProgress.modelId}
                  {sidecarDownloadLabel(downloadProgress.sidecar)
                    ? ` (${sidecarDownloadLabel(downloadProgress.sidecar)})`
                    : ""}{" "}
                  —{" "}
                  {downloadProgress.total != null
                    ? `${(downloadProgress.received / 1_000_000).toFixed(1)} / ${(downloadProgress.total / 1_000_000).toFixed(1)} MB`
                    : `${(downloadProgress.received / 1_000_000).toFixed(1)} MB`}
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress
              value={downloadProgress.phase === "installing" ? null : (pct ?? null)}
              aria-valuetext={
                downloadProgress.phase === "installing" ? "Installing" : undefined
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="size-4 shrink-0" aria-hidden />
            Installed models
          </CardTitle>
          <CardDescription>
            The <strong>default</strong> model applies until a mode picks another
            installed GGUF in <strong>Edit configuration</strong> on that mode&apos;s
            page (or clears the override to use this default again). Weights are stored
            under <code className="text-xs">maguna/models</code> in per-user app data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-2"
            onClick={() => {
              setError(null);
              void invoke("open_models_install_folder").catch((e) =>
                setError(String(e)),
              );
            }}
          >
            <FolderOpen className="size-4 shrink-0" aria-hidden />
            Open models folder
          </Button>
          {installed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No models installed yet. Download one from the catalog below.
            </p>
          ) : (
            <ScrollArea className="h-48 pr-3">
              <ul className="flex flex-col gap-2">
                {installed.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {compactModelDisplayName(m.display_name)}
                      </p>
                      <p className="text-xs text-muted-foreground">{m.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={activeId === m.id ? "secondary" : "outline"}
                        disabled={settingDefaultModelId !== null}
                        onClick={() => void setDefaultModel(m.id)}
                      >
                        {settingDefaultModelId === m.id ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            Setting...
                          </>
                        ) : activeId === m.id ? (
                          "Default"
                        ) : (
                          "Set as default"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          void invoke("delete_model", { modelId: m.id })
                            .then(() => {
                              setDownloadProgress(null);
                              return refresh();
                            })
                            .catch((e) => setError(String(e)));
                        }}
                      >
                        <Trash2 aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4 shrink-0" aria-hidden />
            Output guardrails
          </CardTitle>
          <CardDescription>
            Maguna always prefixes every mode&apos;s system instructions with a short
            safety policy (neutral tone; no harmful, illegal, or sexually explicit
            content). Offline models may still ignore prompts—this is best-effort, not a
            hard filter.{" "}
            <Link
              to="/settings"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Settings
            </Link>{" "}
            shows the built-in wording read-only plus terms and disclaimers.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Guardrails cannot be turned off. They apply to correction, translation,
            Chat, and custom modes.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="guardrails-custom">Custom policy (optional)</Label>
            <Textarea
              id="guardrails-custom"
              rows={6}
              disabled={guardrailsSaving}
              placeholder="Leave blank to use Maguna&#39;s built-in policy."
              value={guardrailsDraft.customText}
              onChange={(e) =>
                setGuardrailsDraft((d) => ({
                  ...d,
                  customText: e.target.value,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              If set, this text replaces the built-in paragraph; it still prepends ahead
              of each mode&apos;s own system prompt.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            disabled={guardrailsSaving}
            onClick={() => void saveGuardrails()}
          >
            {guardrailsSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save guardrails"
            )}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <section aria-labelledby="catalog-heading">
        <h3 id="catalog-heading" className="mb-1 text-sm font-medium">
          Catalog
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Smallest downloads first. Approximate <strong>main GGUF</strong> size is on
          each card (optional vision/MTP sidecars are extra when listed).{" "}
          <strong>Gemma 4 12B</strong> is highlighted as the recommended starting pick
          for most writing and chat; prefer <strong>HY-MT1.5 7B</strong> for Translate
          DE↔EN.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {catalogSorted.map((entry) => {
            const releasedLabel = formatCatalogReleaseDate(entry.release_date);
            const isThisDownloading = downloadProgress?.modelId === entry.id;
            const downloadButtonLabel = isInstalled(entry.id)
              ? "Installed"
              : catalogDownloadButtonLabel(entry.id, downloadProgress, pct);
            return (
              <Card
                key={entry.id}
                className={cn(
                  entry.id === RECOMMENDED_CATALOG_MODEL_ID &&
                    "border-primary/40 shadow-sm",
                )}
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      {entry.id === RECOMMENDED_CATALOG_MODEL_ID ? (
                        <Badge variant="default" className="w-fit">
                          Recommended
                        </Badge>
                      ) : null}
                      <CardTitle className="text-base leading-snug">
                        {compactModelDisplayName(entry.display_name)}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{entry.maker}</p>
                      {releasedLabel ? (
                        <p className="text-xs text-muted-foreground">
                          Released {releasedLabel}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0 tabular-nums"
                      title="Approximate main GGUF download size (optional catalog sidecars are extra)"
                    >
                      {formatApproxDownloadGb(entry.size_bytes)}
                    </Badge>
                  </div>
                  <CardDescription className="text-sm leading-relaxed">
                    {entry.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    className={cn(
                      "w-full shrink-0 sm:w-auto",
                      isThisDownloading && "tabular-nums",
                    )}
                    disabled={isInstalled(entry.id) || downloadProgress !== null}
                    onClick={() => {
                      setError(null);
                      setDownloadProgress({
                        modelId: entry.id,
                        phase: "downloading",
                        sidecar: null,
                        received: 0,
                        total: entry.size_bytes,
                      });
                      void invoke("download_model", { catalogId: entry.id })
                        .then(() => {
                          setDownloadProgress(null);
                          return refresh();
                        })
                        .catch((e) => {
                          setDownloadProgress(null);
                          setError(String(e));
                        });
                    }}
                  >
                    {isThisDownloading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Download aria-hidden />
                    )}
                    {downloadButtonLabel}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderInput className="size-4 shrink-0" aria-hidden />
            Import GGUF
          </CardTitle>
          <CardDescription>
            Use <strong>Choose file…</strong> to pick a{" "}
            <code className="text-xs">.gguf</code> on this computer; Maguna copies it
            into managed storage (<code className="text-xs">maguna/models</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-file-label">GGUF file</Label>
              <div className="flex min-h-9 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void pickGgufFile()}
                >
                  Choose file…
                </Button>
                <span
                  id="import-file-label"
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    importPath ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {importPath ? ggufBasename(importPath) : "No file selected"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-name">Display name</Label>
              <Input
                id="import-name"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={() => void runImport()}
            disabled={!importPath.trim() || importing}
          >
            {importing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Importing…
              </>
            ) : (
              "Import"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
