import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/states";

export default function NotFound() {
  return (
    <EmptyState icon={SearchX} title="Data tidak ditemukan" className="m-3 rounded-xl border bg-card sm:m-7">
      <p>Kontak atau halaman ini tidak ada, atau Anda tidak punya akses (mis. kontak milik CS lain).</p>
      <Link href="." className="mt-3 inline-flex min-h-9 items-center rounded-lg border px-3 font-semibold text-secondary-foreground hover:bg-muted">
        Kembali
      </Link>
    </EmptyState>
  );
}
