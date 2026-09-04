import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Cartera Gold",
        short_name: "Cartera Gold",
        description: "Cartera de préstamos — Agencia Gold",
        start_url: "/",
        display: "standalone",
        background_color: "#10161D",
        theme_color: "#10161D",
        orientation: "portrait",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        // La app guarda todo en localStorage del propio teléfono, así que una
        // vez cargada la primera vez funciona sin internet.
        runtimeCaching: [],
      },
    }),
  ],
});
