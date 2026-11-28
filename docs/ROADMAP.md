# Roadmap — maintenance dan pengembangan Connectiv

Status: 27 Nov 2026. Sprint 0–6 di `docs/TASKS.md` sudah berjalan; pilot pertama (Sobatimport) tersambung lewat Dualhook dengan data iklan Meta.

Pekerjaan berikutnya dibagi menjadi **9 jalur kerja**. Tiap jalur punya fokus sendiri dan sebaiknya dikerjakan di sesi Claude Code terpisah (satu jalur atau satu bagian jalur per sesi): rencana → kode → `lint`, `typecheck`, `test` → commit.

Label: 👤 dikerjakan Anda (akun, dokumen, keputusan, klien) · 🤖 dikerjakan Claude · ✅ selesai jika

---

## Urutan

| # | Jalur | Kapan | Alasan |
|---|---|---|---|
| 1 | 9A. Lokasi server | Paling awal | Perubahan kecil, kemungkinan efek kecepatan terbesar |
| 2 | 1. Keandalan data WhatsApp | Segera | Chat hilang = kepercayaan klien hilang |
| 3 | 2. Media chat | Berikutnya | Paling terasa oleh CS sehari-hari |
| 4 | 4. UX (mobile + filter) | Berikutnya | Supervisor sering memantau dari HP |
| 5 | 3. Tech Provider | Paralel, sejak sekarang | Menunggu verifikasi dari Meta |
| 6 | 7. Operasional pilot dan metrik | Selama pilot | Dasar keputusan go/no-go |
| 7 | 5 + 9B–9E. Kesiapan produksi dan performa | Sebelum klien berbayar | Stabil, aman, cepat |
| 8 | 6. Kualitas kode | Terus-menerus | Sedikit demi sedikit tiap sesi |
| 9 | 8. Fitur fase berikutnya | Setelah pilot lolos | Nilai tambah versi berbayar |

---

## 1. Keandalan data WhatsApp
**Fokus:** tidak ada chat yang hilang atau tertunda.

- [x] 🤖 Ingest berkelompok: satu panggilan SQL untuk banyak pesan (riwayat chat bisa ratusan pesan per webhook); hilangkan penyebab "fetch failed" dan proses ulang yang lambat
- [x] 🤖 Batas waktu proses webhook (`maxDuration`) cukup untuk paket riwayat besar; pecah pemrosesan jika perlu
- [x] 🤖 Cek dan tuntaskan webhook Sobatimport yang masih tertunda
- [x] 🤖 Halaman pemantauan di `/admin`: jumlah webhook tertunda/gagal per sumber, error terakhir, tombol "Proses ulang"
- [x] 🤖 Status nomor: tidak ada pesan > 24 jam, event `account_update` (terputus / `PARTNER_REMOVED`)
- [x] 🤖 Peringatan aplikasi WhatsApp Business di HP CS mendekati 14 hari tidak dibuka
- [x] 🤖 Tangani pesan `edit` dan `revoke` (perbarui / tandai dihapus); edit/revoke lama sudah di-backfill 27 Nov 2026 (`npm run webhook:backfill-edits`): 21 pesan diedit, 16 ditandai dihapus; 328 edit dari riwayat chat merujuk pesan asli yang tidak pernah dikirim Meta
- [x] 🤖 Hapus otomatis `webhook_events` > 90 hari (lewat cron harian), juga `sync_runs`
- ✅ Tidak ada webhook tertunda tanpa alasan; Super Admin bisa melihat dan memulihkan masalah dari `/admin`

## 2. Media chat
**Fokus:** gambar, voice note, video, dan dokumen bisa dilihat dan diputar di Inbox.

- [ ] 🤖 Bucket Supabase Storage privat `media`, RLS per workspace
- [ ] 🤖 Unduh media begitu pesan masuk (media id Meta kedaluwarsa ±7 hari):
  - nomor lewat Dualhook: Runtime API Dualhook dengan API key per koneksi
  - nomor lewat app sendiri / Tech Provider: Graph API dengan token
- [ ] 🤖 Simpan `media_path`, tampilkan lewat signed URL (berlaku 1 jam)
- [ ] 🤖 Pratinjau gambar, pemutar voice note dan video, tautan unduh dokumen
- [ ] 🤖 Riwayat chat: `media_placeholder` lalu detail media yang menyusul
- [ ] 👤 Simpan API key Dualhook Sobatimport di env (tidak lewat chat)
- ✅ CS dan supervisor bisa membuka semua lampiran tanpa membuka HP

## 3. Jalur resmi Tech Provider
**Fokus:** lepas dari Dualhook; klien menyambungkan nomor sendiri dari dashboard.

