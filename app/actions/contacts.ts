"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { ALASAN_LOST } from "@/lib/deals";
import { createClient } from "@/lib/supabase/server";
import { workspaceTags } from "@/lib/workspace-cache";

// Aksi kontak dan pipeline. Setiap aksi memeriksa akses sendiri, lalu menulis
// lewat client sesi user supaya RLS ikut menjaga (CS hanya kontak miliknya).

export type ActionResult = { error?: string };

const uuid = z.uuid();

export async function moveContactStage(slug: string, contactId: string, stageId: string): Promise<ActionResult> {
  if (!uuid.safeParse(contactId).success || !uuid.safeParse(stageId).success) return { error: "Data tidak valid." };
  const access = await requireWorkspace(slug);
  const supabase = await createClient();

  const { data: stage } = await supabase
    .from("stages")
    .select("id, tipe")
    .eq("id", stageId)
    .eq("workspace_id", access.workspace.id)
    .maybeSingle<{ id: string; tipe: "normal" | "closing" | "lost" }>();
  if (!stage) return { error: "Stage tidak ditemukan." };
  // Closing wajib nilai transaksi dan Lost wajib alasan (PRD F7), jadi tidak
  // boleh dipindah langsung tanpa dialog.
  if (stage.tipe !== "normal") return { error: "Closing dan Lost dicatat lewat tombol Tandai Closing/Lost." };

  const { data, error } = await supabase
    .from("contacts")
    .update({ stage_id: stage.id })
    .eq("id", contactId)
    .eq("workspace_id", access.workspace.id)
    .select("id");
  if (error || !data?.length) return { error: "Gagal memindah kontak." };

  refresh();
  return {};
}

export async function assignContact(slug: string, contactId: string, userId: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(contactId).success || (userId !== null && !uuid.safeParse(userId).success)) {
    return { error: "Data tidak valid." };
  }
  const access = await requireWorkspace(slug);
  if (!(access.canManage || access.peran === "supervisor")) return { error: "Hanya Owner atau Supervisor yang bisa assign." };
  const supabase = await createClient();

  if (userId) {
    const { data: member } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("workspace_id", access.workspace.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return { error: "User bukan anggota workspace ini." };
  }

  const { data, error } = await supabase
    .from("contacts")
    .update({ assigned_to: userId })
    .eq("id", contactId)
    .eq("workspace_id", access.workspace.id)
    .select("id");
  if (error || !data?.length) return { error: "Gagal mengubah assign." };

  refresh();
  return {};
}

const noteSchema = z.string().trim().min(1, "Catatan tidak boleh kosong.").max(2000, "Catatan maksimal 2000 karakter.");

export async function addContactNote(slug: string, contactId: string, isi: string): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(isi);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!uuid.safeParse(contactId).success) return { error: "Data tidak valid." };
  const access = await requireWorkspace(slug);
  const supabase = await createClient();

  const { error } = await supabase
    .from("contact_notes")
    .insert({ workspace_id: access.workspace.id, contact_id: contactId, isi: parsed.data, oleh_user: access.user.id });
  if (error) return { error: "Gagal menyimpan catatan." };

  refresh();
  return {};
}

export async function deleteContactNote(slug: string, noteId: string): Promise<ActionResult> {
  if (!uuid.safeParse(noteId).success) return { error: "Data tidak valid." };
  const access = await requireWorkspace(slug);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contact_notes")
    .delete()
    .eq("id", noteId)
    .eq("workspace_id", access.workspace.id)
    .select("id");
  if (error || !data?.length) return { error: "Gagal menghapus catatan." };

  refresh();
  return {};
}

const stageNameSchema = z.string().trim().min(1, "Nama stage wajib diisi.").max(40, "Nama stage maksimal 40 karakter.");

export async function renameStage(slug: string, stageId: string, nama: string): Promise<ActionResult> {
  const parsed = stageNameSchema.safeParse(nama);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!uuid.safeParse(stageId).success) return { error: "Data tidak valid." };
  const access = await requireWorkspace(slug);
  if (!access.canManage) return { error: "Hanya Owner yang bisa mengubah stage." };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stages")
    .update({ nama: parsed.data })
    .eq("id", stageId)
    .eq("workspace_id", access.workspace.id)
    .select("id");
  if (error || !data?.length) return { error: "Gagal mengubah nama stage." };

  updateTag(workspaceTags.stages(access.workspace.id));
  refresh();
  return {};
}

export async function reorderStages(slug: string, stageIds: string[]): Promise<ActionResult> {
  if (!stageIds.every((id) => uuid.safeParse(id).success)) return { error: "Data tidak valid." };
  const access = await requireWorkspace(slug);
  if (!access.canManage) return { error: "Hanya Owner yang bisa mengurutkan stage." };
  const supabase = await createClient();

  const { error } = await supabase.rpc("reorder_stages", { ws: access.workspace.id, stage_ids: stageIds });
  if (error) return { error: "Gagal mengurutkan stage." };

  updateTag(workspaceTags.stages(access.workspace.id));
  refresh();
  return {};
}

const dealSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("closing"),
    nilai: z.number().int().positive("Nilai transaksi wajib diisi.").max(1_000_000_000_000),
    catatan: z.string().trim().max(500).optional(),
  }),
  z.object({
    status: z.literal("lost"),
    alasan: z.enum(ALASAN_LOST, { error: "Pilih salah satu alasan." }),
    catatan: z.string().trim().max(500).optional(),
  }),
]);

export type DealInput = z.input<typeof dealSchema>;

export async function closeContact(slug: string, contactId: string, input: DealInput): Promise<ActionResult> {
  if (!uuid.safeParse(contactId).success) return { error: "Data tidak valid." };
  const parsed = dealSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const deal = parsed.data;
  if (deal.status === "lost" && deal.alasan === "lainnya" && !deal.catatan) {
    return { error: 'Catatan wajib diisi untuk alasan "Lainnya".' };
  }

  await requireWorkspace(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_contact", {
    p_contact_id: contactId,
    p_status: deal.status,
    p_nilai: deal.status === "closing" ? deal.nilai : null,
    p_alasan: deal.status === "lost" ? deal.alasan : null,
    p_catatan: deal.catatan ?? null,
  });
  if (error) return { error: "Gagal menyimpan. Pastikan kontak ini milik Anda." };

  refresh();
  return {};
}
