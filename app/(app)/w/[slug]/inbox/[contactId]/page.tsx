import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConversationView } from "@/components/inbox/conversation-view";
import { CONTACT_COLUMNS, MESSAGE_COLUMNS, type InboxContact, type InboxMessage } from "@/components/inbox/types";
import { getInboxLookups } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";

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
  const { access, stages, numbers, people, thresholds } = await getInboxLookups(slug);
  const supabase = await createClient();

  // RLS: kontak milik CS lain atau workspace lain tidak terbaca → 404.
  const { data: contact } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("id", contactId)
    .eq("workspace_id", access.workspace.id)
    .maybeSingle<InboxContact>();
  if (!contact) notFound();

  // 500 pesan terakhir, ditampilkan urut waktu.
  const { data: latest } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("contact_id", contact.id)
    .order("dikirim_pada", { ascending: false })
    .limit(500)
    .returns<InboxMessage[]>();

  return (
    <ConversationView
      key={contact.id}
      slug={slug}
      initialContact={contact}
      initialMessages={(latest ?? []).reverse()}
      stageName={contact.stage_id ? (stages[contact.stage_id] ?? null) : null}
      assigneeName={contact.assigned_to ? (people[contact.assigned_to] ?? null) : null}
      numberLabel={contact.wa_number_id_terakhir ? (numbers[contact.wa_number_id_terakhir] ?? null) : null}
      thresholds={thresholds}
    />
  );
}
