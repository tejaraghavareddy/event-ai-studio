import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest runs independently of the Vite dev-server config (which this project
 * keeps untouched for Freebuff HMR), re-declaring only the `@` → `src` alias
 * that the source files rely on.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
  },
});
