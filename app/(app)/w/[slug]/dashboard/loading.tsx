import { PageHeader } from "@/components/page-header";
import { DashboardSkeleton } from "@/components/states";

export default function Loading() {
  return (
    <>
      <PageHeader title="Dashboard" description="Performa iklan sampai closing" />
      <DashboardSkeleton />
    </>
  );
}
