import Link from "next/link";
import { Brand } from "@/components/brand";
import { COMPANY } from "@/lib/company";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-card">
      <header className="border-b px-4 py-4 sm:px-8">
        <Link href="/" aria-label="Connectiv">
          <Brand tone="light" />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
        <article className="flex flex-col gap-4 text-[15px] leading-relaxed text-foreground [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
          {children}
        </article>
      </main>
      <footer className="border-t px-4 py-6 text-sm text-muted-foreground sm:px-8">
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/kebijakan-privasi">Kebijakan Privasi</Link>
          <Link href="/syarat-ketentuan">Syarat &amp; Ketentuan</Link>
          <Link href="/hapus-data">Penghapusan Data</Link>
        </nav>
        <p className="mt-3">
          {COMPANY.product} oleh {COMPANY.brand} · {COMPANY.legalName}
        </p>
      </footer>
    </div>
  );
}
