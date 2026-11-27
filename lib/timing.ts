// Mengukur durasi (ms, dibulatkan) sebuah operasi async. Jika operasi gagal,
// `ms` tetap terisi dan error dikembalikan, bukan dilempar.
export async function timed<T>(
  fn: () => Promise<T>,
  now: () => number = () => performance.now(),
): Promise<{ ms: number; result?: T; error?: unknown }> {
  const start = now();
  try {
    const result = await fn();
    return { ms: Math.round(now() - start), result };
  } catch (error) {
    return { ms: Math.round(now() - start), error };
  }
}
