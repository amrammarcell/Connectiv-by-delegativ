import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Pengaturan" };

export default function Page() {
  return (
    <>
      <PageHeader title="Pengaturan" description="User, stage, nomor WhatsApp, dan batas waktu" />
      <ComingSoon sprint={1} items={["Undang Supervisor dan CS", "Ubah nama dan urutan stage", "Batas waktu kuning dan merah"]} />
    </>
  );
}
