import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke, listen } from "@/lib/tauri-api";
import {
  FolderOpen,
  Trash2,
  Download,
  HardDrive,
  FolderInput,
  Loader2,
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
import { Badge } from "@/components/ui/badge";
import {
  formatApproxDownloadGb,
  formatCatalogReleaseDate,
  RECOMMENDED_CATALOG_MODEL_ID,
  sortCatalogBySizeAscending,
} from "@/lib/catalog-order";
import { cn } from "@/lib/utils";
import type { CatalogEntry, InstalledModel } from "@/lib/types";

type DownloadPhase = "downloading" | "installing";

export function ModelsPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    modelId: string;
    phase: DownloadPhase;
    received: number;
    total: number | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importPath, setImportPath] = useState("");
  const [importName, setImportName] = useState("Imported model");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [c, i, a] = await Promise.all([
        invoke<CatalogEntry[]>("get_catalog"),
        invoke<InstalledModel[]>("list_installed_models"),
        invoke<string | null>("get_active_model_id"),
      ]);
      setCatalog(c);
      setInstalled(i);
      setActiveId(a);
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
      received: number;
      total: number | null;
    }>("download-progress", (ev) => {
      const phase: DownloadPhase =
        ev.payload.phase === "installing" ? "installing" : "downloading";
      setDownloadProgress({
        modelId: ev.payload.model_id,
        phase,
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

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Model library</h2>
        <p className="text-sm text-muted-foreground">
          Pick a model, download or import the GGUF, then set it as default if you want
          every mode to use it unless you choose otherwise on that mode&apos;s page.
          After the downloading step fills in, Maguna shows{" "}
          <strong>Finishing install</strong> while the file is moved into your model
          folder (large models can take minutes, especially across drives).
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
            <CardTitle className="flex items-center gap-2 text-base">
              {downloadProgress.phase === "installing" ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Finishing install
                </>
              ) : (
                "Downloading"
              )}
            </CardTitle>
            <CardDescription>
              {downloadProgress.phase === "installing" ? (
                <>
                  <span className="font-medium text-foreground">
                    {downloadProgress.modelId}
                  </span>
                  {" — "}
                  Moving the weights into your model library (from Maguna&apos;s
                  temporary download folder if needed). This step can take a long time
                  for multi-gigabyte files—especially copying from your profile data
                  folder (on Windows, under{" "}
                  <code className="text-xs">AppData\Roaming</code> for this app) to
                  another drive. Leave the app open until this card disappears.
                </>
              ) : (
                <>
                  {downloadProgress.modelId} —{" "}
                  {downloadProgress.total != null
                    ? `${(downloadProgress.received / 1_000_000).toFixed(1)} / ${(downloadProgress.total / 1_000_000).toFixed(1)} MB`
                    : `${(downloadProgress.received / 1_000_000).toFixed(1)} MB`}
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {downloadProgress.phase === "installing" ? (
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-primary/20"
                role="progressbar"
                aria-valuetext="Installing"
              >
                <div className="h-full w-full animate-pulse bg-primary/50" />
              </div>
            ) : (
              <Progress value={pct} />
            )}
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
            The <strong>default</strong> model is used by any mode that has not chosen
            its own installed GGUF in the sidebar.
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
                      <p className="font-medium">{m.display_name}</p>
                      <p className="text-xs text-muted-foreground">{m.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={activeId === m.id ? "secondary" : "outline"}
                        onClick={() => {
                          void invoke("set_active_model", { modelId: m.id })
                            .then(() => refresh())
                            .catch((e) => setError(String(e)));
                        }}
                      >
                        {activeId === m.id ? "Default" : "Set as default"}
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

      <Separator />

      <section aria-labelledby="catalog-heading">
        <h3 id="catalog-heading" className="mb-1 text-lg font-medium">
          Catalog
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Smallest downloads first. Approximate size is on each card; one pick is
          highlighted as recommended for most writing and translation use.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {catalogSorted.map((entry) => {
            const releasedLabel = formatCatalogReleaseDate(entry.release_date);
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
                        {entry.display_name}
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
                      title="Approximate download size"
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
                    className="w-full shrink-0 sm:w-auto"
                    disabled={isInstalled(entry.id) || downloadProgress !== null}
                    onClick={() => {
                      setError(null);
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
                    <Download aria-hidden />
                    {isInstalled(entry.id) ? "Installed" : "Download"}
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
            Copy a <code className="text-xs">.gguf</code> file into Maguna&apos;s
            managed storage (full path on this computer).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-path">File path</Label>
              <Input
                id="import-path"
                value={importPath}
                onChange={(e) => setImportPath(e.target.value)}
                placeholder="D:\Models\my-model.gguf"
                autoComplete="off"
              />
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
            onClick={() => {
              setError(null);
              void invoke("import_gguf", {
                sourcePath: importPath,
                displayName: importName,
              })
                .then(() => {
                  setImportPath("");
                  return refresh();
                })
                .catch((e) => setError(String(e)));
            }}
            disabled={!importPath.trim()}
          >
            Import
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
