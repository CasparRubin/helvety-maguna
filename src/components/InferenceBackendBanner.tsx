import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { invoke } from "@/lib/tauri-api";
import { cn } from "@/lib/utils";

type InferenceBackendInfo = {
  llama_backend_compiled: boolean;
  dev_hint: string;
};

export function InferenceBackendBanner() {
  const [info, setInfo] = useState<InferenceBackendInfo | null>(null);

  useEffect(() => {
    void invoke<InferenceBackendInfo>("inference_backend_info").then(setInfo);
  }, []);

  if (info === null || info.llama_backend_compiled) {
    return null;
  }

  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-foreground",
      )}
    >
      <div className="flex gap-2 font-medium text-amber-950 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        On-device inference is not available in this build
      </div>
      <p className="mt-2 text-muted-foreground">{info.dev_hint}</p>
    </div>
  );
}
