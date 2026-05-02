import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { invoke } from "@/lib/tauri-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
    <Alert>
      <AlertTriangle />
      <div>
        <AlertTitle>On-device inference is not available in this build</AlertTitle>
        <AlertDescription className="mt-2 text-muted-foreground">
          {info.dev_hint}
        </AlertDescription>
      </div>
    </Alert>
  );
}
