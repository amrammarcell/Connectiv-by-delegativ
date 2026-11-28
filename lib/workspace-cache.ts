import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Peran } from "@/lib/types";

// Cache data workspace yang jarang berubah (stage, anggota, label nomor WA).
//
// Di dalam "use cache" tidak ada cookie, jadi query memakai secret key
// (melewati RLS). Karena itu:
// - fungsi ini HANYA boleh dipanggil lewat lib/workspace-data.ts / lib/inbox.ts
//   setelah requireWorkspace(slug) membuktikan akses ke workspace tersebut;
// - kunci cache = workspaceId, jadi data satu workspace tidak pernah tercampur;
// - penyaringan per peran (mis. CS hanya melihat dirinya di daftar anggota)
//   dilakukan pemanggil, sama dengan aturan RLS.
// Server Action yang mengubah data ini memanggil updateTag(...) dengan tag di
// bawah; cacheLife membatasi umur data jika perubahan datang dari jalur lain.

export const workspaceTags = {
  stages: (workspaceId: string) => `ws:${workspaceId}:stages`,
  members: (workspaceId: string) => `ws:${workspaceId}:members`,
  numbers: (workspaceId: string) => `ws:${workspaceId}:wa-numbers`,
};

const LIFE = { stale: 60, revalidate: 300, expire: 3600 };

export type CachedStage = { id: string; nama: string; urutan: number; tipe: "normal" | "closing" | "lost" };
export type CachedMember = { id: string; nama: string; peran: Peran };
export type CachedNumber = { id: string; label: string };

export async function cachedStages(workspaceId: string): Promise<CachedStage[]> {
  "use cache";
  cacheLife(LIFE);
  cacheTag(workspaceTags.stages(workspaceId));
  const { data, error } = await createAdminClient()
    .from("stages")
    .select("id, nama, urutan, tipe")
    .eq("workspace_id", workspaceId)
    .order("urutan")
    .returns<CachedStage[]>();
  // Melempar error supaya kegagalan tidak ikut tersimpan di cache.
  if (error) throw new Error(`Gagal memuat stage: ${error.message}`);
  return data;
}

export async function cachedMembers(workspaceId: string): Promise<CachedMember[]> {
  "use cache";
  cacheLife(LIFE);
  cacheTag(workspaceTags.members(workspaceId));
  const { data, error } = await createAdminClient()
    .from("memberships")
    .select("peran, profiles(id, nama, email)")
    .eq("workspace_id", workspaceId)
    .returns<{ peran: Peran; profiles: { id: string; nama: string | null; email: string } }[]>();
  if (error) throw new Error(`Gagal memuat anggota: ${error.message}`);
  return data
    .map((m) => ({ id: m.profiles.id, nama: m.profiles.nama ?? m.profiles.email, peran: m.peran }))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

export async function cachedWaNumbers(workspaceId: string): Promise<CachedNumber[]> {
  "use cache";
  cacheLife(LIFE);
  cacheTag(workspaceTags.numbers(workspaceId));
  const { data, error } = await createAdminClient()
    .from("wa_numbers")
    .select("id, label")
    .eq("workspace_id", workspaceId)
    .returns<CachedNumber[]>();
  if (error) throw new Error(`Gagal memuat nomor WA: ${error.message}`);
  return data;
}
