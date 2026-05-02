import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke, listen } from "@/lib/tauri-api";
import { Trash2, Download, HardDrive, FolderInput } from "lucide-react";

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
  sortCatalogByRecommendation,
} from "@/lib/catalog-order";
import { cn } from "@/lib/utils";
import type { CatalogEntry, InstalledModel } from "@/lib/types";

export function ModelsPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    modelId: string;
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
      received: number;
      total: number | null;
    }>("download-progress", (ev) => {
      setDownloadProgress({
        modelId: ev.payload.model_id,
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

  const catalogSorted = useMemo(() => sortCatalogByRecommendation(catalog), [catalog]);

  const pct =
    downloadProgress && downloadProgress.total
      ? Math.min(
          100,
          Math.round((downloadProgress.received / downloadProgress.total) * 100),
        )
      : downloadProgress
        ? undefined
        : 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Model library</h2>
        <p className="text-sm text-muted-foreground">
          Curated GGUF weights for local inference. Each entry records the right chat
          template for the model family (TinyLlama, Llama 3.x, Mistral, Qwen, Gemma,
          Moonshot-style, DeepSeek R1 distill, etc.). Use{" "}
          <strong>Set as default</strong> so modes without their own pick use this GGUF.
          You can still assign a different installed model on each mode&apos;s page.
          Manual imports default to TinyLlama-style framing unless the saved id matches
          a known family.
        </p>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

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

      {downloadProgress ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Downloading</CardTitle>
            <CardDescription>
              {downloadProgress.modelId} —{" "}
              {downloadProgress.total != null
                ? `${(downloadProgress.received / 1_000_000).toFixed(1)} / ${(downloadProgress.total / 1_000_000).toFixed(1)} MB`
                : `${(downloadProgress.received / 1_000_000).toFixed(1)} MB`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={pct} />
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
        <CardContent className="flex flex-col gap-2">
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
                      <p className="text-xs text-muted-foreground">
                        Chat template:{" "}
                        {(m.chat_template ?? "").trim() || "auto (from id)"}
                      </p>
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
          Ordered for quality (best picks first). Approximate download size is shown on
          each card.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {catalogSorted.map((entry, index) => (
            <Card
              key={entry.id}
              className={cn(
                index === 0 &&
                  "border-primary/50 shadow-sm ring-1 ring-ring/60 ring-offset-2 ring-offset-background",
              )}
            >
              <CardHeader className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {index === 0 ? (
                      <Badge className="text-xs font-semibold uppercase tracking-wide">
                        Top pick
                      </Badge>
                    ) : null}
                    <CardTitle className="text-base leading-snug">
                      {entry.display_name}
                    </CardTitle>
                    <p className="text-sm font-medium text-muted-foreground">
                      {entry.maker}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="min-h-10 min-w-[6.25rem] text-base tabular-nums tracking-tight"
                    title="Approximate download size"
                  >
                    {formatApproxDownloadGb(entry.size_bytes)}
                  </Badge>
                </div>
                <CardDescription className="leading-relaxed">
                  {entry.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p className="text-xs">
                  Chat template: {entry.chat_template ?? "tinyllama_v1"}
                </p>
                <Button
                  type="button"
                  disabled={isInstalled(entry.id)}
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
          ))}
        </div>
      </section>
    </div>
  );
}
