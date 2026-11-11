# PRD — WhatsApp CRM dengan Atribusi Meta Ads
**Fase:** Pilot + MVP (Tahap 1 & 2)
**Pemilik produk:** Delegativ (PT Trinitas Delegasi Kreatif)
**Status:** Draft v0.3
**Nama produk:** Connectiv
**Bahasa UI:** Indonesia

---

## 1. Ringkasan

Produk SaaS berlangganan untuk bisnis yang menjalankan iklan Meta (Click-to-WhatsApp) dan menangani calon pembeli lewat WhatsApp. Produk ini:

1. **Mencerminkan (mirroring)** semua chat WhatsApp CS ke satu dashboard, sehingga pemilik bisnis dan supervisor bisa memantau CS tanpa memegang HP CS.
2. **Mengelola pipeline** setiap kontak dari chat pertama sampai Closing atau Lost.
3. **Mengaitkan setiap chat ke iklan asalnya**, sehingga klien bisa melihat iklan mana yang menghasilkan closing, bukan hanya chat murah.

CS tetap membalas dari aplikasi WhatsApp Business di HP seperti biasa (memakai fitur Coexistence dari Meta). CRM hanya "mendengarkan" pada fase MVP.

**Pembeda utama:** atribusi iklan sampai ke closing. Ini yang membuat produk relevan dibanding CRM WhatsApp umum.

---

## 2. Tahap 1 — Pilot

### 2.1 Tujuan pilot
- Membuktikan mirroring chat lewat Coexistence berjalan stabil di nomor nyata.
- Membuktikan CS dan supervisor mau memakai pipeline dan menandai Closing/Lost secara konsisten.
- Mendapatkan data untuk menentukan harga langganan.
- Mendapatkan testimoni dan studi kasus untuk penjualan.

### 2.2 Kriteria klien pilot (pilih 2–3)
- Sudah menjalankan iklan Click-to-WhatsApp secara rutin.
- Memakai **WhatsApp Business App** (bukan WhatsApp biasa) dan nomornya sudah aktif minimal 7 hari.
- Volume chat cukup untuk dianalisa (idealnya puluhan chat per hari).
- Pemilik bisnis terbuka memberi feedback rutin.
- Sudah klien retainer Delegativ (lebih mudah dikoordinasi).

### 2.3 Durasi dan biaya
- Durasi: 6–8 minggu.
- Biaya: gratis atau diskon besar, dengan imbalan feedback mingguan dan izin memakai hasil sebagai studi kasus.

### 2.4 Persiapan sebelum pilot
| Item | Penanggung jawab | Catatan |
|---|---|---|
| Pilih BSP yang mendukung Coexistence | Delegativ | Lihat checklist 2.5 |
| Perjanjian pilot + persetujuan pemrosesan data | Delegativ + klien | Wajib, karena kita menyimpan chat pelanggan klien (UU PDP) |
| Pastikan nomor CS memakai WhatsApp Business App | Klien | Pindahkan dulu kalau masih WhatsApp biasa |
| Akses read-only ke Ad Account Meta klien | Klien | Untuk menarik data spend per iklan |
| Briefing CS dan supervisor | Delegativ | Cara menandai stage, Closing, dan Lost |
| Uji coba di nomor internal Delegativ dulu | Delegativ | Sebelum menyentuh nomor klien |

### 2.5 Checklist memilih BSP
- [ ] Mendukung onboarding **Coexistence** (WhatsApp Business App + API di nomor yang sama).
- [ ] Mendukung sinkronisasi riwayat chat (event `history`).
- [ ] Meneruskan event `smb_message_echoes` (balasan CS dari HP).
- [ ] Webhook diteruskan dalam **format asli Meta** (memudahkan pindah ke status Tech Provider nanti).
- [ ] Biaya bulanan jelas, termasuk biaya kalau hanya dipakai untuk mirroring.
- [ ] Tidak mengunci nomor (nomor bisa dipindah ke provider lain atau ke app sendiri).

