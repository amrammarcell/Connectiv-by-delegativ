# Task — Connectiv (Pilot + MVP)

Turunan dari `docs/PRD.md` dan `docs/ARCHITECTURE.md`. Satu task ≈ satu sesi kecil dengan Claude Code: rencana → kode → test → commit.

Label: 👤 dikerjakan Anda (akun, akses, keputusan) · 🤖 dikerjakan Claude · ✅ kriteria selesai

---

## Sprint 0 — Fondasi
- [x] 👤 Daftar Supabase, buat project `connectiv-dev` (region Singapore), simpan password DB
- [x] 👤 Isi `.env.local` dengan kunci Supabase (`docs/SETUP.md` bagian 2), cek `/api/health`
- [x] 👤 Daftar Vercel dengan akun GitHub, import repo `Connectiv-by-delegativ` (`docs/SETUP.md` bagian 3)
- [x] 🤖 Scaffold Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui + ESLint
- [x] 🤖 Setup Supabase CLI (`supabase/config.toml`), client browser/server/admin
- [x] 🤖 Validasi env dengan Zod, `.env.example`, endpoint `/api/health`
- [x] 🤖 Layout aplikasi (sidebar, header, tema) sesuai prototipe UI
- [x] 🤖 `CLAUDE.md`: konvensi, perintah, aturan keamanan
- [x] 🤖 Vitest + GitHub Actions (lint, typecheck, test, build)
- ✅ Aplikasi kosong bisa dibuka online di URL Vercel — **selesai**: https://connectiv-by-delegativ-qjop.vercel.app

## Sprint 1 — Auth, workspace, peran, RLS
- [x] 🤖 Migrasi: `workspaces`, `profiles`, `memberships`, `stages` (6 stage default otomatis), trigger profil saat user baru
- [x] 🤖 Fungsi `is_member`, `role_in`, `is_super_admin`, `shares_workspace` + kebijakan RLS + hak akses per kolom
- [x] 🤖 Halaman login, logout, ganti password, pilih workspace, `proxy.ts`, routing `/w/[slug]` (404 jika bukan anggota)
- [x] 🤖 Admin: buat workspace + Owner (password sementara ditampilkan sekali)
- [x] 🤖 Pengaturan → User: Owner menambah Supervisor/CS, ubah peran, hapus anggota
- [x] 🤖 Test isolasi: 18 test RLS (dua workspace, tiga peran, user luar, anonim)
- [x] 👤 Buat akun sendiri di Supabase → Authentication → Users, lalu `npm run admin:promote -- email`
- [ ] 👤 Matikan pendaftaran publik: Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" off
- ✅ User dua workspace tidak bisa saling melihat data (dibuktikan test) — **selesai**

## Sprint 2 — Webhook + adapter + pesan
- [x] 👤 Pilih jalur: **Tech Provider Delegativ sendiri** (resmi, tanpa BSP). Lihat `docs/TECH-PROVIDER.md`, latar belakang di `docs/BSP.md`
- [x] 👤 Isi alamat dan email kontak di `lib/company.ts` (dipakai halaman legal)
- [ ] 👤 Tech Provider tahap 0–3: dokumen PT, domain, Business Portfolio, app Meta, verifikasi bisnis, App Review
- [x] 🤖 Halaman legal publik: `/kebijakan-privasi`, `/syarat-ketentuan`, `/hapus-data`
- [ ] 👤 (Opsional) Dualhook trial untuk uji nomor internal sambil menunggu App Review
- [x] 🤖 Migrasi `webhook_events` (RLS: hanya server)
- [x] 🤖 Migrasi: `wa_numbers` (+ `cs_pemilik`), `contacts`, `messages`, `stage_history` (trigger), fungsi SQL `ingest_message`, RLS CS hanya kontak miliknya, Realtime
- [x] 🤖 Fixture payload: teks + gambar asli (nomor tes Meta), `smb_message_echoes`, `history`, referral CTWA, contoh dashboard
- [ ] 🤖 Fixture asli untuk document, audio, `smb_message_echoes`, `history` begitu nomor Coexistence tersambung
- [x] 🤖 Route GET/POST `/api/webhooks/whatsapp/[token]`: token rahasia di URL, verify token, signature opsional, simpan mentah
- [x] 🤖 Proses setelah simpan dengan `after()`; `npm run webhook:reprocess` untuk yang tertunda
- [x] 🤖 Adapter Meta → `NormalizedMessage` (+ 7 test fixture)
- [x] 🤖 Processor: routing workspace, upsert kontak, insert pesan idempoten, kolom denormalisasi, atribusi first-touch, auto-assign `cs_pemilik`, buka ulang Closing/Lost (+ 13 test integrasi)
- [ ] 🤖 Unduh media ke Storage privat + signed URL (butuh token permanen: system user / business token)
- [ ] 🤖 Cron retry webhook gagal (Vercel Hobby hanya cron harian; pertimbangkan Supabase pg_cron)
- [x] 🤖 Admin: tambah nomor WA manual (untuk uji), status koneksi
- [x] 👤 Buat app "Connectiv" di Meta for Developers, sambungkan nomor tes gratis ke webhook (chat asli masuk 18 Nov 2026)
- [x] 👤 Pasang `WHATSAPP_APP_SECRET` di Vercel supaya signature webhook diverifikasi

