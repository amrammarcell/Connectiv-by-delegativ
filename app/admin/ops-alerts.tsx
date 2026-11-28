import { Button } from "@/components/ui/button";
import { ALERT_LABEL, CRON_STALE_HOURS, cronIsStale, type AlertJenis } from "@/lib/alerts";
import { notifierConfigured } from "@/lib/alerts-notifier";
import { createClient } from "@/lib/supabase/server";
import { dismissOpsAlert } from "./ops-actions";

type OpsAlert = {
  id: number;
  jenis: AlertJenis;
  judul: string;
  detail: string | null;
  jumlah: number;
  pertama_pada: string;
  terakhir_pada: string;
  email_terkirim: boolean;
};

const fmt = (v: string) =>
  new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

// Banner alert operasional di atas /admin. Pemanggil sudah memanggil
// requireSuperAdmin; RLS ops_alerts dan sync_runs juga hanya untuk Super Admin.
export async function OpsAlerts() {
  const supabase = await createClient();
  const [{ data: alerts }, { data: lastCron }, { data: anyCron }] = await Promise.all([
    supabase
      .from("ops_alerts")
      .select("id, jenis, judul, detail, jumlah, pertama_pada, terakhir_pada, email_terkirim")
      .is("selesai_pada", null)
      .order("terakhir_pada", { ascending: false })
      .returns<OpsAlert[]>(),
    supabase
      .from("sync_runs")
      .select("selesai")
      .eq("jenis", "cron_harian")
      .eq("status", "ok")
      .order("mulai", { ascending: false })
      .limit(1)
      .maybeSingle<{ selesai: string | null }>(),
    supabase.from("sync_runs").select("id").eq("jenis", "cron_harian").limit(1).maybeSingle<{ id: string }>(),
  ]);

  // Detak cron hanya dinilai setelah cron pernah berjalan dengan kode ini.
  const cronStale = Boolean(anyCron) && cronIsStale(lastCron?.selesai ?? null);
  const emailOn = notifierConfigured();
  const open = alerts ?? [];

  if (!open.length && !cronStale) {
    return (
      <p className="text-xs text-muted-foreground">
        Tidak ada alert operasional.{" "}
        {emailOn ? "Alert baru dikirim lewat email." : "Email alert belum dikonfigurasi (RESEND_API_KEY, ALERT_EMAIL_TO)."}
      </p>
    );
  }

  return (
    <section aria-labelledby="h-alert" role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5">
      <div className="border-b border-destructive/20 px-5 py-3">
        <h2 id="h-alert" className="text-base font-bold text-destructive">
          Alert operasional ({open.length + (cronStale ? 1 : 0)})
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Alert tertutup otomatis saat kondisinya pulih.{" "}
          {emailOn ? "Notifikasi email aktif." : "Email belum dikonfigurasi: alert hanya tampil di sini dan log server."}
        </p>
      </div>
      <ul className="divide-y divide-destructive/10">
        {cronStale && (
          <li className="px-5 py-3 text-sm">
            <p className="font-semibold">Cron harian tidak berjalan</p>
            <p className="text-muted-foreground">
              Run sukses terakhir: {lastCron?.selesai ? fmt(lastCron.selesai) : "belum ada"} (batas {CRON_STALE_HOURS} jam).
              Cek Vercel → Cron Jobs dan CRON_SECRET.
            </p>
          </li>
        )}
        {open.map((a) => (
          <li key={a.id} className="flex flex-col gap-2 px-5 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold">
                {a.judul} <span className="font-normal text-muted-foreground">· {ALERT_LABEL[a.jenis] ?? a.jenis}</span>
              </p>
              {a.detail && <p className="text-xs break-words whitespace-pre-line text-destructive">{a.detail}</p>}
              <p className="text-xs text-muted-foreground">
                Sejak {fmt(a.pertama_pada)}
                {a.jumlah > 1 && ` · terjadi ${a.jumlah.toLocaleString("id-ID")}x, terakhir ${fmt(a.terakhir_pada)}`}
                {a.email_terkirim && " · email terkirim"}
              </p>
            </div>
            <form action={dismissOpsAlert.bind(null, a.id)}>
              <Button type="submit" size="sm" variant="outline">
                Tandai selesai
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
