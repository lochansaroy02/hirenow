import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // The database tests share one schema, so files must not run concurrently.
    fileParallelism: false,
    env: {
      AUTH_SECRET: "test-only-secret-that-is-at-least-32-characters",
    },
  },
});
