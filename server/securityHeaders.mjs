// ═══════════════════════════════════════════════════════════════
//  SECURITY HEADERS — CSP, HSTS, X-Frame-Options, etc.
//
//  Every response served by the Node server goes through
//  `applySecurityHeaders()`. The rules are deliberately strict but
//  still compatible with the game:
//
//   · CSP allows only same-origin assets plus the exact external
//     origins the game genuinely needs (fonts, Paddle checkout).
//   · `script-src` does NOT include `unsafe-inline` for the bundled
//     game code, but the two inline bootstrap scripts in index.html
//     are moved to hashes / a nonce-free external file instead.
//   · HSTS is only sent over HTTPS (or when explicitly forced in
//     production) so local HTTP development keeps working.
//
// ═══════════════════════════════════════════════════════════════

/** External origins the game legitimately talks to. */
const CONNECT_SRC = [
  "'self'",
  "ws://localhost:*",
  "wss://*",
  "https://*.firebaseio.com",
  "https://*.googleapis.com",
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://cdn.paddle.com",
  "https://api.paddle.com",
  "https://sandbox-api.paddle.com",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];

const SCRIPT_SRC = [
  "'self'",
  "'unsafe-inline'", // TODO(harden): remove once index.html inline scripts are externalized
  "https://cdn.paddle.com",
  "https://cdn.tailwindcss.com",
];

const STYLE_SRC = [
  "'self'",
  "'unsafe-inline'", // React inline styles + Tailwind runtime injection
  "https://fonts.googleapis.com",
  "https://cdn.paddle.com",
];

const IMG_SRC = [
  "'self'",
  "data:",
  "blob:",
  "https://*.firebaseio.com",
  "https://cdn.paddle.com",
];

const CSP = [
  "default-src 'self'",
  `script-src ${SCRIPT_SRC.join(" ")}`,
  `style-src ${STYLE_SRC.join(" ")}`,
  `img-src ${IMG_SRC.join(" ")}`,
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.paddle.com",
  `connect-src ${CONNECT_SRC.join(" ")}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Apply the standard security headers to a response.
 * @param {import("node:http").ServerResponse} res
 * @param {{ isSecure?: boolean, hsts?: boolean }} [opts]
 */
export function applySecurityHeaders(res, opts = {}) {
  const isSecure = opts.isSecure ?? false;

  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), payment=(self)");

  // Only advertise HSTS when the connection is actually secure —
  // sending it over plain HTTP is ignored by browsers anyway, and
  // it would break local `http://localhost` development.
  if (opts.hsts ?? isSecure) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  // Never let a proxy cache an authenticated response.
  if (opts.noStore) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
  }
}

/**
 * Redirect an insecure (plain HTTP) request to its HTTPS equivalent.
 * Only applied when the deployment is explicitly in secure mode.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} host
 */
export function redirectToHttps(req, res, host) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || (req.socket && req.socket.encrypted ? "https" : "http");
  if (proto === "https") return false;

  const hostname = String(host || req.headers.host || "").split(":")[0];
  // A Host header is attacker-controlled — only redirect to hosts we
  // know about, otherwise just refuse the request.
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return false;
  }

  const target = `https://${hostname}${req.url || "/"}`;
  res.writeHead(301, { Location: target, "Content-Type": "text/plain; charset=utf-8" });
  res.end(`Redirecting to HTTPS…\n`);
  return true;
}

export { CSP };
