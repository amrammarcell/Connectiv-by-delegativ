import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { logAdminAccess } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import type { Peran, Workspace } from "@/lib/types";

// Data Access Layer: satu tempat untuk membaca sesi dan hak akses. Semua
// query memakai client dengan sesi user, jadi RLS tetap menjadi penjaga utama.

export type SessionUser = {
  id: string;
  email: string;
  nama: string | null;
  isSuperAdmin: boolean;
};

// ID user dari JWT sesi (getClaims memverifikasi token).
const getSessionUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, nama, is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: userId,
    email: profile.email,
    nama: profile.nama,
    isSuperAdmin: profile.is_super_admin,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) notFound();
  return user;
}

export type WorkspaceAccess = {
  user: SessionUser;
  workspace: Workspace;
  // null = Super Admin yang bukan anggota workspace ini.
  peran: Peran | null;
  canManage: boolean;
};

export const requireWorkspace = cache(
  async (slug: string): Promise<WorkspaceAccess> => {
    const userId = await getSessionUserId();
    if (!userId) redirect("/login");
    const supabase = await createClient();

    // Profil dan workspace + peran dibaca paralel; peran ikut di query
    // workspace (embed memberships milik user ini) supaya tidak ada round trip
    // tambahan.
    const [user, { data: row }] = await Promise.all([
      requireUser(),
      supabase
        .from("workspaces")
        .select("id, nama, slug, batas_kuning_menit, batas_merah_menit, memberships(peran)")
        .eq("slug", slug)
        .eq("memberships.user_id", userId)
        .maybeSingle<Workspace & { memberships: { peran: Peran }[] }>(),
    ]);
    // RLS menyembunyikan workspace milik orang lain, jadi tampil sebagai 404.
    if (!row) notFound();

    const { memberships, ...workspace } = row;
    const peran = memberships[0]?.peran ?? null;

    // Super Admin yang membuka workspace klien (bukan anggota) dicatat.
    if (!peran && user.isSuperAdmin) await logAdminAccess(user.id, workspace.id);

    return {
      user,
      workspace,
      peran,
      canManage: peran === "owner" || user.isSuperAdmin,
    };
  },
);

export type MyWorkspace = { nama: string; slug: string; peran: Peran };

export const listMyWorkspaces = cache(async (): Promise<MyWorkspace[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("peran, workspaces(nama, slug)")
    .eq("user_id", user.id)
    .returns<{ peran: Peran; workspaces: { nama: string; slug: string } }[]>();

  return (data ?? [])
    .map((m) => ({ ...m.workspaces, peran: m.peran }))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
});
