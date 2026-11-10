import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { listMyWorkspaces, requireUser } from "@/lib/auth";
import { PERAN_LABEL } from "@/lib/types";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <Brand tone="light" className="mb-8 justify-center" />
        <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Memuat…</p>}>
          <WorkspaceRouter />
        </Suspense>
      </div>
    </main>
  );
}

async function WorkspaceRouter() {
  const user = await requireUser();
  const workspaces = await listMyWorkspaces();

  if (workspaces.length === 1) redirect(`/w/${workspaces[0].slug}/inbox`);
  if (workspaces.length === 0 && user.isSuperAdmin) redirect("/admin");

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      {workspaces.length === 0 ? (
        <>
          <h1 className="text-xl font-bold">Belum ada akses workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Akun {user.email} belum terdaftar di workspace mana pun. Minta Owner workspace atau
            admin Delegativ untuk menambahkan Anda.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold">Pilih workspace</h1>
          <ul className="mt-4 flex flex-col gap-2">
            {workspaces.map((w) => (
              <li key={w.slug}>
                <Link
                  href={`/w/${w.slug}/inbox`}
                  className="flex min-h-12 items-center justify-between rounded-xl border px-4 font-semibold hover:bg-accent"
                >
                  {w.nama}
                  <span className="text-xs font-medium text-muted-foreground">{PERAN_LABEL[w.peran]}</span>
                </Link>
              </li>
            ))}
          </ul>
          {user.isSuperAdmin && (
            <Link href="/admin" className="mt-4 inline-block text-sm font-semibold">
              Buka halaman Admin
            </Link>
          )}
        </>
      )}
      <form action={signOut} className="mt-6">
        <Button type="submit" variant="outline" className="h-10 w-full">
          Keluar
        </Button>
      </form>
    </div>
  );
}
