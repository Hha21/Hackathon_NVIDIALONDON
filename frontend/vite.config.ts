import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend runs on 8008 (8000 is taken by the essential-apps Docker container).
// We proxy /api and /health so the browser talks to the Vite origin — no CORS,
// no hardcoded port in the client.
const BACKEND = "http://localhost:8008";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // 5173 is taken by the essential-apps Docker container
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/health": { target: BACKEND, changeOrigin: true },
    },
  },
});
