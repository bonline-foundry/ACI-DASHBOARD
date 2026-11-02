"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { UploadKind } from "@/lib/upload/templates";
import { restoreUploadAction } from "./actions";

export function RestoreButton({ id, kind }: { id: number; kind: UploadKind }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Restore version ${id}? Its rows replace the current uploaded rows for the same months. Manual edits stay.`)) return;
        startTransition(async () => {
          const res = await restoreUploadAction(id, kind);
          if (res.error) toast.error(res.error);
          else toast.success(`Version ${id} restored`);
        });
      }}
    >
      Restore
    </Button>
  );
}
