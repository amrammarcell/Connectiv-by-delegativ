import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Kontak" };

export default function Page() {
  return (
    <>
      <PageHeader title="Kontak" description="Semua kontak dari WhatsApp, tanpa duplikat" />
      <ComingSoon sprint={4} items={["Tabel dan detail kontak", "Catatan internal", "Atribusi iklan asal"]} />
    </>
  );
}
