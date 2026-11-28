import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConversationView } from "@/components/inbox/conversation-view";
import { CONTACT_COLUMNS, MESSAGE_COLUMNS, type InboxContact, type InboxMessage } from "@/components/inbox/types";
import { requireWorkspace } from "@/lib/auth";
import { getInboxLookups } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";
import { getMembers, getStages } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "Percakapan" };

export default function ConversationPage({ params }: PageProps<"/w/[slug]/inbox/[contactId]">) {
  return (
    <Suspense fallback={<div className="flex-1 bg-background p-6 text-sm text-muted-foreground">Memuat percakapan…</div>}>
      <Conversation params={params} />
    </Suspense>
  );
}

async function Conversation({ params }: { params: Promise<{ slug: string; contactId: string }> }) {
  const { slug, contactId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) notFound();
  const access = await requireWorkspace(slug);
  const supabase = await createClient();

  // Semua query paralel setelah akses terbukti. RLS: kontak milik CS lain atau
  // workspace lain tidak terbaca → 404, dan pesannya juga tidak terbaca.
  const [{ numbers, thresholds }, stages, members, { data: contact }, { data: latest }] = await Promise.all([
    getInboxLookups(slug),
    getStages(slug),
    getMembers(slug),
    supabase
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("id", contactId)
      .eq("workspace_id", access.workspace.id)
      .maybeSingle<InboxContact>(),
    // 500 pesan terakhir, ditampilkan urut waktu.
    supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("contact_id", contactId)
      .eq("workspace_id", access.workspace.id)
      .order("dikirim_pada", { ascending: false })
      .limit(500)
      .returns<InboxMessage[]>(),
  ]);
  if (!contact) notFound();

  return (
    <ConversationView
      key={contact.id}
      slug={slug}
      initialContact={contact}
      initialMessages={(latest ?? []).reverse()}
      stages={stages}
      members={members}
      canAssign={access.canManage || access.peran === "supervisor"}
      numberLabel={contact.wa_number_id_terakhir ? (numbers[contact.wa_number_id_terakhir] ?? null) : null}
      thresholds={thresholds}
    />
  );
}