- [ ] 👤 Verifikasi bisnis PT Trinitas Delegasi Kreatif (dokumen sesuai alamat, website, konfirmasi lewat telepon/SMS)
- [ ] 👤 App Review `whatsapp_business_management` dan `whatsapp_business_messaging` (naskah video di `docs/TECH-PROVIDER.md`)
- [ ] 👤 Facebook Login for Business → Configuration Embedded Signup → catat Configuration ID
- [ ] 🤖 Sprint 2b: tombol "Tambah nomor" (Embedded Signup + Coexistence), tukar `code` → token, `subscribed_apps`, token tersimpan terenkripsi
- [ ] 🤖 Sinkronisasi kontak lalu riwayat otomatis (dalam 24 jam), status di UI
- [ ] 🤖 Pengaturan → Nomor WhatsApp untuk Owner: label, CS pemilik, status
- [ ] 👤🤖 Pindah nomor Sobatimport dari Dualhook ke jalur resmi (jam sepi), batalkan Dualhook
- ✅ Owner klien menambah nomor sales sendiri; tidak ada nomor yang bergantung pada Dualhook

## 4. Pengalaman pengguna (UX)
**Fokus:** nyaman dipakai CS dan supervisor setiap hari, di laptop maupun HP.

- [x] 🤖 Tampilan HP: sidebar menjadi menu ringkas/bawah; Inbox, Pipeline, Dashboard enak di layar kecil
- [x] 🤖 Filter Inbox lanjutan: CS, stage, iklan tertentu, rentang tanggal
- [x] 🤖 Filter Dashboard per nomor WA dan per CS
- [x] 🤖 Penanda chat belum dibaca dan notifikasi chat baru di browser
- [x] 🤖 Nama iklan dari Meta (tabel `ads`) dipakai di Inbox, Kontak, Pipeline
- [x] 🤖 Status kosong, loading, dan pesan error yang jelas di semua halaman
- [ ] 👤 Kumpulkan masukan CS dan supervisor Sobatimport tiap minggu

*Catatan jalur 4 (29 Nov 2026):* migrasi `20261128110000_ux_read_state_filters.sql` (tabel `contact_reads`, fungsi `inbox_contacts`, `inbox_summary`, `mark_all_contacts_read`, `workspace_ad_names`, `dashboard_*_v2`; aditif). Filter Inbox ada di URL (`?tab=&cs=&stage=&iklan=&dari=&sampai=&nomor=&q=`); rentang tanggal Inbox = tanggal pesan terakhir (WIB). Filter Dashboard per CS/nomor tidak memecah spend iklan (spend penuh tiap iklan). Nama iklan untuk CS lewat `workspace_ad_names` (security definer, hanya id + nama). Notifikasi browser hanya selama tab Connectiv terbuka (belum ada push/service worker).

- ✅ Supervisor bisa memantau dan CS bisa bekerja penuh dari HP

## 5. Kesiapan produksi
**Fokus:** aman dan stabil untuk klien berbayar.

- [ ] 👤 Project Supabase produksi `connectiv-prod` (Singapore, paket Pro)
- [ ] 🤖 Migrasi skema ke produksi, pindahkan data pilot, pisahkan env dev/produksi
- [ ] 👤 Domain `connectiv.delegativ.com` di Vercel; atur Deployment Protection
- [ ] 🤖 `admin_access_log`: catat setiap akses Super Admin ke workspace klien (PRD §6)
- [ ] 🤖 Pelacakan error (mis. Sentry) dan alert jika cron, webhook, atau sync iklan gagal
- [ ] 👤🤖 Backup harian dan uji pemulihan
- [ ] 👤 Review keamanan oleh developer berpengalaman (PRD §6)
- [ ] 👤 Perbarui alamat di halaman legal setelah akta perubahan selesai (`lib/company.ts`)
- ✅ Checklist keamanan PRD §6 terpenuhi; produksi terpisah dari dev

## 6. Kualitas kode dan perawatan rutin
**Fokus:** mudah dirawat dan aman diubah.

- [ ] 🤖 Tipe TypeScript otomatis dari skema Supabase (gantikan `.returns<>()` manual)
- [ ] 🤖 Test end-to-end (Playwright): login, chat masuk, pindah stage, Closing/Lost, dashboard
- [ ] 🤖 CI menjalankan test RLS terhadap project Supabase khusus test
- [ ] 🤖 Rapikan duplikasi query (lookup stage/anggota/nomor) ke satu modul
- [ ] 🤖 Update dependency bulanan + `npm audit`
- [ ] 👤 Pindahkan folder proyek ke luar OneDrive (mis. `C:\dev\connectiv`)
- ✅ Setiap perubahan diuji otomatis di CI sebelum masuk `main`

## 7. Operasional pilot dan metrik
**Fokus:** membuktikan target pilot (PRD §2.8) untuk keputusan go/no-go.

