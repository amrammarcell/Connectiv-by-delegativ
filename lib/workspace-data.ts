import "server-only";
import { cache } from "react";
import { requireWorkspace } from "@/lib/auth";
import { cachedMembers, cachedStages, type CachedMember, type CachedStage } from "@/lib/workspace-cache";

export type Stage = CachedStage;
export type Member = CachedMember;

// Akses dicek dulu (requireWorkspace), baru data dibaca dari cache per workspace.
export const getStages = cache(async (slug: string): Promise<Stage[]> => {
  const access = await requireWorkspace(slug);
  return cachedStages(access.workspace.id);
});

// Anggota yang bisa dipilih untuk assign. Sama dengan RLS memberships: CS
// (bukan Super Admin) hanya melihat keanggotaannya sendiri, jadi daftar ini
// praktis hanya untuk Owner/Supervisor; untuk CS isinya dirinya sendiri.
export const getMembers = cache(async (slug: string): Promise<Member[]> => {
  const access = await requireWorkspace(slug);
  const members = await cachedMembers(access.workspace.id);
  if (access.peran === "cs" && !access.user.isSuperAdmin) {
    return members.filter((m) => m.id === access.user.id);
  }
  return members;
});