### 2.6 Hal yang perlu disampaikan ke klien
- Aplikasi WhatsApp Business **tidak boleh di-uninstall** dan harus dibuka minimal sekali setiap 13 hari.
- Setelah tersambung, perangkat tertaut (misalnya WhatsApp Web) akan terputus dan perlu ditautkan ulang.
- **Grup chat tidak ikut tersinkron**, hanya chat personal (1:1).
- Balasan CS dari HP tetap gratis.

### 2.7 Timeline pilot
| Minggu | Kegiatan |
|---|---|
| 0 | Uji di nomor internal, perjanjian pilot, onboarding nomor klien |
| 1–2 | Mirroring + pipeline berjalan, perbaikan bug harian |
| 3–4 | Dashboard atribusi iklan aktif, review mingguan dengan klien |
| 5–6 | Evaluasi pemakaian, wawancara harga |
| 7–8 | Keputusan lanjut (go/no-go), siapkan versi berbayar |

### 2.8 Metrik keberhasilan pilot
| Metrik | Target |
|---|---|
| Pesan yang berhasil ter-mirror (dibanding chat di HP) | ≥ 99% |
| Chat yang ditandai Closing atau Lost oleh CS | ≥ 70% |
| Chat dari iklan CTWA yang berhasil terkait ke ID iklan | ≥ 90% |
| Supervisor/pemilik membuka dashboard | ≥ 3x per minggu |
| Klien pilot bersedia lanjut berbayar | ≥ 1 dari 3 |

---

## 3. Tahap 2 — MVP

### 3.1 Ruang lingkup

**Termasuk di MVP**
- Login dan workspace per klien (multi-tenant).
- Koneksi nomor WhatsApp per sales lewat tombol "Tambah nomor" (Embedded Signup resmi Meta, Coexistence), dengan auto-assign kontak ke sales pemilik nomor.
- Penerimaan webhook dan penyimpanan pesan.
- Inbox mirroring (read-only, realtime).
- Indikator waktu tanggapan per chat (menunggu balasan / sudah dibalas, dengan warna batas waktu).
- Kontak dengan deduplikasi berdasarkan nomor HP.
- Pipeline kanban.
- Penanda Closing (dengan nilai transaksi) dan Lost (dengan alasan).
- Atribusi iklan dari chat Click-to-WhatsApp.
- Sinkronisasi data spend iklan harian dari Meta.
- Dashboard performa per iklan dan kecepatan respon.

**Tidak termasuk di MVP (fase berikutnya)**
- Membalas chat dari CRM.
- Analisa chat dengan AI.
- Billing langganan dan payment gateway.
- Pendaftaran klien baru secara mandiri (self-serve signup + billing).
- Broadcast dan template marketing.
- Aplikasi mobile.

### 3.2 Peran pengguna
| Peran | Akses |
|---|---|
| Super Admin (Delegativ) | Semua workspace, setup nomor, monitoring sistem |
| Owner (klien) | Semua data di workspace-nya, kelola user dan stage |
| Supervisor | Lihat semua chat, assign kontak ke CS, lihat dashboard |
| CS | Lihat kontak yang di-assign, ubah stage, tandai Closing/Lost |

### 3.3 Fitur dan kriteria penerimaan

**F1. Autentikasi dan workspace**
- User login dengan email.
- Setiap data (kontak, pesan, iklan) terikat ke satu workspace.
- User dari workspace A tidak bisa mengakses data workspace B dalam kondisi apa pun (diuji secara eksplisit).

