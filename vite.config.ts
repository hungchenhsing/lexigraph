import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import fs from "node:fs";
import path from "node:path";

/** The worker must fetch /dict/…, which Vite copies from public/. */
function dictAssetCheck(): Plugin {
  return {
    name: "lexigraph-dict-asset-check",
    closeBundle() {
      const file = path.resolve("dist/dict/ecdict-core.json.gz");
      if (!fs.existsSync(file)) {
        throw new Error(
          `Missing ${file}. The dictionary worker fetches /dict/ecdict-core.json.gz (not /assets/dict).`,
        );
      }
    },
  };
}

// https://vitejs.dev/config/
// base: "./" makes all emitted asset references relative, so the build works
//   (a) hosted in any sub-folder of a static site, and
//   (b) as input to the single-file offline bundler (scripts/make-singlefile.mjs).
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    dictAssetCheck(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: false,
      workbox: {
        // App shell, including the pdf.js worker. The 13 MB dictionary is
        // fetched after first paint and stored with CacheFirst below.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,mjs}"],
        globIgnores: ["**/dict/**", "**/*ecdict*"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/\.gz$/, /dict\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /dict\/ecdict-core\.json\.gz$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "lexigraph-dict",
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        // Single JS chunk → no runtime dynamic-import fetches, which would
        // break under file:// in the single-file build.
        inlineDynamicImports: true,
      },
    },
  },
  preview: {
    port: 5173,
    strictPort: false,
  },
});