- [ ] 🤖 Halaman metrik pilot di `/admin`:
  - pesan ter-mirror dibanding chat di HP (≥ 99%)
  - chat yang ditandai Closing atau Lost (≥ 70%)
  - chat CTWA yang terkait ID iklan (≥ 90%)
  - supervisor/owner membuka dashboard (≥ 3x per minggu)
- [ ] 🤖 Catat kunjungan dashboard per user (untuk metrik di atas)
- [ ] 👤 SOP onboarding klien (versi HP, izinkan riwayat chat, jangan uninstall, buka aplikasi berkala, grup tidak tersinkron)
- [ ] 👤 Perjanjian pilot + persetujuan pemrosesan data (UU PDP)
- [ ] 👤 Review mingguan dengan klien pilot; wawancara harga di minggu 5–6
- [ ] 👤 Klien pilot ke-2 dan ke-3
- ✅ Data cukup untuk keputusan go/no-go (PRD §8)

## 8. Fitur fase berikutnya
**Fokus:** nilai tambah versi berbayar, setelah pilot lolos.

- [ ] 🤖 Balas chat dari Connectiv (dalam jendela 24 jam layanan pelanggan)
- [ ] 🤖 Analisis chat dengan AI: ringkasan percakapan, deteksi niat beli, saran follow-up, alasan Lost otomatis
- [ ] 🤖 Billing langganan (Midtrans/Xendit) dan paket harga
- [ ] 🤖 Pendaftaran klien mandiri (self-serve)
- [ ] 🤖 Laporan mingguan otomatis ke owner (email/WhatsApp)
- ✅ Klien bisa mendaftar, membayar, dan memakai Connectiv tanpa bantuan admin Delegativ

## 9. Performa database dan server
**Fokus:** halaman cepat dibuka dan tetap cepat saat data membesar.

**A. Lokasi server**
- [x] 🤖 Fungsi Vercel di region yang sama dengan database (dev: Seoul `icn1`; sebelumnya `vercel.json` tidak mengatur region, default Washington `iad1`)
- [ ] 🤖 Ukur waktu buka halaman sebelum dan sesudah (Vercel Speed Insights)
- [ ] 👤 Produksi: Supabase dan Vercel sama-sama Singapore (`ap-southeast-1` + `sin1`)

*Catatan 9A (27 Nov 2026):* `/api/health` sekarang melaporkan `region` (dari `VERCEL_REGION`) dan `db_latency_ms` (`auth_health`: fetch ke `/auth/v1/health`, `query`: satu query ringan ke `workspaces`). **Sebelum** (fungsi di `iad1`, database Seoul): waktu respons total `/api/health` produksi dari sisi klien, 10 kali `curl`, median **≈1,09 detik** (min 0,59, maks 1,77). **Sesudah:** diukur ulang setelah deploy ke `main` dengan cara yang sama; cek juga `region` terbaca `icn1` dan cron harian tetap terdaftar di Vercel.

**B. Kapasitas database**
- [ ] 👤 Supabase Pro untuk produksi (compute khusus, tanpa pause, backup)
- [ ] 🤖 Pantau query lambat (Supabase Advisors / Query Performance)

**C. Index dan query**
- [ ] 🤖 Index untuk dashboard: `contacts(workspace_id, dibuat_pada)`, `deals(contact_id, status)`, `messages(contact_id, arah, dikirim_pada)`, `stage_history(ke_stage)`
- [ ] 🤖 Fungsi RLS dievaluasi sekali per query (pola `(select …)`), bukan per baris
- [ ] 🤖 Kurangi query berurutan di Inbox, Kontak, detail kontak
- [ ] 🤖 Ambil profil anggota workspace saja, bukan semua profil yang terlihat

**D. Data yang membesar**
- [x] 🤖 Paginasi daftar Inbox dan Kontak; "muat pesan lama" di percakapan
- [ ] 🤖 Ingest berkelompok (bersama jalur 1)
- [ ] 🤖 Arsip/hapus data lama (`webhook_events`, `sync_runs`)

**E. Cache dan pemantauan**
- [ ] 🤖 Cache data yang jarang berubah (stage, anggota, nomor WA) dengan cache Next.js 16 + invalidasi saat diubah
- [ ] 🤖 Pantau ukuran database dan jumlah koneksi Realtime
- ✅ Inbox dan Dashboard terbuka < 1 detik untuk workspace dengan puluhan ribu pesan

---

## Cara memakai roadmap ini

- Mulai sesi baru dengan menyebut jalurnya, mis. *"Kerjakan jalur 9A di docs/ROADMAP.md"*.
- Centang checklist di file ini saat selesai; task sprint lama tetap di `docs/TASKS.md`.
- Keputusan baru (mis. hasil review klien, perubahan prioritas) ditulis di bagian jalur terkait.
