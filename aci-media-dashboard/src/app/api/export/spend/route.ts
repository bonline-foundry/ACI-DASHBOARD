import { getDb } from "@/db/client";
import { todayDhaka } from "@/lib/month";
import { spendWorkbook, XLSX_TYPE } from "@/server/export";
import { parseSpendQuery } from "@/server/filters";

export async function GET(req: Request) {
  const q = parseSpendQuery(Object.fromEntries(new URL(req.url).searchParams), todayDhaka());
  const data = await spendWorkbook(getDb(), q);
  return new Response(Buffer.from(data), {
    headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="aci-spend-${q.month}.xlsx"`, "Cache-Control": "no-store" },
  });
}