**F2. Koneksi nomor WhatsApp per sales**
- Owner atau Supervisor membuka **Pengaturan → Nomor WhatsApp → Tambah nomor**, mengisi label (mis. "Dewi – Sales 1") dan memilih CS pemilik nomor.
- Tombol membuka popup resmi Meta (Embedded Signup, Coexistence). Sales memindai QR atau mengonfirmasi dari aplikasi WhatsApp Business di HP-nya. Cukup sekali per nomor; tidak ada scan ulang.
- Setelah tersambung, sistem otomatis berlangganan webhook nomor itu dan meminta sinkronisasi kontak + riwayat chat (wajib dalam 24 jam).
- Satu workspace bisa punya banyak nomor; setiap nomor punya satu CS pemilik (opsional).
- Status koneksi terlihat per nomor: aktif / terputus / pesan terakhir diterima kapan, plus peringatan jika aplikasi di HP tidak dibuka mendekati 14 hari.
- Syarat nomor: WhatsApp Business App (bukan WhatsApp biasa) versi 2.24.17+, sudah aktif dipakai. Batas awal Tech Provider: 10 nomor baru per minggu (semua klien).
- Super Admin tetap bisa menambah nomor secara manual (phone_number_id, WABA ID) untuk keperluan uji.

**F3. Penerimaan webhook**
- Endpoint memverifikasi verify token (saat pendaftaran) dan signature setiap request.
- Menangani event: `messages` (pesan masuk), `smb_message_echoes` (balasan CS dari HP), `history` (impor riwayat).
- Idempoten: pesan dengan ID yang sama tidak tersimpan dua kali.
- Payload mentah disimpan untuk keperluan debug.
- Endpoint selalu membalas cepat (proses berat dijalankan setelahnya) supaya tidak di-retry terus oleh Meta.
- Ada lapisan **adapter**: format webhook BSP diubah ke format internal, sehingga pindah dari BSP ke app sendiri nanti cukup mengganti adapter.

**F4. Inbox mirroring**
- Daftar percakapan diurutkan dari pesan terbaru.
- Pesan baru muncul tanpa refresh (realtime).
- Pesan dari customer dan balasan CS dibedakan jelas.
- Mendukung tampilan teks, gambar, dokumen, voice note (minimal sebagai lampiran yang bisa dibuka).
- Filter: nomor WA, CS yang di-assign, stage, iklan asal, rentang tanggal.
- Pencarian berdasarkan nama atau nomor kontak.

**F4a. Waktu tanggapan per chat**
- Setiap percakapan di daftar inbox menampilkan status berdasarkan arah pesan terakhir:
  - Pesan terakhir dari customer → "Menunggu balasan sejak X lalu".
  - Pesan terakhir dari CS → "Dibalas X lalu".
- Waktu ditampilkan relatif (menit / jam / hari) dan diperbarui otomatis tanpa refresh.
- Warna batas waktu untuk chat yang menunggu balasan. Default: hijau < 15 menit, kuning 15–60 menit, merah > 60 menit. Owner bisa mengubah batasnya per workspace.
- Filter "Belum dibalas" dan urutan "paling lama menunggu" di atas.
- Pesan hasil impor `history` yang lebih tua dari 7 hari tidak dihitung sebagai "menunggu balasan", supaya inbox tidak langsung merah semua saat onboarding.
- Data yang sama dipakai untuk metrik kecepatan respon di dashboard (F10).

**F5. Kontak**
- Kontak dibuat otomatis saat pesan pertama masuk.
- Deduplikasi berdasarkan nomor HP per workspace.
- Kontak baru otomatis di-assign ke CS pemilik nomor yang menerima chat pertama.
- Supervisor bisa mengubah assign kontak ke CS lain.
- Catatan internal per kontak.

**F6. Pipeline**
- Tampilan kanban per workspace.
- Stage default: **Baru → Dihubungi → Tertarik → Negosiasi → Closing / Lost**.
- Owner bisa mengubah nama dan urutan stage.
- Kontak baru otomatis masuk stage "Baru".
- Setiap perpindahan stage tercatat (siapa, kapan, dari stage apa ke apa).

