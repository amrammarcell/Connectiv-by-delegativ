"use client";

import { useState, useTransition } from "react";
import { assignContact, moveContactStage } from "@/app/actions/contacts";
import { PERAN_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Member, Stage } from "@/lib/workspace-data";

const selectClass =
  "h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError((await fn()).error);
    });
  return { pending, error, run };
}

export function AssignSelect({
  slug,
  contactId,
  value,
  members,
  canAssign,
  className,
}: {
  slug: string;
  contactId: string;
  value: string | null;
  members: Member[];
  canAssign: boolean;
  className?: string;
}) {
  const { pending, error, run } = useAction();
  const current = members.find((m) => m.id === value);

  if (!canAssign) {
    return <span className={cn("text-sm", className)}>{current?.nama ?? "Belum di-assign"}</span>;
  }
  return (
    <span className={cn("flex flex-col gap-1", className)}>
      <select
        aria-label="Assign ke CS"
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => run(() => assignContact(slug, contactId, e.target.value || null))}
        className={selectClass}
      >
        <option value="">Belum di-assign</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nama} · {PERAN_LABEL[m.peran]}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-xs font-medium text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

export function StageSelect({
  slug,
  contactId,
  value,
  stages,
  className,
}: {
  slug: string;
  contactId: string;
  value: string | null;
  stages: Stage[];
  className?: string;
}) {
  const { pending, error, run } = useAction();
  const current = stages.find((s) => s.id === value);

  // Kontak yang sudah Closing/Lost tidak dipindah dari sini.
  if (current && current.tipe !== "normal") {
    return (
      <span
        className={cn(
          "w-fit rounded-lg px-2.5 py-1.5 text-[13px] font-semibold",
          current.tipe === "closing" ? "bg-[#ecfdf3] text-[#05603a]" : "bg-[#fef3f2] text-[#b42318]",
          className,
        )}
      >
        {current.nama}
      </span>
    );
  }
  return (
    <span className={cn("flex flex-col gap-1", className)}>
      <select
        aria-label="Stage"
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => run(() => moveContactStage(slug, contactId, e.target.value))}
        className={selectClass}
      >
        {stages
          .filter((s) => s.tipe === "normal")
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.nama}
            </option>
          ))}
      </select>
      {error && (
        <span role="alert" className="text-xs font-medium text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
