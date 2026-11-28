import { PageHeader } from "@/components/page-header";
import { PipelineSkeleton } from "@/components/states";

export default function Loading() {
  return (
    <>
      <PageHeader title="Pipeline" description="Perjalanan setiap kontak sampai Closing atau Lost" />
      <PipelineSkeleton />
    </>
  );
}
