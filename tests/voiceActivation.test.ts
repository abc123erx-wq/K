// ═══════════════════════════════════════════════════════════════
//  TESTS — microphone permission and voice support detection
//
//  The panel must never bypass a permission decision, never record
//  audio, and must degrade gracefully when the platform does not
//  support speech recognition.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  detectVoiceSupport,
  requestMicrophonePermission,
  microphonePermissionState,
  VoiceActivation,
  ACTIVATION_PHRASE,
} from "../src/game/panelAccess";

// ── helpers ──────────────────────────────────────────────────
type SpeechCtor = new () => any;

function installSpeechApi(ctor?: SpeechCtor) {
  const w = window as any;
  if (ctor) {
    w.SpeechRecognition = ctor;
    w.webkitSpeechRecognition = undefined;
  } else {
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  }
}

function installMediaDevices(impl?: typeof navigator.mediaDevices) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: impl,
    configurable: true,
    writable: true,
  });
}

function fakeStream(): MediaStream {
  return {
    getTracks: () => [{ stop: () => {} }],
  } as unknown as MediaStream;
}

describe("voice support detection", () => {
  beforeEach(() => {
    installSpeechApi();
    installMediaDevices(undefined);
  });

  afterEach(() => {
    installSpeechApi();
    installMediaDevices(undefined);
  });

  it("reports unsupported when the browser has no Speech API", () => {
    installSpeechApi(undefined);
    const support = detectVoiceSupport();
    expect(support.level).toBe("unsupported");
    expect(support.reason.length).toBeGreaterThan(0);
  });

  it("reports unsupported when there is no mediaDevices", () => {
    installSpeechApi(class {});
    installMediaDevices(undefined);
    expect(detectVoiceSupport().level).toBe("unsupported");
  });

  it("never claims local-only processing", () => {
    installSpeechApi(class {});
    installMediaDevices({ getUserMedia: vi.fn() } as any);
    const support = detectVoiceSupport();
    // The Web Speech API may send audio to a vendor service — the UI
    // must say so instead of claiming local processing.
    expect(support.mayTransmitAudio).toBe(true);
    expect(support.reason).toMatch(/serviço|não grava|pode/i);
  });

  it("is ready when both the Speech API and the microphone exist", () => {
    installSpeechApi(class {});
    installMediaDevices({ getUserMedia: vi.fn() } as any);
    expect(detectVoiceSupport().level).toBe("ready");
  });
});

describe("microphone permission", () => {
  beforeEach(() => {
    installSpeechApi();
    installMediaDevices(undefined);
  });

  afterEach(() => {
    installMediaDevices(undefined);
    vi.restoreAllMocks();
  });

  it("grants permission when getUserMedia succeeds and releases the device", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream);
    installMediaDevices({ getUserMedia } as any);

    const result = await requestMicrophonePermission();
    expect(result.granted).toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    // The device is released immediately — no background capture.
    expect(stop).toHaveBeenCalled();
  });

  it("does not bypass a denial", async () => {
    const err = new Error("denied");
    err.name = "NotAllowedError";
    installMediaDevices({
      getUserMedia: vi.fn(async () => { throw err; }),
    } as any);

    const result = await requestMicrophonePermission();
    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/negada|fechado/i);
  });

  it("reports a missing microphone clearly", async () => {
    const err = new Error("no device");
    err.name = "NotFoundError";
    installMediaDevices({
      getUserMedia: vi.fn(async () => { throw err; }),
    } as any);

    const result = await requestMicrophonePermission();
    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/microfone/i);
  });

  it("fails safely when the browser has no mediaDevices", async () => {
    installMediaDevices(undefined);
    const result = await requestMicrophonePermission();
    expect(result.granted).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("reports the permission state without throwing", async () => {
    const state = await microphonePermissionState();
    expect(["granted", "denied", "prompt", "unknown"]).toContain(state);
  });
});

describe("voice activation recognizer", () => {
  beforeEach(() => {
    installMediaDevices({ getUserMedia: vi.fn() } as any);
  });

  afterEach(() => {
    installSpeechApi();
    installMediaDevices(undefined);
  });

  it("refuses to start when the platform has no Speech API", async () => {
    installSpeechApi(undefined);
    const recognizer = new VoiceActivation();
    const result = await recognizer.start(() => {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("sem-suporte");
    expect(recognizer.isListening).toBe(false);
  });

  it("starts, forwards final transcripts and stops cleanly", async () => {
    let instance: any = null;
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      lang = "";
      onresult: ((e: any) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      onend: (() => void) | null = null;
      started = false;
      stopped = false;
      constructor() { instance = this; }
      start() { this.started = true; }
      stop() { this.stopped = true; }
      abort() { this.stopped = true; }
    }
    installSpeechApi(FakeRecognition as unknown as SpeechCtor);

    const seen: string[] = [];
    const recognizer = new VoiceActivation();
    const result = await recognizer.start((t, isFinal) => { if (isFinal) seen.push(t); });
    expect(result.ok).toBe(true);
    expect(recognizer.isListening).toBe(true);
    expect(instance.lang).toBe("pt-BR");

    // Emit a final transcript.
    instance.onresult({
      resultIndex: 0,
      results: [Object.assign([{ transcript: ACTIVATION_PHRASE }], { isFinal: true, length: 1 })],
    });
    expect(seen).toEqual([ACTIVATION_PHRASE]);

    // Stopping must release the recognizer.
    recognizer.stop();
    expect(recognizer.isListening).toBe(false);
    expect(instance.stopped).toBe(true);
  });

  it("does not forward interim transcripts as final", async () => {
    let instance: any = null;
    class FakeRecognition {
      continuous = false; interimResults = false; maxAlternatives = 1; lang = "";
      onresult: ((e: any) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop() {}
      abort() {}
      constructor() { instance = this; }
    }
    installSpeechApi(FakeRecognition as unknown as SpeechCtor);

    const finals: string[] = [];
    const recognizer = new VoiceActivation();
    await recognizer.start((t, isFinal) => { if (isFinal) finals.push(t); });

    instance.onresult({
      resultIndex: 0,
      results: [Object.assign([{ transcript: "ativar" }], { isFinal: false, length: 1 })],
    });
    expect(finals).toEqual([]);
    recognizer.stop();
  });

  it("surfaces a revoked microphone permission as an error and stops", async () => {
    let instance: any = null;
    class FakeRecognition {
      continuous = false; interimResults = false; maxAlternatives = 1; lang = "";
      onresult: ((e: any) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop() {}
      abort() {}
      constructor() { instance = this; }
    }
    installSpeechApi(FakeRecognition as unknown as SpeechCtor);

    const errors: string[] = [];
    const recognizer = new VoiceActivation();
    await recognizer.start(() => {}, (code) => { errors.push(code); });

    instance.onerror({ error: "not-allowed" });
    expect(errors).toContain("permissao-negada");
    expect(recognizer.isListening).toBe(false);
    expect(recognizer.lastErrorCode).toBe("permissao-negada");
  });
});
