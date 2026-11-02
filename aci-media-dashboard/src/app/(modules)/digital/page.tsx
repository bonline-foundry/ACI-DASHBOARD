import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/data/empty-state";

export default function Page() {
  return (
    <>
      <PageHeader title="Digital Data" subtitle="Costs with VAT" />
      <EmptyState title="Not built yet" message="This module is added in a later build plan." />
    </>
  );
}
