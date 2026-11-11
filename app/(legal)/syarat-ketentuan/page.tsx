import type { Metadata } from "next";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Syarat & Ketentuan" };

export default function SyaratKetentuanPage() {
  return (
    <>
      <h1>Syarat &amp; Ketentuan</h1>
      <p className="text-sm text-muted-foreground">Terakhir diperbarui: {COMPANY.lastUpdated}</p>

      <p>
        Dengan memakai {COMPANY.product}, Anda menyetujui ketentuan berikut. Layanan disediakan oleh {COMPANY.legalName}.
      </p>

      <h2>Layanan</h2>
      <p>
        {COMPANY.product} menampilkan percakapan WhatsApp dari nomor WhatsApp Business yang Anda hubungkan, mengelola
        pipeline penjualan, dan mengaitkan chat dengan iklan Meta asalnya. Koneksi WhatsApp menggunakan WhatsApp Business
        Platform resmi dari Meta.
      </p>

      <h2>Kewajiban pengguna</h2>
      <ul>
        <li>Hanya menghubungkan nomor WhatsApp dan akun iklan yang Anda miliki atau berhak kelola.</li>
        <li>Mematuhi Kebijakan WhatsApp Business dan Kebijakan Perdagangan WhatsApp dari Meta.</li>
        <li>
          Memiliki dasar hukum untuk memproses data pelanggan Anda, termasuk memberi tahu pelanggan bahwa percakapan
          dikelola dengan sistem CRM.
        </li>
        <li>Menjaga kerahasiaan akun dan tidak membagikan password.</li>
      </ul>

      <h2>Ketentuan WhatsApp</h2>
      <p>
        Aplikasi WhatsApp Business di ponsel harus tetap terpasang dan dibuka secara berkala agar koneksi tetap aktif.
        Chat grup tidak ikut tersinkron. Ketersediaan fitur bergantung pada kebijakan Meta yang dapat berubah.
      </p>

      <h2>Data</h2>
      <p>
        Pemrosesan data diatur dalam <a href="/kebijakan-privasi">Kebijakan Privasi</a>. Data pelanggan Anda tetap milik
        Anda.
      </p>

      <h2>Batasan tanggung jawab</h2>
      <p>
        Layanan diberikan sebagaimana adanya. Kami berupaya menjaga ketersediaan layanan, tetapi tidak bertanggung jawab
        atas gangguan yang disebabkan pihak ketiga, termasuk Meta, penyedia jaringan, atau perangkat pengguna.
      </p>

      <h2>Penghentian</h2>
      <p>
        Anda dapat berhenti kapan saja dan memutus nomor WhatsApp dari aplikasi WhatsApp Business. Kami dapat menangguhkan
        akun yang melanggar ketentuan ini atau kebijakan Meta.
      </p>

      <h2>Hukum yang berlaku</h2>
      <p>Ketentuan ini tunduk pada hukum Republik Indonesia.</p>

      <h2>Kontak</h2>
      <p>Email: {COMPANY.email}</p>
    </>
  );
}
