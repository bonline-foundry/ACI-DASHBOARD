import { ActionForm } from "@/components/data/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMillion } from "@/lib/money";
import { formatMonth } from "@/lib/month";
import type { BudgetLevel } from "@/lib/rules";
import { cn } from "@/lib/utils";
import type { BudgetRow } from "@/server/plan";
import { setBudgetAction } from "./actions";

const LEVEL: Record<BudgetLevel, { label: string; className: string }> = {
  ok: { label: "On track", className: "bg-emerald-100 text-emerald-800" },
  orange: { label: "Near limit", className: "bg-orange-100 text-orange-800" },
  red: { label: "Over budget", className: "bg-red-100 text-red-800" },
  "no-budget": { label: "No budget set", className: "bg-gray-100 text-gray-600" },
};

export function BudgetPanel({ month, rows }: { month: string; rows: BudgetRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget, plan and actual spend · {formatMonth(month)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table data-testid="budget-table">
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Budget (M)</TableHead>
                <TableHead className="text-right">Planned (M)</TableHead>
                <TableHead className="text-right">Actual spend (M)</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.brandId} data-testid={`budget-${r.brandName}`}>
                  <TableCell className="font-medium">{r.brandName}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.budget === null ? "–" : formatMillion(r.budget)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.plannedOverBudget && "font-semibold text-red-700")}>
                    {formatMillion(r.planned)}
                    {r.plannedOverBudget && <span className="sr-only"> (plan is over budget)</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMillion(r.actual)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.pct === null ? "–" : `${Math.round(r.pct)}%`}</TableCell>
                  <TableCell>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", LEVEL[r.level].className)}>{LEVEL[r.level].label}</span>
                    {r.plannedOverBudget && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">Plan over budget</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-gray-500">
          Planned cost is split across months by campaign days. Actual spend comes from the Spend page. Used % compares actual spend with budget.
        </p>

        <ActionForm action={setBudgetAction} className="flex flex-wrap items-end gap-2 border-t border-gray-200 pt-4">
          <input type="hidden" name="month" value={month} />
          <label className="flex flex-col gap-1 text-sm">
            Brand
            <select name="brandId" aria-label="Budget brand" className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm" required>
              {rows.map((r) => <option key={r.brandId} value={r.brandId}>{r.brandName}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Budget for {formatMonth(month)} (BDT)
            <Input name="amount" aria-label="Budget amount" inputMode="numeric" placeholder="25,000,000" className="w-44" required />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Reason
            <Input name="reason" aria-label="Budget reason" placeholder="Why is this budget set or changed?" required />
          </label>
          <Button type="submit" variant="outline">Set budget</Button>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
