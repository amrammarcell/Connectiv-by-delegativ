import "server-only";
import { cache } from "react";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Peran } from "@/lib/types";

export type Stage = { id: string; nama: string; urutan: number; tipe: "normal" | "closing" | "lost" };
export type Member = { id: string; nama: string; peran: Peran };

export const getStages = cache(async (slug: string): Promise<Stage[]> => {
  const access = await requireWorkspace(slug);
  const supabase = await createClient();
  const { data } = await supabase
    .from("stages")
    .select("id, nama, urutan, tipe")
    .eq("workspace_id", access.workspace.id)
    .order("urutan")
    .returns<Stage[]>();
  return data ?? [];
});

// Anggota yang bisa dipilih untuk assign. CS hanya bisa membaca
// keanggotaannya sendiri (RLS), jadi daftar ini praktis hanya untuk
// Owner/Supervisor; untuk CS isinya dirinya sendiri.
export const getMembers = cache(async (slug: string): Promise<Member[]> => {
  const access = await requireWorkspace(slug);
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("peran, profiles(id, nama, email)")
    .eq("workspace_id", access.workspace.id)
    .returns<{ peran: Peran; profiles: { id: string; nama: string | null; email: string } }[]>();
  return (data ?? [])
    .map((m) => ({ id: m.profiles.id, nama: m.profiles.nama ?? m.profiles.email, peran: m.peran }))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
});
