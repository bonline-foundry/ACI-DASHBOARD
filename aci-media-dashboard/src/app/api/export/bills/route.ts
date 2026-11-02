import { getDb } from "@/db/client";
import { todayDhaka } from "@/lib/month";
import { billsWorkbook, XLSX_TYPE } from "@/server/export";
import { parseBillFilter } from "@/server/filters";

export async function GET(req: Request) {
  const today = todayDhaka();
  const data = await billsWorkbook(getDb(), today, parseBillFilter(Object.fromEntries(new URL(req.url).searchParams)));
  return new Response(Buffer.from(data), {
    headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="aci-bills-${today}.xlsx"`, "Cache-Control": "no-store" },
  });
}
