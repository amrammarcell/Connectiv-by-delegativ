"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ensureUser } from "@/lib/accounts";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PERAN, type Peran } from "@/lib/types";

export type AddMemberState = {
  error?: string;
  added?: { email: string; tempPassword: string | null };
};

const addMemberSchema = z.object({
  email: z.email({ error: "Email tidak valid." }).transform((v) => v.toLowerCase()),
  nama: z.string().trim().max(80).optional().transform((v) => v || null),
  peran: z.enum(PERAN, { error: "Pilih peran." }),
});

export async function addMember(slug: string, _prev: AddMemberState, formData: FormData): Promise<AddMemberState> {
  const access = await requireWorkspace(slug);
  if (!access.canManage) return { error: "Hanya Owner yang bisa menambah user." };

  const parsed = addMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { email, nama, peran } = parsed.data;

  let account;
  try {
    account = await ensureUser(email, nama);
  } catch {
    return { error: "Gagal membuat akun. Coba lagi." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .insert({ user_id: account.userId, workspace_id: access.workspace.id, peran });
  if (error) {
    return { error: error.code === "23505" ? "User ini sudah menjadi anggota workspace." : "Gagal menambah anggota." };
  }

  refresh();
  return { added: { email, tempPassword: account.tempPassword } };
}

export async function updateMemberRole(slug: string, userId: string, peran: Peran): Promise<{ error?: string }> {
  const access = await requireWorkspace(slug);
  if (!access.canManage || !PERAN.includes(peran)) return { error: "Tidak diizinkan." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ peran })
    .eq("workspace_id", access.workspace.id)
    .eq("user_id", userId)
    .select("user_id");
  // RLS mengembalikan 0 baris jika tidak diizinkan (misalnya mengubah peran sendiri).
  if (error || !data?.length) return { error: "Gagal mengubah peran." };

  refresh();
  return {};
}

export async function removeMember(slug: string, userId: string): Promise<{ error?: string }> {
  const access = await requireWorkspace(slug);
  if (!access.canManage) return { error: "Tidak diizinkan." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("workspace_id", access.workspace.id)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { error: "Gagal menghapus anggota." };

  refresh();
  return {};
}
