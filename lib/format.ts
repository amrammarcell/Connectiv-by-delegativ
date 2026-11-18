// Format tanggal, waktu, dan nomor untuk UI (id-ID, Asia/Jakarta).

const TZ = "Asia/Jakarta";

function dayKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function formatClock(value: string | Date): string {
  return new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

// Daftar inbox: "14.05" untuk hari ini, "Kemarin", lalu "12 Nov".
export function formatListTime(value: string | Date, now: Date = new Date()): string {
  const date = new Date(value);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(date) === dayKey(now)) return formatClock(date);
  if (dayKey(date) === dayKey(yesterday)) return "Kemarin";
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: TZ });
}

// Pemisah hari di percakapan.
export function formatDayLabel(value: string | Date, now: Date = new Date()): string {
  const date = new Date(value);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(date) === dayKey(now)) return "Hari ini";
  if (dayKey(date) === dayKey(yesterday)) return "Kemarin";
  return date.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  return dayKey(new Date(a)) === dayKey(new Date(b));
}

// "6281234567890" → "+62 812-3456-7890"; nomor lain cukup diberi "+".
export function formatPhone(digits: string): string {
  if (/^62\d{9,13}$/.test(digits)) {
    const local = digits.slice(2);
    return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
  }
  return `+${digits}`;
}

export function initials(name: string): string {
  return name
    .split(/[\s@.+-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}
