"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SourceRow } from "@/server/competitors";
import { setOwnerAction } from "./actions";

export function SourcesTable({ rows, staleDays }: { rows: SourceRow[]; staleDays: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sources</CardTitle>
        <p className="text-xs text-gray-500">Who keeps each source up to date. A source turns stale after {staleDays} days without an update.</p>
      </CardHeader>
      <CardContent>
        <Table data-testid="sources-table">
          <TableHeader>
            <TableRow><TableHead>Source</TableHead><TableHead>Owner</TableHead><TableHead>Last updated</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => <SourceLine key={r.key} row={r} />)}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SourceLine({ row }: { row: SourceRow }) {
  const [owner, setOwner] = useState(row.ownerName ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = owner.trim() !== (row.ownerName ?? "");
  const save = () =>
    startTransition(async () => {
      const res = await setOwnerAction(row.key, owner);
      if (res.error) toast.error(res.error);
      else toast.success("Owner saved");
    });
  const when = row.lastUpdatedAt
    ? new Date(row.lastUpdatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Never";

  return (
    <TableRow data-testid={`source-${row.key}`}>
      <TableCell>{row.label}</TableCell>
      <TableCell>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Input aria-label={`${row.label} owner`} className="h-8 max-w-48" placeholder="Name" value={owner} onChange={(e) => setOwner(e.target.value)} />
          {dirty && <Button size="sm" type="submit" variant="outline" disabled={pending}>Save</Button>}
        </form>
      </TableCell>
      <TableCell className="whitespace-nowrap">{when}</TableCell>
      <TableCell>
        {row.stale
          ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{row.lastUpdatedAt ? `Stale · ${row.daysSince} days` : "No data yet"}</span>
          : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Up to date</span>}
      </TableCell>
    </TableRow>
  );
}
