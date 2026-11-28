import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Jalur 9B/9E: ukuran database dan tabel terbesar, dari fungsi SQL
// db_size_report (security definer, hanya Super Admin). Jumlah koneksi
// Realtime dipantau di dashboard Supabase (Realtime → Inspector/Reports).

type SizeRow = { nama: string; total_bytes: number; perkiraan_baris: number | null };

// Batas paket Supabase Free 500 MB; Pro 8 GB termasuk.
const FREE_LIMIT = 500 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

export async function DbSizeCard() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("db_size_report");
  const rows = (data ?? []) as SizeRow[];

  const total = rows.find((r) => r.nama === "(database)");
  const tables = rows.filter((r) => r.nama !== "(database)").slice(0, 8);

  return (
    <section aria-labelledby="h-db" className="rounded-xl border bg-card">
      <div className="border-b px-5 py-4">
        <h2 id="h-db" className="text-base font-bold">
          Ukuran database
        </h2>
        {total && (
          <p className="mt-1 text-sm text-muted-foreground">
            Total {formatBytes(total.total_bytes)} ·{" "}
            {Math.round((total.total_bytes / FREE_LIMIT) * 100).toLocaleString("id-ID")}% dari batas paket Free (500 MB)
          </p>
        )}
      </div>
      {error ? (
        <p role="alert" className="px-5 py-4 text-sm text-destructive">
          Ukuran database gagal dimuat: {error.message}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-5">Tabel</TableHead>
              <TableHead className="text-right">Perkiraan baris</TableHead>
              <TableHead className="px-5 text-right">Ukuran (dengan index)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tables.map((t) => (
              <TableRow key={t.nama}>
                <TableCell className="px-5 font-mono text-xs">{t.nama}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(t.perkiraan_baris ?? 0).toLocaleString("id-ID")}
                </TableCell>
                <TableCell className="px-5 text-right tabular-nums">{formatBytes(t.total_bytes)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
