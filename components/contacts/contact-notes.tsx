"use client";

import { useRef, useState, useTransition } from "react";
import { addContactNote, deleteContactNote } from "@/app/actions/contacts";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export type Note = { id: string; isi: string; pada: string; oleh_user: string | null };

export function ContactNotes({
  slug,
  contactId,
  notes,
  people,
  currentUserId,
  isOwner,
}: {
  slug: string;
  contactId: string;
  notes: Note[];
  people: Record<string, string>;
  currentUserId: string;
  isOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section aria-labelledby="h-catatan" className="rounded-xl border bg-card p-5">
      <h2 id="h-catatan" className="text-base font-bold">
        Catatan internal
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Hanya terlihat oleh tim di Connectiv, tidak dikirim ke pelanggan.</p>
      <form
        ref={formRef}
        className="mt-4 flex flex-col gap-2"
        action={(formData) =>
          startTransition(async () => {
            const result = await addContactNote(slug, contactId, String(formData.get("isi") ?? ""));
            setError(result.error);
            if (!result.error) formRef.current?.reset();
          })
        }
      >
        <label htmlFor="isi" className="sr-only">
          Catatan baru
        </label>
        <textarea
          id="isi"
          name="isi"
          rows={3}
          maxLength={2000}
          required
          placeholder="Mis. minta dikirimi katalog warna, follow up Jumat"
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} className="h-9">
            {pending ? "Menyimpan…" : "Simpan catatan"}
          </Button>
          {error && (
            <span role="alert" className="text-sm font-medium text-destructive">
              {error}
            </span>
          )}
        </div>
      </form>

      <ul className="mt-5 flex flex-col gap-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg bg-muted/60 px-3 py-2.5">
            <p className="text-sm whitespace-pre-line">{n.isi}</p>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span suppressHydrationWarning>
                {(n.oleh_user && people[n.oleh_user]) ?? "Pengguna"} · {formatDateTime(n.pada)}
              </span>
              {(n.oleh_user === currentUserId || isOwner) && (
                <button
                  type="button"
                  disabled={pending}
                  className="font-semibold text-destructive hover:underline"
                  onClick={() => {
                    if (confirm("Hapus catatan ini?")) {
                      startTransition(async () => setError((await deleteContactNote(slug, n.id)).error));
                    }
                  }}
                >
                  Hapus
                </button>
              )}
            </div>
          </li>
        ))}
        {!notes.length && <li className="text-sm text-muted-foreground">Belum ada catatan.</li>}
      </ul>
    </section>
  );
}
