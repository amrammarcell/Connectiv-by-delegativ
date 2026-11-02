import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <>
      <PageHeader title="Dashboard" description="Performa iklan sampai closing" />
      <ComingSoon sprint={6} items={["Biaya per closing dan ROAS per iklan", "Funnel dan alasan Lost", "Kecepatan respon"]} />
    </>
  );
}
