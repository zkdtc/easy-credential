import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const appBase = process.env.VITE_APP_BASE
  ? `${process.env.VITE_APP_BASE.replace(/\/$/, "")}/`
  : "/";

export default defineConfig({
  base: appBase,
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8008",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
