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
import { DealDialog } from "@/components/deals/deal-dialog";
import { ResponseBadge, SourceBadge } from "@/components/inbox/response-badge";
import type { InboxContact, Lookup } from "@/components/inbox/types";
import { adLabel } from "@/lib/inbox-filters";
import { useNow } from "@/hooks/use-now";
import { ALASAN_LABEL, formatRupiah, latestDealByContact, type Deal, type DealStatus } from "@/lib/deals";
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
  initialDeals,
  thresholds,
  adNames,
  canFilterByCs,
}: {
  slug: string;
  workspaceId: string;
  stages: Stage[];
  members: Member[];
  initialContacts: InboxContact[];
  initialDeals: Deal[];
  thresholds: Thresholds;
  adNames: Lookup;
  canFilterByCs: boolean;
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [deals, setDeals] = useState(initialDeals);
  const [dealTarget, setDealTarget] = useState<{ contact: InboxContact; kind: DealStatus } | null>(null);
  const [csFilter, setCsFilter] = useState<string>("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const now = useNow();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // Perpindahan stage dan Closing/Lost oleh user lain langsung terlihat.
  useEffect(
    () =>
      subscribeWithAuth(`pipeline:${workspaceId}`, (channel) =>
        channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "contacts", filter: `workspace_id=eq.${workspaceId}` },
            (payload) =>
              setContacts((current) => {
                if (payload.eventType === "DELETE") return current.filter((c) => c.id !== (payload.old as { id: string }).id);
                const row = payload.new as InboxContact;
                const exists = current.some((c) => c.id === row.id);
                return exists ? current.map((c) => (c.id === row.id ? row : c)) : [row, ...current];
              }),
          )
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "deals", filter: `workspace_id=eq.${workspaceId}` },
            (payload) => setDeals((current) => [...current, payload.new as Deal]),
          ),
      ),
    [workspaceId],
  );

  const memberName = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.nama])), [members]);
  const stageById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  const dealByContact = useMemo(() => latestDealByContact(deals), [deals]);
  const normalStages = stages.filter((s) => s.tipe === "normal");
  const visible = csFilter ? contacts.filter((c) => c.assigned_to === csFilter) : contacts;
  const activeContact = activeId ? contacts.find((c) => c.id === activeId) : undefined;

  function move(contact: InboxContact, stageId: string) {
    const target = stageById[stageId];
    if (!target || contact.stage_id === stageId) return;
    // Closing wajib nilai dan Lost wajib alasan, jadi lewat dialog.
    if (target.tipe !== "normal") {
      setDealTarget({ contact, kind: target.tipe });
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

  const activeCount = contacts.filter((c) => stageById[c.stage_id ?? ""]?.tipe === "normal").length;
  const closingTotal = contacts.reduce(
    (sum, c) => sum + (stageById[c.stage_id ?? ""]?.tipe === "closing" ? (dealByContact[c.id]?.nilai ?? 0) : 0),
    0,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-3 sm:px-7 sm:pt-4">
        <p className="text-[13px] text-muted-foreground">
          {activeCount} kontak aktif · {formatRupiah(closingTotal)} closing · seret kartu atau pakai tombol di kartu
        </p>
        {canFilterByCs && members.length > 0 && (
          <div role="group" aria-label="Filter CS" className="-mx-3 flex w-[calc(100%+1.5rem)] gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:px-0 [&>*]:shrink-0">
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

      {/* id tetap supaya atribut aksesibilitas sama di server dan browser (hindari hydration mismatch). */}
      <DndContext
        id={`pipeline-${workspaceId}`}
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* HP: kolom digeser horizontal satu per satu (snap). Laptop: semua kolom berdampingan. */}
        <div className="min-h-0 flex-1 snap-x snap-mandatory scroll-px-3 overflow-x-auto px-3 pt-3 pb-6 sm:snap-none sm:px-7">
          <div className="grid auto-cols-[82vw] grid-flow-col gap-3 sm:auto-cols-[minmax(210px,1fr)] sm:gap-3.5 lg:min-w-[1320px]">
            {stages.map((stage, index) => {
              const cards = visible
                .filter((c) => c.stage_id === stage.id)
                .sort((a, b) => (b.pesan_terakhir_pada ?? "").localeCompare(a.pesan_terakhir_pada ?? ""));
              const position = normalStages.findIndex((s) => s.id === stage.id);
              return (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  color={dotColor(stage, index)}
                  count={cards.length}
                  total={stage.tipe === "closing" ? cards.reduce((sum, c) => sum + (dealByContact[c.id]?.nilai ?? 0), 0) : undefined}
                >
                  {cards.map((c) => (
                    <ContactCard
                      key={c.id}
                      slug={slug}
                      contact={c}
                      stage={stage}
                      deal={dealByContact[c.id]}
                      assignee={c.assigned_to ? memberName[c.assigned_to] : undefined}
                      adName={adLabel(c.ad_id, c.referral_headline, adNames)}
                      status={stage.tipe === "normal" ? responseStatus(c, now, thresholds) : null}
                      nextStage={position >= 0 ? normalStages[position + 1] : undefined}
                      onMove={(stageId) => move(c, stageId)}
                      onDeal={(kind) => setDealTarget({ contact: c, kind })}
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

      <DealDialog
        slug={slug}
        contactId={dealTarget?.contact.id ?? ""}
        contactName={dealTarget ? (dealTarget.contact.nama ?? formatPhone(dealTarget.contact.nomor_hp)) : ""}
        kind={dealTarget?.kind ?? null}
        onOpenChange={(open) => !open && setDealTarget(null)}
        onDone={(text) => setMessage({ tone: "ok", text })}
      />
    </div>
  );
}

function StageColumn({
  stage,
  color,
  count,
  total,
  children,
}: {
  stage: Stage;
  color: string;
  count: number;
  total?: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={stage.nama}
      className={cn(
        "flex min-h-[420px] snap-start flex-col gap-2.5 rounded-2xl p-2.5 transition-colors sm:min-h-[520px]",
        stage.tipe === "normal" ? "bg-[#eef1f4]" : "bg-[#f0f2f5]",
        isOver && "bg-accent ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center gap-2 px-1 pt-1">
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />
        <h2 className="text-sm font-bold">{stage.nama}</h2>
        <span className="rounded-full border bg-card px-2 text-xs text-muted-foreground">{count}</span>
        {total ? <span className="ml-auto text-xs font-semibold text-[#05603a]">{formatRupiah(total)}</span> : null}
      </div>
      {children}
      {count === 0 && <p className="px-2 py-4 text-center text-[13px] text-muted-foreground">Belum ada kontak</p>}
    </section>
  );
}

function ContactCard({
  slug,
  contact,
  stage,
  deal,
  assignee,
  adName,
  status,
  nextStage,
  onMove,
  onDeal,
}: {
  slug: string;
  contact: InboxContact;
  stage: Stage;
  deal: Deal | undefined;
  assignee: string | undefined;
  adName: string;
  status: ReturnType<typeof responseStatus>;
  nextStage: Stage | undefined;
  onMove: (stageId: string) => void;
  onDeal: (kind: DealStatus) => void;
}) {
  const active = stage.tipe === "normal";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: contact.id, disabled: !active });
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
        {active && (
          <button
            type="button"
            aria-label={`Seret ${name}`}
            className="-ml-1 flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
        )}
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
      <SourceBadge sumber={contact.sumber} label={adName} />
      {status?.waiting && (
        <span suppressHydrationWarning>
          <ResponseBadge status={status} />
        </span>
      )}
      {stage.tipe === "closing" && deal?.nilai ? (
        <span className="text-[13px] font-bold text-[#05603a]">{formatRupiah(deal.nilai)}</span>
      ) : null}
      {stage.tipe === "lost" && deal?.alasan_lost ? (
        <span className="text-[13px] font-bold text-[#b42318]">{ALASAN_LABEL[deal.alasan_lost]}</span>
      ) : null}
      {active && (
        <div className="flex flex-wrap gap-1.5 border-t pt-2">
          {nextStage && (
            <button
              type="button"
              onClick={() => onMove(nextStage.id)}
              className="min-h-9 flex-auto rounded-lg border border-input bg-card px-2 text-xs font-semibold text-secondary-foreground hover:bg-muted"
            >
              Ke {nextStage.nama}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDeal("closing")}
            className="min-h-9 flex-auto rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Closing
          </button>
          <button
            type="button"
            onClick={() => onDeal("lost")}
            className="min-h-9 flex-auto rounded-lg border border-input bg-card px-2 text-xs font-semibold text-destructive hover:bg-[#fef3f2]"
          >
            Lost
          </button>
        </div>
      )}
    </article>
  );
}
