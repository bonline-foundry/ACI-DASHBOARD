import * as XLSX from "xlsx";
import { TEMPLATES, type UploadKind } from "./templates";

export function buildTemplate(kind: UploadKind): Uint8Array {
  const def = TEMPLATES[kind];
  const ws = XLSX.utils.aoa_to_sheet([def.columns.map((c) => c.header)]);
  ws["!cols"] = def.columns.map((c) => ({ wch: Math.max(14, c.header.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, def.title.slice(0, 31));
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
