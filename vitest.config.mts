import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Test integrasi memakai project Supabase dev dari .env.local (lewat
// tests/helpers/supabase.ts). Mereka berjalan berurutan dan setelah test
// unit, supaya tidak saling berebut koneksi/kuota Auth dan kena timeout.
// File integrasi baru wajib ditambahkan ke daftar ini.
const INTEGRATION_TESTS = [
  "tests/rls/**/*.test.ts",
  "tests/whatsapp/ingest.test.ts",
  "tests/whatsapp/ingest-batch.test.ts",
  "tests/retention.test.ts",
];

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    env: loadEnv(mode, process.cwd(), ""),
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: INTEGRATION_TESTS,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: INTEGRATION_TESTS,
          fileParallelism: false,
          groupOrder: 1,
          // beforeAll membuat user dan workspace lewat jaringan.
          hookTimeout: 60_000,
        },
      },
    ],
  },
}));
