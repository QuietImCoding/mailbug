import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API server's port. `pnpm dev` starts Express here and Vite in front of
// it; API and asset requests are proxied through so the browser only ever
// talks to one origin.
const API_PORT = Number(process.env.PORT ?? 3000);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5173);

export default defineConfig({
  root: "src/web",
  publicDir: false,
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    // Not "assets": Express already serves the app's own /assets directory,
    // and the two would shadow each other.
    assetsDir: "static",
  },
  server: {
    port: CLIENT_PORT,
    strictPort: true,
    proxy: {
      "/api": { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      "/assets": { target: `http://localhost:${API_PORT}`, changeOrigin: true },
    },
  },
  plugins: [react()],
});
