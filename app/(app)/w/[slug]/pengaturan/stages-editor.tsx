"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { renameStage, reorderStages } from "@/app/actions/contacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Stage } from "@/lib/workspace-data";

export function StagesEditor({ slug, stages }: { slug: string; stages: Stage[] }) {
  const [order, setOrder] = useState(stages.filter((s) => s.tipe === "normal").map((s) => s.id));
  const [names, setNames] = useState(Object.fromEntries(stages.map((s) => [s.id, s.nama])));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string }>();
  const byId = Object.fromEntries(stages.map((s) => [s.id, s]));
  const terminal = stages.filter((s) => s.tipe !== "normal");

  function move(index: number, delta: number) {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    setOrder(next);
    startTransition(async () => {
      const result = await reorderStages(slug, next);
      setMessage(result.error ? { tone: "error", text: result.error } : { tone: "ok", text: "Urutan stage tersimpan." });
      if (result.error) setOrder(order);
    });
  }

  function save(stage: Stage) {
    const nama = names[stage.id]?.trim() ?? "";
    if (nama === stage.nama) return;
    startTransition(async () => {
      const result = await renameStage(slug, stage.id, nama);
      setMessage(result.error ? { tone: "error", text: result.error } : { tone: "ok", text: `Stage diganti menjadi "${nama}".` });
      if (result.error) setNames((n) => ({ ...n, [stage.id]: stage.nama }));
    });
  }

  const row = (stage: Stage, index?: number) => (
    <li key={stage.id} className="flex items-center gap-2">
      <span className="w-6 text-right text-xs text-muted-foreground">{index !== undefined ? index + 1 : ""}</span>
      <label className="sr-only" htmlFor={`stage-${stage.id}`}>
        Nama stage
      </label>
      <Input
        id={`stage-${stage.id}`}
        value={names[stage.id] ?? ""}
        maxLength={40}
        onChange={(e) => setNames((n) => ({ ...n, [stage.id]: e.target.value }))}
        onBlur={() => save(stage)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-9 max-w-xs"
      />
      {index !== undefined ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Naikkan ${stage.nama}`}
            disabled={pending || index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Turunkan ${stage.nama}`}
            disabled={pending || index === order.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown aria-hidden />
          </Button>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">{stage.tipe === "closing" ? "Tahap akhir: berhasil" : "Tahap akhir: batal"}</span>
      )}
    </li>
  );

  return (
    <section aria-labelledby="h-stage" className="rounded-xl border bg-card p-5">
      <h2 id="h-stage" className="text-base font-bold">
        Stage pipeline
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ganti nama atau urutan stage. Closing dan Lost selalu di akhir supaya dashboard tetap bisa menghitung.
      </p>
      <ol className="mt-4 flex flex-col gap-2">{order.map((id, i) => byId[id] && row(byId[id]!, i))}</ol>
      <ul className="mt-2 flex flex-col gap-2 border-t pt-2">{terminal.map((s) => row(s))}</ul>
      {message && (
        <p role="status" className={message.tone === "error" ? "mt-3 text-sm font-medium text-destructive" : "mt-3 text-sm font-medium text-primary"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
