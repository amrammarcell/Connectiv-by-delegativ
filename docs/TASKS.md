# Task — Connectiv (Pilot + MVP)

Turunan dari `docs/PRD.md` dan `docs/ARCHITECTURE.md`. Satu task ≈ satu sesi kecil dengan Claude Code: rencana → kode → test → commit.

Label: 👤 dikerjakan Anda (akun, akses, keputusan) · 🤖 dikerjakan Claude · ✅ kriteria selesai

---

## Sprint 0 — Fondasi
- [ ] 👤 Daftar Supabase, buat project `connectiv-dev` (region Singapore), simpan password DB
- [ ] 👤 Daftar Vercel dengan akun GitHub, import repo `Connectiv-by-delegativ`
- [ ] 🤖 Scaffold Next.js 15 + TypeScript + Tailwind + shadcn/ui + ESLint/Prettier
- [ ] 🤖 Setup Supabase CLI, folder `supabase/migrations`, client server/browser/service-role
- [ ] 🤖 Validasi env dengan Zod, `.env.example`
- [ ] 🤖 Layout aplikasi (sidebar, header, tema) sesuai prototipe UI
- [ ] 🤖 `CLAUDE.md`: konvensi, perintah, aturan keamanan
- [ ] 🤖 Vitest + GitHub Actions (lint, typecheck, test)
- ✅ Aplikasi kosong bisa dibuka online di URL Vercel

## Sprint 1 — Auth, workspace, peran, RLS
- [ ] 🤖 Migrasi: `workspaces`, `profiles`, `memberships`, trigger buat profile saat signup
- [ ] 🤖 Fungsi `is_member`, `role_in`, `is_super_admin` + kebijakan RLS
- [ ] 🤖 Halaman login, logout, pilih workspace, routing `/w/[slug]`
- [ ] 🤖 Admin: buat workspace (otomatis membuat stage default), undang Owner
- [ ] 🤖 Pengaturan → User: Owner mengundang Supervisor/CS, ubah peran
- [ ] 🤖 Test isolasi: dua workspace × dua peran, semua tabel
- ✅ User dua workspace tidak bisa saling melihat data (dibuktikan test)

## Sprint 2 — Webhook + adapter + pesan
- [ ] 👤 Pilih BSP (checklist PRD 2.5), daftarkan URL webhook staging
- [ ] 🤖 Migrasi: `wa_numbers`, `contacts`, `messages`, `stages`, `stage_history`, `webhook_events`
- [ ] 🤖 Fixture payload dari dokumentasi Meta: text, image, document, audio, referral CTWA, `smb_message_echoes`, `history`, status
- [ ] 🤖 `signature.ts` + route GET/POST webhook, simpan mentah, `after()`
- [ ] 🤖 Adapter Meta → `NormalizedEvent` (+ test per fixture)
- [ ] 🤖 Processor: routing workspace, upsert kontak, insert pesan idempoten, kolom denormalisasi, atribusi first-touch (+ test)
- [ ] 🤖 Unduh media ke Storage privat + signed URL
- [ ] 🤖 Cron retry webhook gagal
- [ ] 🤖 Admin: tambah nomor WA ke workspace, status koneksi
- ✅ Chat di nomor internal muncul di database, tanpa duplikat

## Sprint 3 — Inbox mirroring + waktu tanggapan
- [ ] 🤖 Daftar percakapan (urut pesan terbaru), pencarian nama/nomor
- [ ] 🤖 Panel percakapan: gelembung masuk/keluar, teks, gambar, dokumen, voice note
- [ ] 🤖 Realtime: pesan baru dan urutan daftar tanpa refresh
- [ ] 🤖 F4a: status "Menunggu sejak / Dibalas X lalu", warna batas waktu, timer 30 detik
- [ ] 🤖 Filter: nomor WA, CS, stage, iklan asal, rentang tanggal, "Belum dibalas"
- [ ] 🤖 Pengaturan → batas waktu kuning/merah
- ✅ Chat muncul di dashboard tanpa refresh, lengkap dengan status waktu tanggapan

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
