import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Peran } from "@/lib/types";
import { MembersManager, type Member } from "./members-manager";

export const metadata: Metadata = { title: "Pengaturan" };

export default function Page({ params }: PageProps<"/w/[slug]/pengaturan">) {
  return (
    <>
      <PageHeader title="Pengaturan" description="User dan peran di workspace ini" />
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

  const members: Member[] = (data ?? []).map((m) => ({
    userId: m.user_id,
    peran: m.peran,
    email: m.profiles.email,
    nama: m.profiles.nama,
  }));

  return <MembersManager slug={slug} members={members} currentUserId={access.user.id} />;
}
