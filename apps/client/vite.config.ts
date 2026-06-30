import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5173, host: true },
  build: { target: "es2022", outDir: "dist" },
  // Force a single copy of three so example modules (BufferGeometryUtils)
  // and the engine share one instance.
  resolve: { dedupe: ["three"] },
  optimizeDeps: { include: ["three"] },
});
