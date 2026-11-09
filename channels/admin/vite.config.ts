import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // The channels Next.js app serves /api/admin/*; dev defaults to its port.
  const apiOrigin = env.VITE_ADMIN_API_ORIGIN || "http://localhost:4000";

  return {
    // Built output lands in ../public/admin and is served by the channels app
    // at /admin — the base must match that mount point for asset URLs to resolve.
    base: "/admin/",
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        "/api": {
          target: apiOrigin,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "../public/admin",
      emptyOutDir: true,
    },
  };
});
