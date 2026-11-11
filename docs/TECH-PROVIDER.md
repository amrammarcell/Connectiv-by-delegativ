# Pendaftaran Tech Provider WhatsApp — Delegativ

Tujuan: Delegativ (PT Trinitas Delegasi Kreatif) menjadi **Tech Provider** di Meta supaya Connectiv bisa menyambungkan nomor WhatsApp Business App milik klien (Coexistence) lewat Embedded Signup, tanpa BSP dan tanpa biaya platform.

Sumber: dokumentasi resmi Meta for Developers, dibaca 10 Nov 2026 (daftar di bawah). Nama menu bisa sedikit berbeda di dashboard; ikuti padanan terdekat.

Label: 👤 dikerjakan Anda di dashboard Meta · 🤖 disiapkan di kode Connectiv

---

## Gambaran

| Tahap | Siapa | Perkiraan waktu |
|---|---|---|
| 0. Persiapan dokumen, domain, dan halaman legal | 👤 + 🤖 | 1–2 hari |
| 1. Business Portfolio + Meta app | 👤 | 1 jam |
| 2. Verifikasi bisnis | 👤 | tidak disebut Meta; umumnya beberapa hari kerja |
| 3. App Review (2 izin) | 👤 | rata-rata ±24 jam menurut Meta, bisa lebih jika ditolak |
| 4. Konfigurasi Embedded Signup + webhook | 👤 + 🤖 | 1 hari |
| 5. Uji di nomor internal, lalu Live | 👤 + 🤖 | 1–3 hari |

Biaya program Tech Provider: Meta tidak menyebut biaya. Balasan CS dari WhatsApp Business App tetap gratis; hanya pesan yang dikirim lewat Cloud API yang ditagih (MVP tidak mengirim).

Batas awal: **maksimal 10 klien baru per 7 hari**. Setelah verifikasi bisnis, App Review, dan *Access Verification* selesai, naik otomatis menjadi 200 per 7 hari. Cukup untuk pilot.

---

## Tahap 0 — Persiapan

👤 **Data dan dokumen perusahaan** (verifikasi bisnis meminta nama, alamat, telepon, email, dan website; dokumen diminta jika data bisnis tidak ditemukan otomatis):
- [ ] Nama legal persis: **PT Trinitas Delegasi Kreatif**
- [ ] Alamat kantor sesuai dokumen legal
- [ ] Nomor telepon kantor yang bisa menerima SMS/telepon verifikasi
- [ ] Email dengan domain perusahaan (mis. `nama@delegativ.com`), bukan Gmail
- [ ] Website perusahaan yang menyebut nama PT atau mudah dikaitkan dengannya
- [ ] Siapkan salah satu dokumen legal dalam PDF yang mencantumkan nama dan alamat PT. Di Indonesia biasanya: **NIB/OSS**, **Akta Pendirian + SK Kemenkumham**, atau **NPWP badan**. (Daftar dokumen yang diterima ada di artikel bantuan Meta yang ditautkan saat verifikasi; belum kami baca.)

👤 **Domain untuk Connectiv** (disarankan): subdomain seperti `connectiv.delegativ.com` diarahkan ke Vercel. Embedded Signup hanya berjalan di domain HTTPS yang didaftarkan, dan domain milik perusahaan lebih meyakinkan saat review dibanding `*.vercel.app`.

🤖 **Halaman legal publik** (dibutuhkan pengaturan app):
- [ ] Kebijakan Privasi: `/kebijakan-privasi`
- [ ] Syarat & Ketentuan: `/syarat-ketentuan`
- [ ] Penghapusan data: `/hapus-data`
- [ ] Ikon app 1024×1024 (logo Connectiv)

---

## Tahap 1 — Business Portfolio dan Meta app

