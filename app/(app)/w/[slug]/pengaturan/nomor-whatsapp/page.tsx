import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { requireWorkspace } from "@/lib/auth";
import { techProviderEnv } from "@/lib/env.server";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { numberWarnings } from "@/lib/wa-health";
import { syncSummary } from "@/lib/whatsapp/number-status";
import { getMembers } from "@/lib/workspace-data";
import { EmbeddedSignupButton } from "./embedded-signup-button";
import { NumbersTable, type NumberRowView } from "./numbers-table";

export const metadata: Metadata = { title: "Nomor WhatsApp" };

export default function Page({ params }: PageProps<"/w/[slug]/pengaturan/nomor-whatsapp">) {
  return (
    <>
      <PageHeader title="Nomor WhatsApp" description="Nomor sales yang tersambung, CS pemilik, dan statusnya" />
      <Suspense fallback={<p className="m-7 text-sm text-muted-foreground">Memuat…</p>}>
        <NumbersSection params={params} />
      </Suspense>
    </>
  );
}

type NumberDb = {
  id: string;
  label: string;
  nomor_tampil: string | null;
  cs_pemilik: string | null;
  status: string;
  status_alasan: string | null;
  terakhir_terima_pesan: string | null;
  tersambung_pada: string;
  sumber: string;
  sync_kontak_status: string | null;
  sync_riwayat_status: string | null;
  sync_batas: string | null;
  sync_error: string | null;
};

async function NumbersSection({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireWorkspace(slug);

  if (!access.canManage) {
    return (
      <p className="m-7 max-w-xl rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Hanya Owner workspace yang bisa mengelola nomor WhatsApp.
      </p>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_numbers")
    .select(
      "id, label, nomor_tampil, cs_pemilik, status, status_alasan, terakhir_terima_pesan, tersambung_pada, sumber, sync_kontak_status, sync_riwayat_status, sync_batas, sync_error",
    )
    .eq("workspace_id", access.workspace.id)
    .order("dibuat_pada")
    .returns<NumberDb[]>();
  const numbers = data ?? [];

  // Balasan CS terakhir dari aplikasi per nomor (peringatan 14 hari Coexistence).
  const lastReplies = await Promise.all(
    numbers.map(async (n) => {
      const { data: m } = await supabase
        .from("messages")
        .select("dikirim_pada")
        .eq("wa_number_id", n.id)
        .eq("arah", "keluar")
        .eq("dari_history", false)
        .order("dikirim_pada", { ascending: false })
        .limit(1)
        .maybeSingle<{ dikirim_pada: string }>();
      return m?.dikirim_pada ?? null;
    }),
  );

  const rows: NumberRowView[] = numbers.map((n, i) => ({
    id: n.id,
    label: n.label,
    nomorTampil: n.nomor_tampil,
    csPemilik: n.cs_pemilik,
    status: n.status,
    sumber: n.sumber,
    pesanTerakhir: n.terakhir_terima_pesan ? formatDateTime(n.terakhir_terima_pesan) : null,
    warnings: numberWarnings({ ...n, terakhir_balasan_cs: lastReplies[i] ?? null }),
    sync: syncSummary(n),
  }));

  const members = (await getMembers(slug)).map((m) => ({ userId: m.id, nama: m.nama }));
  const env = techProviderEnv();

  return (
    <div className="m-7 flex max-w-4xl flex-col gap-6">
      <Link href={`/w/${slug}/pengaturan`} className="text-sm font-medium text-primary hover:underline">
        ← Kembali ke Pengaturan
      </Link>

      <section aria-labelledby="h-nomor" className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 id="h-nomor" className="text-base font-bold">
              Nomor tersambung ({rows.length})
            </h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              CS tetap membalas dari aplikasi WhatsApp Business di HP. Chat baru dari nomor ini otomatis diberikan ke
              CS pemiliknya.
            </p>
          </div>
          {env ? (
            <EmbeddedSignupButton
              slug={slug}
              appId={env.META_APP_ID}
              configId={env.META_EMBEDDED_SIGNUP_CONFIG_ID}
              graphVersion={env.META_GRAPH_VERSION}
            />
          ) : (
            <p className="max-w-xs text-right text-xs text-muted-foreground">
              Penyambungan nomor sendiri belum aktif. Hubungi Delegativ untuk menambah nomor.
            </p>
          )}
        </div>
        <NumbersTable slug={slug} numbers={rows} members={members} />
      </section>
    </div>
  );
}
