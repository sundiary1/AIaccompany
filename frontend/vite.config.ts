import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    proxy: {
      "/api/demo/chat": {
        target: "http://127.0.0.1:8001",
        changeOrigin: false,
        timeout: 65000,
        proxyTimeout: 65000,
      },
      "/api/demo/conversations": {
        target: "http://127.0.0.1:8001",
        changeOrigin: false,
      },
      "/api/demo/memory": {
        target: "http://127.0.0.1:8001",
        changeOrigin: false,
      },
      "/api/demo/memories": {
        target: "http://127.0.0.1:8001",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "../backend/app/frontend",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
})
