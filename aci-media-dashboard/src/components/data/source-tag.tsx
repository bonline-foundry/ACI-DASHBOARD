const LABEL = { upload: "Uploaded", manual: "Manual entry", mixed: "Uploaded and manual edit" } as const;

export function SourceTag({
  source,
  updatedAt,
  label,
}: {
  source: "upload" | "manual" | "mixed" | null;
  updatedAt: string | null;
  label?: string;
}) {
  const when = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "never";
  return (
    <p className="text-xs text-gray-500">
      {label ? `${label} · ` : "Source: "}
      {source ? LABEL[source] : "No data yet"} · Updated {when}
    </p>
  );
}
