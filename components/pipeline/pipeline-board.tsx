"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { moveContactStage } from "@/app/actions/contacts";
import { ResponseBadge, SourceBadge } from "@/components/inbox/response-badge";
import type { InboxContact } from "@/components/inbox/types";
import { useNow } from "@/hooks/use-now";
import { formatPhone, initials } from "@/lib/format";
import { responseStatus, type Thresholds } from "@/lib/response-time";
import { subscribeWithAuth } from "@/lib/supabase/realtime";
import { cn } from "@/lib/utils";
import type { Member, Stage } from "@/lib/workspace-data";

const STAGE_DOT: Record<number, string> = { 0: "#98a2b3", 1: "#2e90fa", 2: "#7a5af8", 3: "#f79009" };

function dotColor(stage: Stage, index: number) {
  if (stage.tipe === "closing") return "#12b76a";
  if (stage.tipe === "lost") return "#f04438";
  return STAGE_DOT[index % 4];
}

export function PipelineBoard({
  slug,
  workspaceId,
  stages,
  members,
  initialContacts,
  thresholds,
  canFilterByCs,
}: {
  slug: string;
  workspaceId: string;
  stages: Stage[];
  members: Member[];
  initialContacts: InboxContact[];
  thresholds: Thresholds;
  canFilterByCs: boolean;
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [csFilter, setCsFilter] = useState<string>("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const now = useNow();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // Perpindahan stage oleh user lain langsung terlihat.
  useEffect(
    () =>
      subscribeWithAuth(`pipeline:${workspaceId}`, (channel) =>
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "contacts", filter: `workspace_id=eq.${workspaceId}` },
          (payload) =>
            setContacts((current) => {
              if (payload.eventType === "DELETE") return current.filter((c) => c.id !== (payload.old as { id: string }).id);
              const row = payload.new as InboxContact;
              const exists = current.some((c) => c.id === row.id);
              return exists ? current.map((c) => (c.id === row.id ? row : c)) : [row, ...current];
            }),
        ),
      ),
    [workspaceId],
  );

  const memberName = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.nama])), [members]);
  const stageById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  const visible = csFilter ? contacts.filter((c) => c.assigned_to === csFilter) : contacts;
  const activeContact = activeId ? contacts.find((c) => c.id === activeId) : undefined;

  function move(contact: InboxContact, stageId: string) {
    const target = stageById[stageId];
    if (!target || contact.stage_id === stageId) return;
    if (target.tipe !== "normal") {
      setMessage({ tone: "error", text: "Closing dan Lost dicatat lewat tombol Tandai Closing/Lost (segera hadir)." });
      return;
    }
    const previous = contact.stage_id;
    const name = contact.nama ?? formatPhone(contact.nomor_hp);
    setContacts((current) => current.map((c) => (c.id === contact.id ? { ...c, stage_id: stageId } : c)));
    startTransition(async () => {
      const result = await moveContactStage(slug, contact.id, stageId);
      if (result.error) {
        setContacts((current) => current.map((c) => (c.id === contact.id ? { ...c, stage_id: previous } : c)));
        setMessage({ tone: "error", text: result.error });
      } else {
        setMessage({ tone: "ok", text: `${name} dipindah ke ${target.nama}.` });
      }
    });
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const contact = contacts.find((c) => c.id === event.active.id);
    if (contact && event.over) move(contact, String(event.over.id));
  }

  const normalStages = stages.filter((s) => s.tipe === "normal");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-7">
        <p className="text-[13px] text-muted-foreground">
          {contacts.filter((c) => stageById[c.stage_id ?? ""]?.tipe === "normal").length} kontak aktif · seret kartu ke
          kolom lain atau pakai menu Pindah
        </p>
        {canFilterByCs && members.length > 0 && (
          <div role="group" aria-label="Filter CS" className="flex flex-wrap gap-2">
            {[{ id: "", nama: "Semua" }, ...members].map((m) => (
              <button
                key={m.id || "semua"}
                type="button"
                aria-pressed={csFilter === m.id}
                onClick={() => setCsFilter(m.id)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-[13px] font-semibold",
                  csFilter === m.id ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-secondary-foreground",
                )}
              >
                {m.nama}
              </button>
            ))}
          </div>
        )}
      </div>

      <p
        role="status"
        aria-live="polite"
        className={cn(
          "mx-4 mt-3 min-h-0 text-[13px] font-semibold sm:mx-7",
          message?.tone === "error" ? "text-destructive" : "text-primary",
        )}
      >
        {message?.text}
      </p>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="min-h-0 flex-1 overflow-x-auto px-4 pt-3 pb-6 sm:px-7">
          <div className="grid min-w-[1320px] grid-cols-[repeat(6,minmax(210px,1fr))] gap-3.5">
            {stages.map((stage, index) => {
              const cards = visible
                .filter((c) => c.stage_id === stage.id)
                .sort((a, b) => (b.pesan_terakhir_pada ?? "").localeCompare(a.pesan_terakhir_pada ?? ""));
              return (
                <StageColumn key={stage.id} stage={stage} color={dotColor(stage, index)} count={cards.length}>
                  {cards.map((c) => (
                    <ContactCard
                      key={c.id}
                      slug={slug}
                      contact={c}
                      assignee={c.assigned_to ? memberName[c.assigned_to] : undefined}
                      status={stage.tipe === "normal" ? responseStatus(c, now, thresholds) : null}
                      normalStages={normalStages}
                      onMove={(stageId) => move(c, stageId)}
                    />
                  ))}
                </StageColumn>
              );
            })}
          </div>
        </div>
        <DragOverlay>
          {activeContact ? (
            <div className="rotate-2 rounded-xl border bg-card p-3 text-sm font-semibold shadow-lg">
              {activeContact.nama ?? formatPhone(activeContact.nomor_hp)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function StageColumn({
  stage,
  color,
  count,
  children,
}: {
  stage: Stage;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: stage.tipe !== "normal" });
  return (
    <section
      ref={setNodeRef}
      aria-label={stage.nama}
      className={cn(
        "flex min-h-[520px] flex-col gap-2.5 rounded-2xl p-2.5 transition-colors",
        stage.tipe === "normal" ? "bg-[#eef1f4]" : "bg-[#f0f2f5]",
        isOver && "bg-accent ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center gap-2 px-1 pt-1">
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />
        <h2 className="text-sm font-bold">{stage.nama}</h2>
        <span className="rounded-full border bg-card px-2 text-xs text-muted-foreground">{count}</span>
      </div>
      {children}
      {count === 0 && <p className="px-2 py-4 text-center text-[13px] text-muted-foreground">Belum ada kontak</p>}
    </section>
  );
}

function ContactCard({
  slug,
  contact,
  assignee,
  status,
  normalStages,
  onMove,
}: {
  slug: string;
  contact: InboxContact;
  assignee: string | undefined;
  status: ReturnType<typeof responseStatus>;
  normalStages: Stage[];
  onMove: (stageId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: contact.id });
  const name = contact.nama ?? formatPhone(contact.nomor_hp);
  return (
    <article
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={`Seret ${name}`}
          className="-ml-1 flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
        <Link href={`/w/${slug}/inbox/${contact.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground hover:underline">
          {name}
        </Link>
        <span
          title={assignee ? `Di-assign ke ${assignee}` : "Belum di-assign"}
          className={cn(
            "flex size-6.5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
            assignee ? "bg-[#dcebfe] text-[#1d4b8f]" : "border border-dashed text-muted-foreground",
          )}
        >
          {assignee ? initials(assignee) : "?"}
        </span>
      </div>
      <SourceBadge sumber={contact.sumber} headline={contact.referral_headline} />
      {status?.waiting && (
        <span suppressHydrationWarning>
          <ResponseBadge status={status} />
        </span>
      )}
      {normalStages.some((s) => s.id === contact.stage_id) && (
        <label className="flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
          Pindah
          <select
            value={contact.stage_id ?? ""}
            onChange={(e) => onMove(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-1.5 text-xs text-foreground"
          >
            {normalStages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}
