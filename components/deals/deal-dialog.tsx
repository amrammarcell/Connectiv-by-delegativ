"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { closeContact } from "@/app/actions/contacts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ALASAN_LABEL, ALASAN_LOST, formatRupiah, parseRupiah, type AlasanLost, type DealStatus } from "@/lib/deals";
import { cn } from "@/lib/utils";

export function DealDialog({
  slug,
  contactId,
  contactName,
  kind,
  onOpenChange,
  onDone,
}: {
  slug: string;
  contactId: string;
  contactName: string;
  // null = dialog tertutup.
  kind: DealStatus | null;
  onOpenChange: (open: boolean) => void;
  onDone?: (message: string) => void;
}) {
  const [nilai, setNilai] = useState("");
  const [alasan, setAlasan] = useState<AlasanLost | null>(null);
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const amountRef = useRef<HTMLInputElement>(null);

  // Dialog dibuka lewat state (bukan Dialog.Trigger), jadi kolom nilai difokuskan
  // manual setelah popup tampil.
  useEffect(() => {
    if (kind !== "closing") return;
    const id = setTimeout(() => amountRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [kind]);

  const amount = parseRupiah(nilai);
  const ready = kind === "closing" ? amount !== null : alasan !== null && (alasan !== "lainnya" || catatan.trim() !== "");

  function reset() {
    setNilai("");
    setAlasan(null);
    setCatatan("");
    setError(undefined);
  }

  function submit() {
    if (!kind) return;
    if (kind === "closing" && amount === null) return setError("Nilai transaksi wajib diisi.");
    if (kind === "lost" && !alasan) return setError("Pilih salah satu alasan.");
    startTransition(async () => {
      const result = await closeContact(
        slug,
        contactId,
        kind === "closing"
          ? { status: "closing", nilai: amount!, catatan: catatan || undefined }
          : { status: "lost", alasan: alasan!, catatan: catatan || undefined },
      );
      if (result.error) return setError(result.error);
      onDone?.(kind === "closing" ? `${contactName} ditandai Closing · ${formatRupiah(amount!)}` : `${contactName} ditandai Lost · ${ALASAN_LABEL[alasan!]}`);
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{kind === "lost" ? "Tandai Lost" : "Tandai Closing"}</DialogTitle>
          <DialogDescription>{contactName}</DialogDescription>
        </DialogHeader>

        <form
          id="deal-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {kind === "closing" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nilai">Nilai transaksi (wajib)</Label>
              <div className="flex h-11 items-center gap-2 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                <span className="font-semibold text-muted-foreground">Rp</span>
                <input
                  ref={amountRef}
                  id="nilai"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={amount ? amount.toLocaleString("id-ID") : nilai.replace(/\D/g, "")}
                  onChange={(e) => {
                    setNilai(e.target.value);
                    setError(undefined);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
                />
              </div>
            </div>
          )}

          {kind === "lost" && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Alasan Lost (wajib)</legend>
              {ALASAN_LOST.map((a) => (
                <label
                  key={a}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm",
                    alasan === a ? "border-primary bg-accent" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="alasan"
                    value={a}
                    checked={alasan === a}
                    onChange={() => {
                      setAlasan(a);
                      setError(undefined);
                    }}
                    className="size-4 accent-[#0f5e57]"
                  />
                  {ALASAN_LABEL[a]}
                </label>
              ))}
            </fieldset>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catatan">
              Catatan {kind === "lost" && alasan === "lainnya" ? "(wajib)" : "(opsional)"}
            </Label>
            <textarea
              id="catatan"
              rows={2}
              maxLength={500}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="submit"
            form="deal-form"
            disabled={pending || !ready}
            className={kind === "lost" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
          >
            {pending ? "Menyimpan…" : kind === "lost" ? "Simpan sebagai Lost" : "Simpan Closing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tombol Tandai Closing / Lost untuk header percakapan dan detail kontak.
export function DealButtons({
  slug,
  contactId,
  contactName,
  className,
}: {
  slug: string;
  contactId: string;
  contactName: string;
  className?: string;
}) {
  const [kind, setKind] = useState<DealStatus | null>(null);
  const [message, setMessage] = useState<string>();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button type="button" className="h-9" onClick={() => setKind("closing")}>
        Tandai Closing
      </Button>
      <Button type="button" variant="outline" className="h-9 text-destructive" onClick={() => setKind("lost")}>
        Tandai Lost
      </Button>
      {message && (
        <span role="status" className="text-[13px] font-semibold text-primary">
          {message}
        </span>
      )}
      <DealDialog
        slug={slug}
        contactId={contactId}
        contactName={contactName}
        kind={kind}
        onOpenChange={(open) => !open && setKind(null)}
        onDone={setMessage}
      />
    </div>
  );
}
