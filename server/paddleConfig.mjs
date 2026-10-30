// ═══════════════════════════════════════════════════════════════
//  PADDLE SERVER CONFIG — SERVER SIDE ONLY
//
//  ⚠️  This file lives OUTSIDE src/ so Vite never bundles it into
//      the browser.
//
//  🔒  NO SECRET IS STORED IN THIS REPOSITORY.
//
//      Every credential below MUST come from the environment
//      (process manager, container secret, or a .env file that is
//      git-ignored). Hardcoding a live key here would leak full
//      control of the Paddle account to anyone with a copy of the
//      source — and GitHub push protection blocks such commits.
//
//      If a value is missing the server starts in a degraded,
//      clearly-reported mode instead of silently using a default.
// ═══════════════════════════════════════════════════════════════

/** Read a required secret from the environment. */
function requiredEnv(name, hint) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    console.warn(
      `[paddle-config] ${name} is not set — the Paddle integration stays disabled. ${hint}`,
    );
    return "";
  }
  return value;
}

/**
 * Read an optional secret from the environment.
 * Placeholder values are treated as "not configured".
 */
function optionalEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) return "";
  if (/replace_with|changeme|your[_-]/i.test(value)) return "";
  return value;
}

export const PADDLE = {
  /** Secret API key — server use only. Required for the Paddle API. */
  apiKey: requiredEnv(
    "PADDLE_API_KEY",
    "Export the secret API key from the Paddle dashboard (Developer tools → Authentication).",
  ),

  /** Optional secondary API key, used only if explicitly provided. */
  apiKeyAlt: optionalEnv("PADDLE_API_KEY_ALT"),

  /** Public client-side token (safe in the browser, but still env-provided). */
  clientToken: optionalEnv("PADDLE_CLIENT_TOKEN"),

  /** Webhook signing secret — Paddle → Developer tools → Notifications. */
  webhookSecret: optionalEnv("PADDLE_WEBHOOK_SECRET"),

  /** "sandbox" or "production" — must match the API key prefix. */
  environment: (
    process.env.PADDLE_ENVIRONMENT ||
    ((process.env.PADDLE_API_KEY || "").startsWith("pdl_live_") ? "production" : "sandbox")
  ).trim(),
};

export const API_BASE =
  PADDLE.environment === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

export const SERVER_PORT = Number(process.env.PORT || 8787);

/** Persisted webhook log + entitlement mirror (swap for Postgres in prod). */
export const DATA_FILE = new URL("./data/entitlements.json", import.meta.url).pathname;
export const LOG_FILE = new URL("./data/webhook-log.json", import.meta.url).pathname;
