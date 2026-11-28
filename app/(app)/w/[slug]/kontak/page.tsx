import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactsTable, CONTACTS_PAGE_SIZE, parseContactFilters } from "@/components/contacts/contacts-table";
import { CONTACT_COLUMNS, type InboxContact } from "@/components/inbox/types";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/states";
import { searchDigits } from "@/lib/inbox-filters";
import { requireWorkspace } from "@/lib/auth";
import { getInboxLookups } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";
import { getMembers, getStages } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "Kontak" };

export default function Page({ params, searchParams }: PageProps<"/w/[slug]/kontak">) {
  return (
    <>
      <PageHeader title="Kontak" description="Semua kontak dari WhatsApp, tanpa duplikat" />
      <Suspense fallback={<TableSkeleton />}>
        <ContactsLoader params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// Buang karakter yang punya arti khusus di ilike / filter or() PostgREST.
const safeTerm = (s: string) => s.replace(/[%_\\"(),*]/g, " ").trim();

async function ContactsLoader({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const filters = parseContactFilters(query);
  const access = await requireWorkspace(slug);
  const supabase = await createClient();

  let q = supabase.from("contacts").select(CONTACT_COLUMNS, { count: "exact" }).eq("workspace_id", access.workspace.id);
  if (filters.sumber) q = q.eq("sumber", filters.sumber);
  if (filters.stage) q = q.eq("stage_id", filters.stage);
  if (filters.cs === "tanpa") q = q.is("assigned_to", null);
  else if (filters.cs) q = q.eq("assigned_to", filters.cs);
  if (filters.iklan) q = q.eq("ad_id", filters.iklan);
  if (filters.q) {
    const digits = searchDigits(filters.q);
    const term = safeTerm(filters.q);
    const parts = [term && `nama.ilike."*${term}*"`, digits && `nomor_hp.like.*${digits}*`].filter(Boolean);
    if (parts.length) q = q.or(parts.join(","));
  }
  const from = (filters.hal - 1) * CONTACTS_PAGE_SIZE;
  // Lookup (sebagian besar dari cache) dan halaman kontak dibaca paralel.
  const [{ stages, people, adNames, adIds }, stageList, members, { data, count, error }] = await Promise.all([
    getInboxLookups(slug),
    getStages(slug),
    getMembers(slug),
    q
      .order("pesan_terakhir_pada", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(from, from + CONTACTS_PAGE_SIZE - 1)
      .returns<InboxContact[]>(),
  ]);
  if (error) throw new Error(`contacts: ${error.message}`);

  return (
    <ContactsTable
      slug={slug}
      contacts={data ?? []}
      total={count ?? 0}
      filters={filters}
      stages={stages}
      stageOptions={stageList.map((s) => ({ id: s.id, nama: s.nama }))}
      people={people}
      members={access.canManage || access.peran === "supervisor" ? members : []}
      adNames={adNames}
      adIds={adIds}
    />
  );
}
