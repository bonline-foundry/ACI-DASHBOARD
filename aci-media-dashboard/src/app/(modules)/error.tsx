"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ModuleError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-red-200 bg-white px-6 py-16 text-center" role="alert">
      <p className="font-medium text-stone-900">This page could not load</p>
      <p className="max-w-md text-sm text-stone-500">The database may be busy or offline. Your data is safe. Try again in a moment.</p>
      <Button variant="outline" onClick={() => retry()}>Try again</Button>
    </div>
  );
}
