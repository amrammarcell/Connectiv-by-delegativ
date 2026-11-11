import type { Metadata } from "next";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Penghapusan Data" };

export default function HapusDataPage() {
  return (
    <>
      <h1>Penghapusan Data</h1>
      <p className="text-sm text-muted-foreground">Terakhir diperbarui: {COMPANY.lastUpdated}</p>

      <h2>Untuk bisnis pengguna {COMPANY.product}</h2>
      <ul>
        <li>
          Putuskan nomor WhatsApp dari aplikasi WhatsApp Business: <strong>Pengaturan → Akun → Business Platform →
          Putuskan Akun</strong>. Setelah itu kami tidak lagi menerima pesan baru.
        </li>
        <li>
          Untuk menghapus seluruh data workspace (chat, kontak, pipeline, dan data iklan), kirim email ke {COMPANY.email}{" "}
          dari email Owner workspace dengan subjek &ldquo;Hapus data workspace&rdquo;.
        </li>
      </ul>

      <h2>Untuk pelanggan dari bisnis yang memakai {COMPANY.product}</h2>
      <p>
        Kirim email ke {COMPANY.email} dengan subjek &ldquo;Hapus data saya&rdquo;, sertakan nomor WhatsApp Anda dan nama
        bisnis yang Anda hubungi. Kami akan berkoordinasi dengan bisnis tersebut.
      </p>

      <h2>Waktu proses</h2>
      <p>
        Permintaan diproses paling lambat 30 hari sejak diterima. Kami akan mengonfirmasi lewat email setelah data
        dihapus, kecuali data yang wajib disimpan menurut hukum.
      </p>
    </>
  );
}
