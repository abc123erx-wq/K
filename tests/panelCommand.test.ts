// ═══════════════════════════════════════════════════════════════
//  TESTS — structured panel command parsing
//
//  The chat input must accept ONLY structured commands pointing at
//  allowlisted resource ids. Free text is never interpreted as code.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { parseCommand, suggestEffect } from "../src/components/SpecialPanel";

const ALLOWED = ["zombie_scavenger", "zombie_brute", "zombie_swarm", "hunter", "pet"];

describe("panel command parsing", () => {
  it("parses the documented syntax", () => {
    const result = parseCommand("/spawn zombie_scavenger --alvo srv-abc123");
    expect(result.ok).toBe(true);
    expect(result.effectId).toBe("zombie_scavenger");
  });

  it("accepts the --target alias", () => {
    const result = parseCommand("/spawn hunter --target srv-abc123");
    expect(result.ok).toBe(true);
    expect(result.effectId).toBe("hunter");
  });

  it("is case-insensitive for the keywords only", () => {
    const result = parseCommand("/SPAWN pet --ALVO srv-1");
    expect(result.ok).toBe(true);
    expect(result.effectId).toBe("pet");
  });

  it("rejects a missing resource", () => {
    const result = parseCommand("/spawn --alvo srv-abc");
    expect(result.ok).toBe(false);
  });

  it("rejects a missing target", () => {
    const result = parseCommand("/spawn zombie_scavenger");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("--alvo");
  });

  it("rejects a target flag with no value", () => {
    const result = parseCommand("/spawn zombie_scavenger --alvo");
    expect(result.ok).toBe(false);
  });

  it("rejects code-like payloads", () => {
    expect(parseCommand("require('fs')").ok).toBe(false);
    expect(parseCommand("/spawn zombie_scavenger; DROP TABLE players").ok).toBe(false);
    expect(parseCommand("/spawn ../../etc/passwd --alvo srv-1").ok).toBe(false);
    expect(parseCommand("/spawn $(whoami) --alvo srv-1").ok).toBe(false);
    expect(parseCommand("/spawn `id` --alvo srv-1").ok).toBe(false);
    expect(parseCommand("http://evil.example/x").ok).toBe(false);
    expect(parseCommand("/spawn a;rm -rf / --alvo srv-1").ok).toBe(false);
  });

  it("rejects non-slug resource identifiers", () => {
    expect(parseCommand("/spawn Zombie Scavenger --alvo srv-1").ok).toBe(false);
    expect(parseCommand("/spawn 123 --alvo srv-1").ok).toBe(false);
    expect(parseCommand("/spawn _x --alvo srv-1").ok).toBe(false);
  });

  it("rejects a malformed session id", () => {
    expect(parseCommand("/spawn pet --alvo bad id!").ok).toBe(false);
    expect(parseCommand("/spawn pet --alvo ../../x").ok).toBe(false);
  });

  it("rejects an empty line", () => {
    expect(parseCommand("").ok).toBe(false);
    expect(parseCommand("    ").ok).toBe(false);
  });

  it("rejects any command other than /spawn", () => {
    expect(parseCommand("/nuke --alvo srv-1").ok).toBe(false);
    expect(parseCommand("spawn zombie_scavenger --alvo srv-1").ok).toBe(false);
    expect(parseCommand("/help").ok).toBe(false);
  });
});

describe("suggestion helper", () => {
  it("suggests valid alternatives for an unknown resource", () => {
    const message = suggestEffect("zumbi", ALLOWED);
    expect(message).toContain("zumbi");
    expect(message).toContain("zombie_scavenger");
  });

  it("falls back to the full list when nothing is close", () => {
    const message = suggestEffect("xyz", ALLOWED);
    expect(message).toContain("zombie_scavenger");
    expect(message).toContain("pet");
  });

  it("handles an empty allowlist", () => {
    expect(suggestEffect("zumbi", [])).toContain("Nenhum recurso");
  });
});
