"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

// Tampilan error untuk error.tsx di halaman workspace. Sidebar/menu tetap
// tampil karena boundary berada di bawah layout workspace.
export function RouteError({ error, retry, title = "Halaman gagal dimuat" }: { error: unknown; retry: () => void; title?: string }) {
  const { slug } = useParams<{ slug?: string }>();
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  return (
    <div role="alert" className="m-3 flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-10 text-center sm:m-7">
      <span className="flex size-11 items-center justify-center rounded-full bg-[#fef3f2] text-[#b42318]">
        <TriangleAlert aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Biasanya karena koneksi terputus sebentar. Coba lagi; jika masih gagal, hubungi admin Delegativ
          {digest ? ` dan sebutkan kode ${digest}` : ""}.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
        >
          <RotateCcw aria-hidden className="size-4" />
          Coba lagi
        </button>
        {slug && (
          <Link
            href={`/w/${slug}/inbox`}
            className="inline-flex min-h-10 items-center rounded-[10px] border px-4 text-[13px] font-semibold text-secondary-foreground hover:bg-muted"
          >
            Ke Inbox
          </Link>
        )}
      </div>
    </div>
  );
}
