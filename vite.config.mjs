import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.TRAVEL_AGENT_DEV_API_PROXY ?? "http://127.0.0.1:8797";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": apiProxyTarget },
  },
  build: { outDir: "dist", sourcemap: true },
});
