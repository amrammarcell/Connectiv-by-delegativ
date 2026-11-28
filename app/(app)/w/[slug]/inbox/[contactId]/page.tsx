import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConversationView, MESSAGE_PAGE_SIZE } from "@/components/inbox/conversation-view";
import { CONTACT_COLUMNS, MESSAGE_COLUMNS, type InboxContact, type InboxMessage } from "@/components/inbox/types";
import { ConversationSkeleton } from "@/components/states";
import { adLabel } from "@/lib/inbox-filters";
import { getInboxLookups } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";
import { getMembers, getStages } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "Percakapan" };

export default function ConversationPage({ params }: PageProps<"/w/[slug]/inbox/[contactId]">) {
  return (
    <Suspense fallback={<ConversationSkeleton />}>
      <Conversation params={params} />
    </Suspense>
  );
}

async function Conversation({ params }: { params: Promise<{ slug: string; contactId: string }> }) {
  const { slug, contactId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) notFound();
  const [{ access, numbers, thresholds, adNames }, stages, members] = await Promise.all([
    getInboxLookups(slug),
    getStages(slug),
    getMembers(slug),
  ]);
  const supabase = await createClient();

  // RLS: kontak milik CS lain atau workspace lain tidak terbaca → 404.
  const { data: contact, error } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("id", contactId)
    .eq("workspace_id", access.workspace.id)
    .maybeSingle<InboxContact>();
  if (error) throw new Error(`contacts: ${error.message}`);
  if (!contact) notFound();

  // Halaman pesan terbaru; pesan lama dimuat dari klien ("Muat pesan lama").
  // Satu baris ekstra untuk tahu apakah masih ada pesan lebih lama.
  const { data: latest, error: messagesError } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("contact_id", contact.id)
    .order("dikirim_pada", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE + 1)
    .returns<InboxMessage[]>();
  if (messagesError) throw new Error(`messages: ${messagesError.message}`);
  const rows = latest ?? [];

  return (
    <ConversationView
      key={contact.id}
      slug={slug}
      userId={access.user.id}
      initialContact={contact}
      initialMessages={rows.slice(0, MESSAGE_PAGE_SIZE).reverse()}
      initialHasOlder={rows.length > MESSAGE_PAGE_SIZE}
      stages={stages}
      members={members}
      canAssign={access.canManage || access.peran === "supervisor"}
      numberLabel={contact.wa_number_id_terakhir ? (numbers[contact.wa_number_id_terakhir] ?? null) : null}
      adName={contact.sumber === "ctwa" ? adLabel(contact.ad_id, contact.referral_headline, adNames) : null}
      thresholds={thresholds}
    />
  );
}
