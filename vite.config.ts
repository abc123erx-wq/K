import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Security headers applied to the dev/preview server as well.
 *
 * They mirror the ones the production Node server sends, so the
 * development environment is not a "safe space" where a header is
 * silently missing.
 */
const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.paddle.com https://cdn.tailwindcss.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.paddle.com",
    "img-src 'self' data: blob: https://cdn.paddle.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.paddle.com",
    "connect-src 'self' ws://localhost:* wss://* https://*.firebaseio.com https://*.googleapis.com https://cdn.paddle.com https://api.paddle.com",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-DNS-Prefetch-Control": "off",
  "Permissions-Policy": "geolocation=(), camera=(), payment=(self)",
  "Cross-Origin-Opener-Policy": "same-origin",
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // The optional engines (PixiJS, Phaser, PlayCanvas, Rapier) are
  // large third-party libraries. They are loaded with a *dynamic*
  // import so they land in their own chunk and are only downloaded
  // when the player actually enables the corresponding feature.
  //
  // `viteSingleFile` inlines every chunk into the HTML, which would
  // bloat the single-file build from ~1 MB to ~9 MB. We therefore
  // keep the engine packages OUT of the bundle and load them at
  // runtime from `public/engines/` (or from a CDN when configured).
  build: {
    chunkSizeWarningLimit: 4096,
    // The optional engines are NOT imported statically anywhere (they
    // are resolved at runtime from /engines/), so no extra chunk
    // configuration is needed — they stay out of the bundle.
  },
  server: {
    host: "0.0.0.0",
    // The sandbox preview is served from a generated hostname; allow it
    // so the live preview works during development.
    allowedHosts: true,
    headers: SECURITY_HEADERS,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
    headers: SECURITY_HEADERS,
  },
});