**F7. Closing dan Lost**
- Closing wajib mengisi nilai transaksi (Rupiah).
- Lost wajib memilih alasan dari daftar tetap:
  - Harga tidak cocok
  - Tidak membalas / menghilang
  - Produk tidak sesuai kebutuhan
  - Memilih kompetitor
  - Hanya bertanya-tanya
  - Lainnya (dengan catatan)
- Daftar alasan tetap ini penting supaya data bisa dihitung di dashboard.

**F8. Atribusi iklan**
- Pesan pertama dari iklan Click-to-WhatsApp membawa data referral (ID iklan, headline, ctwa_clid). Data ini disimpan ke kontak.
- Atribusi memakai **first-touch**: iklan pertama yang membawa kontak masuk.
- Kontak tanpa data referral ditandai sebagai "Organik / Tidak diketahui".

**F9. Sinkronisasi data iklan**
- Job terjadwal setiap hari menarik data dari Meta Marketing API: spend, impressions, klik, dan jumlah percakapan dimulai, per iklan per hari.
- Menyimpan nama campaign, ad set, dan iklan supaya dashboard mudah dibaca.
- Kegagalan sinkronisasi tercatat dan terlihat oleh Super Admin.

**F10. Dashboard**
- Per iklan: spend, jumlah chat, jumlah closing, revenue, biaya per chat, **biaya per closing**, ROAS.
- Funnel antar stage: berapa persen kontak yang lanjut ke stage berikutnya.
- Distribusi alasan Lost.
- Kecepatan respon: waktu dari pesan customer sampai balasan pertama.
- Filter rentang tanggal dan nomor WA.

### 3.4 Keterbatasan yang sudah diketahui
- **Satu nomor dipakai beberapa CS:** balasan dari HP tidak menunjukkan CS mana yang mengetik. Kinerja per CS dihitung berdasarkan kontak yang di-assign. Disarankan **satu nomor per sales** supaya kecepatan respon dan closing per sales akurat.
- **Chat organik** (bukan dari iklan) tidak punya data atribusi.
- **Riwayat chat lama** hanya tersedia sejauh yang disinkronkan saat onboarding.

---

## 4. Model data (awal)

| Tabel | Kolom utama |
|---|---|
| `workspaces` | id, nama, batas_kuning_menit, batas_merah_menit, dibuat_pada |
| `users` | id, email, nama |
| `memberships` | user_id, workspace_id, peran |
| `wa_numbers` | id, workspace_id, phone_number_id, waba_id, label, cs_pemilik, status, terakhir_terima_pesan, tersambung_pada |
| `contacts` | id, workspace_id, nomor_hp, nama, assigned_to, stage_id, ad_id, ctwa_clid, sumber, pesan_terakhir_pada, arah_pesan_terakhir, menunggu_balasan_sejak, dibuat_pada |
| `messages` | id, workspace_id, contact_id, wa_number_id, wa_message_id (unik), arah (masuk/keluar), tipe, isi, media_url, dikirim_pada |
| `stages` | id, workspace_id, nama, urutan, tipe (normal/closing/lost) |
| `stage_history` | id, contact_id, dari_stage, ke_stage, oleh_user, pada |
| `deals` | id, contact_id, status (closing/lost), nilai, alasan_lost, catatan, pada |
| `ad_accounts` | id, workspace_id, meta_ad_account_id, status_sync |
| `ads` | id, workspace_id, meta_ad_id, nama_iklan, nama_adset, nama_campaign |
| `ad_insights_daily` | ad_id, tanggal, spend, impressions, klik, percakapan_dimulai |
| `webhook_events` | id, sumber, payload_mentah, diproses, error, diterima_pada |

Semua tabel yang punya `workspace_id` wajib dilindungi row-level security.

Kolom `pesan_terakhir_pada`, `arah_pesan_terakhir`, dan `menunggu_balasan_sejak` di `contacts` diperbarui setiap ada pesan baru (denormalisasi), supaya inbox tetap cepat tanpa menghitung ulang dari tabel `messages`. `menunggu_balasan_sejak` diisi waktu pesan customer pertama yang belum dibalas, dan dikosongkan saat CS membalas.

