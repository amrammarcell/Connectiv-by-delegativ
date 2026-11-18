import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Peran } from "@/lib/types";
import { MembersManager, type Member } from "./members-manager";
import { getStages } from "@/lib/workspace-data";
import { StagesEditor } from "./stages-editor";
import { ThresholdsForm } from "./thresholds-form";

export const metadata: Metadata = { title: "Pengaturan" };

export default function Page({ params }: PageProps<"/w/[slug]/pengaturan">) {
  return (
    <>
      <PageHeader title="Pengaturan" description="Waktu tanggapan, stage pipeline, user, dan peran" />
      <Suspense fallback={<p className="m-7 text-sm text-muted-foreground">Memuat…</p>}>
        <MembersSection params={params} />
      </Suspense>
    </>
  );
}

async function MembersSection({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireWorkspace(slug);

  if (!access.canManage) {
    return (
      <p className="m-7 max-w-xl rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Hanya Owner workspace yang bisa mengelola user dan peran.
      </p>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("user_id, peran, dibuat_pada, profiles(email, nama)")
    .eq("workspace_id", access.workspace.id)
    .order("dibuat_pada")
    .returns<{ user_id: string; peran: Peran; profiles: { email: string; nama: string | null } }[]>();

  const stages = await getStages(slug);
  const members: Member[] = (data ?? []).map((m) => ({
    userId: m.user_id,
    peran: m.peran,
    email: m.profiles.email,
    nama: m.profiles.nama,
  }));

  return (
    <div className="flex flex-col">
      <div className="mx-7 mt-7 flex max-w-4xl flex-col gap-6">
        <ThresholdsForm
          slug={slug}
          kuning={access.workspace.batas_kuning_menit}
          merah={access.workspace.batas_merah_menit}
        />
        <StagesEditor slug={slug} stages={stages} />
      </div>
      <MembersManager slug={slug} members={members} currentUserId={access.user.id} />
    </div>
  );
}
