import type { ReactNode } from "react";

export function EmptyState({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-stone-800">{title}</p>
      <p className="max-w-md text-sm text-stone-500">{message}</p>
      {children && <div className="mt-3 flex gap-2">{children}</div>}
    </div>
  );
}