1. 👤 Buka [business.facebook.com](https://business.facebook.com). Pastikan ada **Business Portfolio atas nama PT Trinitas Delegasi Kreatif** (buat baru jika belum). Gunakan akun Facebook pribadi Anda sebagai admin; tambahkan satu admin cadangan.
2. 👤 Buka [developers.facebook.com](https://developers.facebook.com) → daftar sebagai developer dengan akun yang sama.
3. 👤 **My Apps → Create App**:
   - Nama app: `Connectiv`
   - Use case: **Connect with customers through WhatsApp**
   - Hubungkan ke Business Portfolio PT Trinitas Delegasi Kreatif
4. 👤 **App settings → Basic**: isi ikon, kategori (*Business and Pages*), email kontak, URL Kebijakan Privasi, URL Syarat & Ketentuan, URL penghapusan data. Simpan.
5. 👤 Buka **Use cases → Customize** (ikon pensil) pada use case WhatsApp → menu kiri **Tech Provider onboarding** → pilih **Onboard without a partner**.

## Tahap 2 — Verifikasi bisnis

1. 👤 Di halaman Tech Provider onboarding, Step 1 → **Start verification**.
2. 👤 Isi detail bisnis persis sama dengan dokumen legal (nama, alamat, telepon, email, website).
3. 👤 Pilih cara konfirmasi (email domain perusahaan, telepon, atau SMS).
4. 👤 Unggah dokumen jika diminta.
5. Tunggu hasil. App Review tidak bisa dimulai sebelum verifikasi selesai.

Tips agar tidak ditolak: nama di dokumen, di Business Portfolio, dan di website harus sama persis; alamat website harus aktif dan menampilkan identitas perusahaan.

## Tahap 3 — App Review

Minta **hanya dua izin** dengan *Advanced Access* (meminta izin yang tidak perlu adalah alasan penolakan yang umum):

| Izin | Untuk apa di Connectiv | Video yang diminta Meta |
|---|---|---|
| `whatsapp_business_management` | Mengakses akun WhatsApp klien yang tersambung untuk berlangganan webhook dan membaca info nomor | Rekaman layar app kita **atau WhatsApp Manager** saat membuat *message template* |
| `whatsapp_business_messaging` | Menerima pesan dan balasan CS untuk ditampilkan di inbox klien; nanti fitur balas dari CRM | Rekaman layar saat mengirim pesan ke nomor WhatsApp (boleh pakai cURL dari halaman **API Setup**) dan aplikasi WhatsApp penerima menampilkan pesannya |

Langkah:
1. 👤 Step 2 di halaman Tech Provider onboarding → periksa app settings (Tahap 1 no. 4 harus lengkap).
2. 👤 Buat **dua video terpisah**, satu per izin (screenshot tidak diterima; satu video tidak boleh berisi dua izin). Draf naskah video dan penjelasan tertulis ada di bawah.
3. 👤 Isi penjelasan tertulis per izin, unggah video, klik **Begin App Review**, lalu pastikan benar-benar **di-submit** (draf tidak direview).

### Draf penjelasan tertulis (bahasa Inggris, sesuaikan)

**whatsapp_business_management**
> Connectiv is a CRM for small businesses in Indonesia that advertise with Click-to-WhatsApp ads. Our clients connect their existing WhatsApp Business App number to Connectiv through Embedded Signup (Coexistence). We use whatsapp_business_management to subscribe our app to the client's WhatsApp Business Account webhooks, read the connected phone number's details and status, and trigger the one-time contact and history sync during onboarding. Clients' sales agents keep replying from the WhatsApp Business App; Connectiv shows a read-only mirror of the conversations, a sales pipeline, and which ad produced each closed deal.

**whatsapp_business_messaging**
> Connectiv receives incoming customer messages and the business's own replies (smb_message_echoes) so that owners and supervisors can monitor conversations, response times, and sales outcomes in one dashboard. In a later release, agents will also be able to reply to customers from Connectiv within the customer service window.

### Naskah video
- **Video 1 (management):** buka WhatsApp Manager milik Delegativ → Message templates → Create template → isi nama, kategori Utility, bahasa Indonesia, isi teks → Submit → tampilkan template di daftar.
- **Video 2 (messaging):** buka App Dashboard → WhatsApp → API Setup → pilih nomor tes → kirim pesan ke nomor HP Anda (tombol Send message atau cURL) → tunjukkan HP/WhatsApp Web menerima pesan itu.

## Tahap 4 — Embedded Signup dan webhook

👤 Di App Dashboard:
1. **Facebook Login for Business → Settings → Client OAuth settings**: aktifkan *Client OAuth login*, *Web OAuth login*, *Enforce HTTPS*, *Embedded Browser OAuth Login*, *Use Strict Mode for redirect URIs*, *Login with the JavaScript SDK*. Tambahkan domain Connectiv ke *Allowed domains* dan *Valid OAuth redirect URIs*.
2. **Facebook Login for Business → Configurations → Create from template → "WhatsApp Embedded Signup Configuration With 60 Expiration Token"**. Catat **Configuration ID**.
3. **Use cases → Customize → Configuration** (webhook WhatsApp): Callback URL `https://<domain>/api/webhooks/whatsapp/<WHATSAPP_WEBHOOK_PATH_TOKEN>`, Verify token = `WHATSAPP_VERIFY_TOKEN`. Klik Verify and save.
4. Subscribe field: `messages`, `smb_message_echoes`, `history`, `smb_app_state_sync`, `account_update`.
5. **App settings → Basic → App secret**: salin ke Vercel sebagai `WHATSAPP_APP_SECRET`. Mulai saat itu signature `X-Hub-Signature-256` diverifikasi otomatis oleh endpoint kita.
6. Ubah app ke mode **Live** (beberapa webhook tidak dikirim di mode Dev).

🤖 Di kode Connectiv (sprint tersendiri setelah App Review lolos):
- Tombol **Hubungkan WhatsApp** di halaman Admin/Pengaturan: Facebook JS SDK, `FB.login` dengan `config_id`, `response_type: 'code'`, `extras.featureType: 'whatsapp_business_app_onboarding'` dan `sessionInfoVersion: '3'` (pada versi 5 Coexistence aktif secara default), tangkap event `WA_EMBEDDED_SIGNUP` → `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` (berisi `waba_id`).
- Server: tukar `code` (berlaku 30 detik) dengan business token di `GET /oauth/access_token` (app secret hanya di server), simpan token terenkripsi.
- `POST /<WABA_ID>/subscribed_apps` untuk menerima webhook klien.
- **Dalam 24 jam:** `POST /<PHONE_NUMBER_ID>/smb_app_data` dengan `sync_type: "smb_app_state_sync"` (kontak), lalu `sync_type: "history"` (riwayat). Masing-masing hanya sekali; jika terlewat, klien harus di-offboard dan onboarding ulang.
- Tidak perlu `register` nomor untuk Coexistence.
- Cek: `GET /<PHONE_NUMBER_ID>?fields=is_on_biz_app,platform_type` → `true` dan `CLOUD_API`.

## Tahap 5 — Uji dan Live

1. Onboarding nomor internal Delegativ lewat tombol Hubungkan WhatsApp.
2. Kirim pesan uji, balas dari HP, cek payload masuk di `webhook_events`, simpan sebagai fixture.
3. Lengkapi *Access Verification* jika diminta (Meta belum menjelaskan langkahnya di halaman yang kami baca) untuk membuka batas 200 klien/minggu.

---

## Sumber

- [Get started for Tech Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)
- [App Review untuk Solution Partner/Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review)
- [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup) · [Implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation)
- [Onboarding customers as a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider)
- [Onboard WhatsApp Business app users (Coexistence)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)
- [Webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview) · [Create webhook endpoint](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint)
- [Artikel bantuan verifikasi bisnis](https://www.facebook.com/business/help/2058515294227817)
