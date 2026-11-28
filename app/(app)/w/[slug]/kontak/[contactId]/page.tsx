import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Megaphone, MessagesSquare } from "lucide-react";
import { AssignSelect, StageSelect } from "@/components/contacts/contact-controls";
import { ContactNotes, type Note } from "@/components/contacts/contact-notes";
import { DealButtons } from "@/components/deals/deal-dialog";
import { CONTACT_COLUMNS, type InboxContact } from "@/components/inbox/types";
import { ALASAN_LABEL, DEAL_COLUMNS, formatRupiah, type Deal } from "@/lib/deals";
import { SettingsSkeleton } from "@/components/states";
import { formatDateTime, formatPhone } from "@/lib/format";
import { adLabel } from "@/lib/inbox-filters";
import { requireWorkspace } from "@/lib/auth";
import { getInboxLookups } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";
import { getMembers, getStages } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "Detail kontak" };

export default function Page({ params }: PageProps<"/w/[slug]/kontak/[contactId]">) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <ContactDetail params={params} />
    </Suspense>
  );
}

async function ContactDetail({ params }: { params: Promise<{ slug: string; contactId: string }> }) {
  const { slug, contactId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) notFound();
  const access = await requireWorkspace(slug);
  const supabase = await createClient();
  const ws = access.workspace.id;

  // Semua query paralel setelah akses terbukti. Catatan, riwayat, dan deal
  // memakai RLS "kontak yang terlihat", jadi kosong jika kontaknya tidak
  // terbaca; halaman tetap 404 di bawah.
  const [
    { stages: stageNames, people, numbers, adNames },
    stages,
    members,
    { data: contact, error },
    { data: notes },
    { data: history },
    { data: deals },
  ] = await Promise.all([
    getInboxLookups(slug),
    getStages(slug),
    getMembers(slug),
    supabase
      .from("contacts")
      .select(`${CONTACT_COLUMNS}, ctwa_clid, referral_source_url, referral_pada, dibuat_pada`)
      .eq("id", contactId)
      .eq("workspace_id", ws)
      .maybeSingle<InboxContact & { ctwa_clid: string | null; referral_source_url: string | null; referral_pada: string | null; dibuat_pada: string }>(),
    supabase
      .from("contact_notes")
      .select("id, isi, pada, oleh_user")
      .eq("contact_id", contactId)
      .eq("workspace_id", ws)
      .order("pada", { ascending: false })
      .returns<Note[]>(),
    supabase
      .from("stage_history")
      .select("id, dari_stage, ke_stage, oleh_user, pada")
      .eq("contact_id", contactId)
      .eq("workspace_id", ws)
      .order("pada", { ascending: false })
      .limit(50)
      .returns<{ id: string; dari_stage: string | null; ke_stage: string | null; oleh_user: string | null; pada: string }[]>(),
    supabase
      .from("deals")
      .select(DEAL_COLUMNS)
      .eq("contact_id", contactId)
      .eq("workspace_id", ws)
      .order("pada", { ascending: false })
      .returns<Deal[]>(),
  ]);
  if (error) throw new Error(`contacts: ${error.message}`);
  if (!contact) notFound();

  const canAssign = access.canManage || access.peran === "supervisor";
  const name = contact.nama ?? formatPhone(contact.nomor_hp);

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-3 py-3 sm:px-7 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/w/${slug}/kontak`}
            aria-label="Kembali ke daftar kontak"
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-[22px]">{name}</h1>
            <p className="text-[13px] text-muted-foreground">
              {formatPhone(contact.nomor_hp)}
              {contact.wa_number_id_terakhir && numbers[contact.wa_number_id_terakhir]
                ? ` · via ${numbers[contact.wa_number_id_terakhir]}`
                : ""}
            </p>
          </div>
        </div>
        <Link
          href={`/w/${slug}/inbox/${contact.id}`}
          className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-semibold text-secondary-foreground hover:bg-muted"
        >
          <MessagesSquare aria-hidden className="size-4" />
          Buka percakapan
        </Link>
      </header>

      <div className="grid gap-4 p-3 sm:gap-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-5">
          <section aria-labelledby="h-status" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <h2 id="h-status" className="text-base font-bold">
              Status
            </h2>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Stage</span>
              <StageSelect slug={slug} contactId={contact.id} value={contact.stage_id} stages={stages} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Di-assign ke</span>
              <AssignSelect
                slug={slug}
                contactId={contact.id}
                value={contact.assigned_to}
                members={members}
                canAssign={canAssign}
              />
            </div>
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              Kontak dibuat {formatDateTime(contact.dibuat_pada)}
            </p>
            {stages.find((s) => s.id === contact.stage_id)?.tipe === "normal" && (
              <DealButtons slug={slug} contactId={contact.id} contactName={name} className="border-t pt-4" />
            )}
          </section>

          {!!deals?.length && (
            <section aria-labelledby="h-deal" className="rounded-xl border bg-card p-5">
              <h2 id="h-deal" className="text-base font-bold">
                Riwayat deal
              </h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {deals.map((d) => (
                  <li key={d.id} className="flex flex-col text-sm">
                    <span className={d.status === "closing" ? "font-semibold text-[#05603a]" : "font-semibold text-[#b42318]"}>
                      {d.status === "closing" ? `Closing · ${formatRupiah(d.nilai ?? 0)}` : `Lost · ${ALASAN_LABEL[d.alasan_lost!]}`}
                    </span>
                    {d.catatan && <span className="text-muted-foreground">{d.catatan}</span>}
                    <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                      {d.oleh_user ? (people[d.oleh_user] ?? "Pengguna") : "Sistem"} · {formatDateTime(d.pada)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="h-atribusi" className="flex gap-3 rounded-xl border bg-card p-5">
            <span
              className={
                contact.sumber === "ctwa"
                  ? "flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eef4ff] text-[#1d4b8f]"
                  : "flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground"
              }
            >
              <Megaphone aria-hidden className="size-[18px]" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id="h-atribusi" className="text-xs font-semibold text-muted-foreground">
                Atribusi (first-touch)
              </h2>
              {contact.sumber === "ctwa" ? (
                <>
                  <span className="text-sm font-semibold">{adLabel(contact.ad_id, contact.referral_headline, adNames)}</span>
                  <span className="text-xs break-all text-muted-foreground">
                    ID iklan {contact.ad_id}
                    {contact.ctwa_clid ? " · ctwa_clid tercatat" : ""}
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold">Organik / Tidak diketahui</span>
              )}
            </div>
          </section>

          <section aria-labelledby="h-riwayat" className="rounded-xl border bg-card p-5">
            <h2 id="h-riwayat" className="text-base font-bold">
              Riwayat stage
            </h2>
            <ol className="mt-3 flex flex-col gap-2.5">
              {(history ?? []).map((h) => (
                <li key={h.id} className="flex flex-col text-sm">
                  <span>
                    {h.dari_stage ? `${stageNames[h.dari_stage] ?? "?"} → ` : "Masuk ke "}
                    <span className="font-semibold">{h.ke_stage ? (stageNames[h.ke_stage] ?? "?") : "—"}</span>
                  </span>
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {h.oleh_user ? (people[h.oleh_user] ?? "Pengguna") : "Sistem"} · {formatDateTime(h.pada)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <ContactNotes
          slug={slug}
          contactId={contact.id}
          notes={notes ?? []}
          people={people}
          currentUserId={access.user.id}
          isOwner={access.canManage}
        />
      </div>
    </div>
  );
}
