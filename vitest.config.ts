import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // jsdom gives us a real localStorage / sessionStorage, which the
    // persistence code under test relies on.
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.mjs"],
    globals: false,
  },
});
