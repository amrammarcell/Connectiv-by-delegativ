import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/states";

export default function Loading() {
  return (
    <>
      <PageHeader title="Pengaturan" description="Waktu tanggapan, stage pipeline, user, dan peran" />
      <SettingsSkeleton />
    </>
  );
}
