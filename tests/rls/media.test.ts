import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, supabaseEnabled, type TestUser } from "../helpers/supabase";

// Bucket Storage privat `media`: file hanya bisa dibuka (signed URL) oleh user
// yang boleh melihat pesannya. Owner/Supervisor semua kontak workspace-nya,
// CS hanya kontak miliknya, workspace lain tidak sama sekali. Upload hanya
// lewat secret key. Butuh migrasi 20261128100000_message_media.

describe.skipIf(!supabaseEnabled)("RLS: media Storage", { timeout: 60_000 }, () => {
  const ctx = createTestContext("rls-media");
  const paths: string[] = [];
  let wsA: string;
  let wsB: string;
  let ownerA: TestUser;
  let csA: TestUser;
  let ownerB: TestUser;
  let contactA: string;
  let pathA: string;
  let messageA: string;
  let misplacedPath: string;

  async function message(workspaceId: string, contactId: string, label: string, mediaPath: string) {
    const { data, error } = await ctx.admin
      .from("messages")
      .insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        wa_message_id: `wamid.rls-media-${ctx.run}-${label}`,
        arah: "masuk",
        tipe: "image",
        media_id: `media-${label}`,
        media_mime: "image/png",
        media_path: mediaPath,
        media_status: "tersimpan",
        media_size: 4,
        dikirim_pada: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async function upload(path: string) {
    const { error } = await ctx.admin.storage
      .from("media")
      .upload(path, new Uint8Array([137, 80, 78, 71]), { contentType: "image/png", upsert: true });
    if (error) throw error;
    paths.push(path);
  }

  beforeAll(async () => {
    [wsA, wsB] = await Promise.all([ctx.workspace("a"), ctx.workspace("b")]);
    [ownerA, csA, ownerB] = await Promise.all([ctx.user("owner-a"), ctx.user("cs-a"), ctx.user("owner-b")]);
    await Promise.all([ctx.member(ownerA, wsA, "owner"), ctx.member(csA, wsA, "cs"), ctx.member(ownerB, wsB, "owner")]);

    const { data: contact, error } = await ctx.admin
      .from("contacts")
      .insert({ workspace_id: wsA, nomor_hp: "6281200009001" })
      .select("id")
      .single();
    if (error) throw error;
    contactA = contact.id;

    pathA = `${wsA}/rls-${ctx.run}-a.png`;
    messageA = await message(wsA, contactA, "a", pathA);
    await upload(pathA);

    // Path yang menunjuk folder workspace lain tidak boleh terbuka.
    misplacedPath = `${wsB}/rls-${ctx.run}-misplaced.png`;
    await message(wsA, contactA, "misplaced", misplacedPath);
    await upload(misplacedPath);
  });

  afterAll(async () => {
    if (paths.length) await ctx.admin.storage.from("media").remove(paths);
    await ctx.cleanup();
  });

  const sign = (user: TestUser, path: string) => user.client.storage.from("media").createSignedUrl(path, 60);

  it("bucket media privat", async () => {
    const { data, error } = await ctx.admin.storage.getBucket("media");
    expect(error).toBeNull();
    expect(data?.public).toBe(false);
  });

  it("owner workspace membuat signed URL dan mengunduh file", async () => {
    const { data, error } = await sign(ownerA, pathA);
    expect(error).toBeNull();
    const res = await fetch(data!.signedUrl);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it("owner workspace membaca kolom status media pesan", async () => {
    const { data } = await ownerA.client.from("messages").select("media_status, media_size").eq("id", messageA).single();
    expect(data).toEqual({ media_status: "tersimpan", media_size: 4 });
  });

  it("workspace lain dan pengunjung anonim tidak bisa membuka file", async () => {
    const other = await sign(ownerB, pathA);
    expect(other.data).toBeNull();
    expect(other.error).not.toBeNull();
    const anon = await ctx.anon().storage.from("media").createSignedUrl(pathA, 60);
    expect(anon.data).toBeNull();
    const download = await ownerB.client.storage.from("media").download(pathA);
    expect(download.data).toBeNull();
  });

  it("CS hanya membuka media kontak yang di-assign ke dia", async () => {
    expect((await sign(csA, pathA)).data).toBeNull();
    const { error } = await ctx.admin.from("contacts").update({ assigned_to: csA.id }).eq("id", contactA);
    expect(error).toBeNull();
    const { data, error: signError } = await sign(csA, pathA);
    expect(signError).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });

  it("path di folder workspace lain tertolak walau pesannya terlihat", async () => {
    expect((await sign(ownerA, misplacedPath)).data).toBeNull();
    expect((await sign(ownerB, misplacedPath)).data).toBeNull();
  });

  it("user tidak bisa mengunggah, menimpa, atau menghapus file", async () => {
    const own = await ownerA.client.storage
      .from("media")
      .upload(`${wsA}/rls-${ctx.run}-user.png`, new Uint8Array([1]), { contentType: "image/png" });
    expect(own.error).not.toBeNull();
    const overwrite = await ownerA.client.storage
      .from("media")
      .update(pathA, new Uint8Array([1]), { contentType: "image/png" });
    expect(overwrite.error).not.toBeNull();
    await ownerA.client.storage.from("media").remove([pathA]);
    const stillThere = await ctx.admin.storage.from("media").download(pathA);
    expect(stillThere.data).not.toBeNull();
  });

  it("attach_media_details melengkapi media_placeholder sekali saja", async () => {
    const waId = `wamid.rls-media-${ctx.run}-placeholder`;
    const { error } = await ctx.admin.from("messages").insert({
      workspace_id: wsA,
      contact_id: contactA,
      wa_message_id: waId,
      arah: "masuk",
      tipe: "media_placeholder",
      dari_history: true,
      dikirim_pada: new Date().toISOString(),
    });
    expect(error).toBeNull();
    const item = { wa_message_id: waId, tipe: "document", media_id: "m-1", media_mime: "application/pdf", nama_file: "a.pdf", isi: null };
    expect((await ctx.admin.rpc("attach_media_details", { p_items: [item] })).data).toBe(1);
    expect((await ctx.admin.rpc("attach_media_details", { p_items: [{ ...item, media_id: "m-2" }] })).data).toBe(0);
    const { data } = await ctx.admin.from("messages").select("tipe, media_id, nama_file, media_status").eq("wa_message_id", waId).single();
    expect(data).toEqual({ tipe: "document", media_id: "m-1", nama_file: "a.pdf", media_status: null });
  });

  it("user tidak bisa memanggil attach_media_details", async () => {
    const { error } = await ownerA.client.rpc("attach_media_details", { p_items: [] });
    expect(error).not.toBeNull();
  });
});
