import { Button } from "@/components/ui/button";

export function FilterBar({
  month,
  brands,
  brandId,
  keep = {},
}: {
  month: string;
  brands: { id: number; name: string }[];
  brandId?: number;
  keep?: Record<string, string>;
}) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2" aria-label="Filters">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="flex items-center gap-1 text-sm text-stone-600">
        Month
        <input type="month" name="month" defaultValue={month} className="h-8 rounded-lg border border-stone-300 bg-white px-2 text-sm" />
      </label>
      <label className="flex items-center gap-1 text-sm text-stone-600">
        Brand
        <select name="brand" defaultValue={brandId ? String(brandId) : ""} className="h-8 rounded-lg border border-stone-300 bg-white px-2 text-sm">
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline" size="sm">Apply</Button>
      <span className="text-xs text-stone-500">Costs with VAT</span>
    </form>
  );
}
