// ═══════════════════════════════════════════════════════════════
//  TESTS — authorization, activation phrase, panel commands
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from "vitest";

import {
  ACTIVATION_PHRASE,
  matchesActivationPhrase,
  normalizePhrase,
  containsActivationPhrase,
} from "../src/game/panelAccess";

import {
  revalidate,
  requestServerPermission,
  resetServerPermission,
  getServerPermissionState,
  getSpawnableIds,
  type AccountInfo,
} from "../src/game/adminAccess";

// ───────────────────────────────────────────────────────────────
//  Activation phrase — exact match only
// ───────────────────────────────────────────────────────────────
describe("activation phrase", () => {
  it("accepts the exact configured phrase", () => {
    expect(matchesActivationPhrase("ativar painel")).toBe(true);
    expect(matchesActivationPhrase(ACTIVATION_PHRASE)).toBe(true);
  });

  it("accepts case, repeated spaces and trailing punctuation", () => {
    expect(matchesActivationPhrase("ATIVAR PAINEL")).toBe(true);
    expect(matchesActivationPhrase("Ativar   Painel")).toBe(true);
    expect(matchesActivationPhrase("  ativar painel  ")).toBe(true);
    expect(matchesActivationPhrase("ativar painel.")).toBe(true);
    expect(matchesActivationPhrase("ativar painel!")).toBe(true);
    expect(matchesActivationPhrase("ativar painel?")).toBe(true);
  });

  it("rejects similar but different phrases", () => {
    expect(matchesActivationPhrase("ativar o painel")).toBe(false);
    expect(matchesActivationPhrase("ativar")).toBe(false);
    expect(matchesActivationPhrase("painel")).toBe(false);
    expect(matchesActivationPhrase("ativar painels")).toBe(false);
    expect(matchesActivationPhrase("ativar painel agora")).toBe(false);
    expect(matchesActivationPhrase("por favor ativar painel")).toBe(false);
    expect(matchesActivationPhrase("")).toBe(false);
    expect(matchesActivationPhrase("   ")).toBe(false);
  });

  it("rejects partial word activations", () => {
    expect(matchesActivationPhrase("ativar pain")).toBe(false);
    expect(matchesActivationPhrase("ativar painelX")).toBe(false);
  });

  it("normalizes as documented", () => {
    expect(normalizePhrase("  ATIVAR   Painel!! ")).toBe("ativar painel");
    expect(normalizePhrase("ativar-painel")).toBe("ativar painel");
  });

  it("does not treat a partial match as an activation", () => {
    // containsActivationPhrase is diagnostic only — it must never be
    // used on its own to open the panel.
    expect(containsActivationPhrase("por favor ativar painel")).toBe(true);
    expect(matchesActivationPhrase("por favor ativar painel")).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────
//  No name-based access on the client
//
//  The authorized names live ONLY on the server. The client must
//  not ship an allowlist, because anything in the bundle can be
//  copied. The client therefore has no "is this name authorized?"
//  helper at all — it can only ask the server.
// ───────────────────────────────────────────────────────────────
describe("client has no name-based authorization", () => {
  it("does not export an allowlist or a name matcher", async () => {
    const mod = await import("../src/game/adminAccess");
    expect((mod as Record<string, unknown>).matchesAuthorizedName).toBeUndefined();
    expect((mod as Record<string, unknown>).evaluateLocalAccess).toBeUndefined();
    expect((mod as Record<string, unknown>).AUTHORIZED_DISPLAY_NAMES).toBeUndefined();
  });

  it("does not ship the authorized display names in the bundle source", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(process.cwd(), "src/game/adminAccess.ts"),
      "utf8",
    );
    expect(source).not.toContain("RimuOfc");
    expect(source).not.toContain("Guisdfas");
  });

  it("does not ship any admin password or signing key", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const files = [
      "src/game/security.ts",
      "src/game/adminAccess.ts",
      "src/components/AdminPanel.tsx",
      "src/components/SpecialPanel.tsx",
    ];
    for (const file of files) {
      const source = await fs.readFile(path.resolve(process.cwd(), file), "utf8");
      // The old admin access code was an 8-hex-digit literal; the old
      // signing key was a 32-hex-digit literal. We assert that NO
      // such hard-coded literal exists, without repeating the real
      // values in this file (they are secrets, even when revoked).
      expect(source).not.toMatch(/["']e[0-9a-f]{8}["']/);
      expect(source).not.toMatch(/["'][0-9a-f]{32}["']/);
    }
  });
});

// ───────────────────────────────────────────────────────────────
//  Server-authoritative permission state
// ───────────────────────────────────────────────────────────────
describe("server permission state", () => {
  beforeEach(() => {
    resetServerPermission();
    localStorage.clear();
  });

  it("denies everything when no server is configured", async () => {
    resetServerPermission();
    const state = await requestServerPermission({ id: "usr_rimu", username: "RimuOfc", isGuest: false });
    expect(state.mode).toBe("unconfigured");
    expect(state.token).toBeNull();

    const access = revalidate({ id: "usr_rimu", username: "RimuOfc", isGuest: false });
    expect(access.ok).toBe(false);
    expect(access.reason).toBe("sem-servidor");
  });

  it("denies everything when the server is unreachable", async () => {
    resetServerPermission();
    // Point the client at a port nothing is listening on.
    localStorage.setItem("knox-ws-url", "ws://127.0.0.1:1/");
    const state = await requestServerPermission({ id: "usr_rimu", username: "RimuOfc", isGuest: false });
    expect(state.mode).toBe("denied");
    expect(state.token).toBeNull();
    localStorage.removeItem("knox-ws-url");
  });

  it("denies everything when the server answers 403", async () => {
    resetServerPermission();
    localStorage.setItem("knox-ws-url", "ws://127.0.0.1:1/");
    // Simulate a server that explicitly refuses the account.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ granted: false }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    const state = await requestServerPermission({ id: "usr_rimu", username: "RimuOfc", isGuest: false });
    expect(state.mode).toBe("denied");
    expect(state.token).toBeNull();
    localStorage.removeItem("knox-ws-url");
  });

  it("denies guests even before contacting the server", () => {
    resetServerPermission();
    const access = revalidate({ id: "guest_1", username: "RimuOfc", isGuest: true });
    expect(access.ok).toBe(false);
    expect(access.reason).toBe("conta-visitante");
  });

  it("denies anonymous users", () => {
    resetServerPermission();
    const access = revalidate(null);
    expect(access.ok).toBe(false);
    expect(access.reason).toBe("sem-conta");
  });

  it("reports an empty spawnable list until the server provides one", () => {
    resetServerPermission();
    expect(getSpawnableIds()).toEqual([]);
    expect(getServerPermissionState().token).toBeNull();
  });
});