## Sprint 2b — Nomor WhatsApp per sales (setelah App Review lolos)
- [ ] 🤖 Migrasi: `wa_numbers.cs_pemilik`, `tersambung_pada`, `sync_kontak_pada`, `sync_riwayat_pada`; token bisnis tersimpan terenkripsi
- [ ] 🤖 Pengaturan → Nomor WhatsApp: daftar nomor, label, CS pemilik, status, pesan terakhir, peringatan 14 hari
- [ ] 🤖 Tombol "Tambah nomor": Facebook JS SDK + Embedded Signup (Coexistence), tangkap `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`
- [ ] 🤖 Server: tukar `code` → business token, `POST /<WABA_ID>/subscribed_apps`, simpan nomor
- [ ] 🤖 Sync kontak lalu riwayat (`/<PHONE_NUMBER_ID>/smb_app_data`) otomatis dalam 24 jam, dengan status di UI
- ✅ Owner menambah nomor sales sendiri dari dashboard, chat-nya masuk dan langsung di-assign ke sales tersebut
- ✅ Chat di nomor internal muncul di database, tanpa duplikat

## Sprint 3 — Inbox mirroring + waktu tanggapan
- [x] 🤖 Daftar percakapan (urut pesan terbaru), pencarian nama/nomor
- [x] 🤖 Panel percakapan: gelembung masuk/keluar, teks, penanda lampiran (pratinjau gambar/voice note menunggu unduh media)
- [x] 🤖 Realtime: pesan baru dan urutan daftar tanpa refresh
- [x] 🤖 F4a: status "Menunggu sejak / Dibalas X lalu", warna batas waktu, timer 30 detik
- [x] 🤖 Filter: Semua / Belum dibalas (urut paling lama) / Dari iklan, nomor WA
- [ ] 🤖 Filter lanjutan: CS, stage, iklan tertentu, rentang tanggal
- [ ] 🤖 Tampilan mobile: sidebar jadi menu ringkas supaya inbox langsung terlihat
- [x] 🤖 Pengaturan → batas waktu kuning/merah
- ✅ Chat muncul di dashboard tanpa refresh, lengkap dengan status waktu tanggapan — **selesai** (diuji dengan chat asli + simulasi realtime)

## Sprint 4 — Kontak, assign, pipeline
- [ ] 👤 Konfirmasi: pipeline berbasis kontak + buka ulang saat repeat (ARCHITECTURE §4)
- [ ] 🤖 Halaman kontak (tabel + detail), catatan internal
- [ ] 🤖 Assign kontak ke CS (Supervisor/Owner), RLS CS hanya kontak sendiri
- [ ] 🤖 Kanban drag & drop, trigger `stage_history`, realtime antar user
- [ ] 🤖 Pengaturan → stage: ubah nama dan urutan
- ✅ Kontak bisa dipindah antar stage, riwayat tercatat

## Sprint 5 — Closing/Lost + atribusi
- [ ] 🤖 Migrasi `deals`, dialog Closing (nilai Rupiah wajib) & Lost (alasan tetap + catatan untuk "Lainnya")
- [ ] 🤖 Badge iklan asal di inbox, kontak, kanban; "Organik / Tidak diketahui"
- [ ] 🤖 Riwayat deal di detail kontak
- ✅ Kontak dari iklan menampilkan nama iklannya, Closing/Lost tersimpan dengan data wajib

## Sprint 6 — Sinkronisasi Meta Ads + dashboard
- [ ] 👤 Buat system user di Business Manager Delegativ, minta akses partner read-only ke ad account klien
- [ ] 🤖 Migrasi `ad_accounts`, `ads`, `ad_insights_daily`, `sync_runs`
- [ ] 🤖 Job sync harian + tombol "Sync sekarang" + log error di Admin
- [ ] 🤖 Fungsi SQL dashboard: iklan, funnel, alasan lost, waktu respon
- [ ] 🤖 Halaman dashboard: KPI, tabel per iklan, funnel, chart lost, waktu respon, filter
- ✅ Biaya per closing per iklan tampil

## Sprint 7 — Uji internal & onboarding pilot
- [ ] 👤 Perjanjian pilot + persetujuan pemrosesan data (UU PDP)
- [ ] 🤖 Project `connectiv-prod`, env produksi, `admin_access_log`
- [ ] 🤖 Uji end-to-end di nomor internal 1 minggu, hitung tingkat mirror ≥ 99%
- [ ] 🤖 Perbaikan bug, review keamanan mandiri (checklist PRD §6)
- [ ] 👤 Onboarding nomor klien pilot + briefing CS & supervisor
- ✅ Pilot dimulai
