import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // In development, API calls go to the game server (npm run dev starts both).
  // .app.github.dev: lets the dev server work through a GitHub Codespaces forwarded port.
  server: { proxy: { "/api": "http://localhost:8787" }, allowedHosts: [".app.github.dev"] },
  preview: { proxy: { "/api": "http://localhost:8787" } },
});
