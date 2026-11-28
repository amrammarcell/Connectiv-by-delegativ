import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { CONTACT_COLUMNS, type InboxContact } from "@/components/inbox/types";
import { PageHeader } from "@/components/page-header";
import { requireWorkspace } from "@/lib/auth";
import { getInboxLookups } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kontak" };

export default function Page({ params }: PageProps<"/w/[slug]/kontak">) {
  return (
    <>
      <PageHeader title="Kontak" description="Semua kontak dari WhatsApp, tanpa duplikat" />
      <Suspense fallback={<p className="m-7 text-sm text-muted-foreground">Memuat kontak…</p>}>
        <ContactsLoader params={params} />
      </Suspense>
    </>
  );
}

async function ContactsLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireWorkspace(slug);
  const supabase = await createClient();
  const [{ stages, people }, { data }] = await Promise.all([
    getInboxLookups(slug),
    supabase
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("workspace_id", access.workspace.id)
      .order("pesan_terakhir_pada", { ascending: false, nullsFirst: false })
      .limit(1000)
      .returns<InboxContact[]>(),
  ]);

  return <ContactsTable slug={slug} contacts={data ?? []} stages={stages} people={people} />;
}
