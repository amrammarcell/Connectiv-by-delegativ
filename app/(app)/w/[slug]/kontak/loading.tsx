import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/states";

export default function Loading() {
  return (
    <>
      <PageHeader title="Kontak" description="Semua kontak dari WhatsApp, tanpa duplikat" />
      <TableSkeleton />
    </>
  );
}
