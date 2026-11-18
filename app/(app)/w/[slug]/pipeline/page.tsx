import type { Metadata } from "next";
import { Suspense } from "react";
import { CONTACT_COLUMNS, type InboxContact } from "@/components/inbox/types";
import { PageHeader } from "@/components/page-header";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { requireWorkspace } from "@/lib/auth";
import { DEAL_COLUMNS, type Deal } from "@/lib/deals";
import { createClient } from "@/lib/supabase/server";
import { getMembers, getStages } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "Pipeline" };

export default function Page({ params }: PageProps<"/w/[slug]/pipeline">) {
  return (
    <>
      <PageHeader title="Pipeline" description="Perjalanan setiap kontak sampai Closing atau Lost" />
      <Suspense fallback={<p className="m-7 text-sm text-muted-foreground">Memuat pipeline…</p>}>
        <PipelineLoader params={params} />
      </Suspense>
    </>
  );
}

async function PipelineLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireWorkspace(slug);
  const supabase = await createClient();
  const [stages, members, contacts, deals] = await Promise.all([
    getStages(slug),
    getMembers(slug),
    supabase
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("workspace_id", access.workspace.id)
      .order("pesan_terakhir_pada", { ascending: false, nullsFirst: false })
      .limit(500)
      .returns<InboxContact[]>(),
    supabase
      .from("deals")
      .select(DEAL_COLUMNS)
      .eq("workspace_id", access.workspace.id)
      .order("pada", { ascending: false })
      .limit(1000)
      .returns<Deal[]>(),
  ]);

  return (
    <PipelineBoard
      slug={slug}
      workspaceId={access.workspace.id}
      stages={stages}
      members={members}
      initialContacts={contacts.data ?? []}
      initialDeals={deals.data ?? []}
      thresholds={{ kuning: access.workspace.batas_kuning_menit, merah: access.workspace.batas_merah_menit }}
      canFilterByCs={access.canManage || access.peran === "supervisor"}
    />
  );
}
