import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { requireUser } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Akun" };

export default function AkunPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Brand tone="light" className="mb-8 justify-center" />
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-bold">Ganti password</h1>
          <Suspense>
            <AccountEmail />
          </Suspense>
          <ChangePasswordForm />
        </div>
        <Link href="/" className="mt-4 block text-center text-sm font-semibold">
          Kembali
        </Link>
      </div>
    </main>
  );
}

async function AccountEmail() {
  const user = await requireUser();
  return <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>;
}
