import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { configDefaults } from "vitest/config";
import { viteSourceLocator as createInternalSourceLocator } from "@metagptx/vite-plugin-source-locator";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    createInternalSourceLocator({
      prefix: "internal",
    }),
    react(),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          ui: ["@tanstack/react-query", "react-hook-form", "zustand"],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      ...configDefaults.exclude,
      "e2e/**",
      "hatch-crm/**",
      "apps/**",
      "packages/**",
      "dist/**"
    ],
  },
}));