---

## 5. Arsitektur dan stack

- **Frontend + backend:** Next.js (App Router, TypeScript)
- **Database, auth, realtime:** Supabase (Postgres + Row Level Security)
- **Hosting:** Vercel atau Netlify
- **Job terjadwal:** Vercel Cron atau Supabase scheduled functions
- **UI:** Tailwind + komponen shadcn/ui

**Alur data**
```
Customer chat dari iklan CTWA
        │
        ▼
WhatsApp (HP CS) ◄──── Coexistence ────► Cloud API
                                            │
                                     webhook (via BSP)
                                            ▼
                         /api/webhooks/whatsapp → adapter → simpan
                                            │
                                            ▼
                                   Supabase (realtime)
                                            │
                                            ▼
                              Inbox, Pipeline, Dashboard

Meta Marketing API ── cron harian ──► ad_insights_daily ──► Dashboard
```

---

## 6. Keamanan (wajib sebelum ada klien berbayar)

- Token Meta, token BSP, dan secret disimpan di environment variable, tidak pernah di kode atau di chat.
- Verifikasi signature di setiap request webhook.
- Row-level security di semua tabel workspace, plus test otomatis yang membuktikan isolasi antar workspace.
- Media (gambar, dokumen) disimpan di storage privat dengan URL bertanda waktu (signed URL).
- Log akses Super Admin.
- **Review kode oleh developer berpengalaman** sebelum versi berbayar diluncurkan.

---

## 7. Urutan pengerjaan (sprint)

| Sprint | Fokus | Selesai jika |
|---|---|---|
| 0 | Setup repo, Supabase, deploy kosong, `CLAUDE.md` | Aplikasi bisa dibuka online |
| 1 | Auth, workspace, peran, RLS + test isolasi | User dua workspace tidak bisa saling melihat data |
| 2 | Webhook + adapter + tabel pesan | Chat di nomor internal muncul di database |
| 3 | Inbox mirroring realtime + waktu tanggapan per chat | Chat muncul di dashboard tanpa refresh, lengkap dengan status "menunggu / dibalas X lalu" |
| 4 | Kontak, assign CS, pipeline kanban | Kontak bisa dipindah antar stage |
| 5 | Closing/Lost + atribusi iklan | Kontak dari iklan menampilkan nama iklannya |
| 6 | Sinkronisasi Meta Ads + dashboard | Biaya per closing per iklan tampil |
| 7 | Uji di nomor internal, perbaikan, onboarding klien pilot | Pilot dimulai |

**Tips vibe coding dengan Claude Code**
- Satu sprint = beberapa sesi kecil, satu fitur per sesi.
- Minta Claude membuat rencana dulu sebelum menulis kode.
- Commit ke Git setiap kali satu fitur berjalan.
- Minta Claude menulis test untuk webhook handler dan RLS.
- Uji webhook dengan payload contoh dari dokumentasi Meta sebelum memakai nomor sungguhan.

---

## 8. Keputusan go/no-go setelah pilot

Lanjut ke versi berbayar jika:
- Metrik di bagian 2.8 tercapai, terutama tingkat penandaan Closing/Lost dan kesediaan bayar.
- Tidak ada insiden kebocoran data atau kehilangan pesan yang signifikan.

Jika tercapai, fase berikutnya: status Tech Provider, onboarding mandiri, billing (Midtrans/Xendit), dan fitur balas dari CRM.

---

## 9. Pertanyaan terbuka

- [ ] BSP mana yang dipilih untuk pilot?
- [ ] Klien pilot mana saja (2–3)?
- [x] Nama produk? → **Connectiv**
- [ ] Model harga yang akan diuji: per nomor WhatsApp, per user CS, atau paket?
- [ ] Apakah klien retainer Delegativ mendapat CRM sebagai bagian paket?
- [ ] Siapa developer yang akan mereview keamanan sebelum versi berbayar?
