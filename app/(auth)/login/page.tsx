import type { Metadata } from "next";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Brand tone="light" className="mb-8 justify-center" />
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-bold">Masuk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gunakan email dan password dari admin workspace Anda.
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
