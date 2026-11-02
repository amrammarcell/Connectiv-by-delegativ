import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Pipeline" };

export default function Page() {
  return (
    <>
      <PageHeader title="Pipeline" description="Perjalanan setiap kontak sampai Closing atau Lost" />
      <ComingSoon sprint={4} items={["Kanban stage per workspace", "Assign kontak ke CS", "Dialog Closing dan Lost (Sprint 5)"]} />
    </>
  );
}
