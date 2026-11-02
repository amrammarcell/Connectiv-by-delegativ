import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Inbox" };

export default function Page() {
  return (
    <>
      <PageHeader title="Inbox" description="Mirroring chat WhatsApp CS · hanya baca" />
      <ComingSoon sprint={3} items={["Daftar percakapan realtime", "Status waktu tanggapan per chat", "Filter nomor WA, CS, stage, dan iklan asal"]} />
    </>
  );
}
