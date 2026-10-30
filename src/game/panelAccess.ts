// ============================================================
//  SPECIAL PANEL ACCESS — voice activation gate
//
//  Rules implemented here:
//    · O painel começa FECHADO para todos.
//    · Só abre quando a frase EXATA de ativação é reconhecida
//      enquanto o microfone está autorizado.
//    · A frase NÃO é autenticação. Antes de abrir, o servidor
//      valida a identidade da conta e a permissão.
//    · Sem gravação: nada de áudio é armazenado ou transmitido
//      por este módulo.
//    · A escuta é interrompida ao fechar o painel, desconectar,
//      revogar a permissão ou sair da tela.
//    · Indicador visível enquanto escuta + botão para parar.
//
//  RECONHECIMENTO DE FALA — limitações de plataforma:
//    · Usa a Web Speech API (SpeechRecognition /
//      webkitSpeechRecognition). O navegador pode enviar o áudio
//      para um serviço de reconhecimento do fornecedor — NÃO é
//      garantido processamento local. A UI informa isso antes de
//      pedir a permissão do microfone.
//    · Firefox e alguns navegadores móveis não implementam a
//      API: nesses casos a ativação por voz fica indisponível e
//      o painel continua fechado.
//    · Chrome/Edge exigem conexão HTTPS (ou localhost).
// ============================================================

export const ACTIVATION_PHRASE = "ativar painel";

/** Locale used for recognition — Brazilian Portuguese by default. */
export const RECOGNITION_LOCALE = "pt-BR";

export type VoiceSupportLevel = "unsupported" | "needs-https" | "ready";

export interface VoiceSupport {
  level: VoiceSupportLevel;
  /** True when the browser may send audio to a vendor service. */
  mayTransmitAudio: boolean;
  reason: string;
}

/**
 * Detecta o suporte ao reconhecimento de fala.
 *
 * `mayTransmitAudio` is true for the Web Speech API because the
 * browser may use a cloud recognition backend. We never claim
 * local-only processing.
 */
export function detectVoiceSupport(): VoiceSupport {
  const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const hasMedia = !!navigator.mediaDevices?.getUserMedia;
  const secure = window.isSecureContext
    || window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1";

  if (!hasMedia) {
    return {
      level: "unsupported",
      mayTransmitAudio: false,
      reason: "Este navegador não expõe captura de microfone (navigator.mediaDevices).",
    };
  }
  if (!SpeechClass) {
    return {
      level: "unsupported",
      mayTransmitAudio: false,
      reason: "Este navegador não implementa a Web Speech API (reconhecimento de fala). A ativação por voz fica indisponível aqui.",
    };
  }
  if (!secure) {
    return {
      level: "needs-https",
      mayTransmitAudio: true,
      reason: "O reconhecimento de fala exige uma conexão segura (HTTPS) ou localhost.",
    };
  }
  return {
    level: "ready",
    mayTransmitAudio: true,
    reason: "Reconhecimento de fala disponível. O navegador pode enviar o áudio ao serviço de reconhecimento do fornecedor; o jogo não grava nem armazena o áudio.",
  };
}

/**
 * Normaliza a frase reconhecida para comparação.
 *
 * · Maiúsculas/minúsculas são ignoradas.
 * · Espaços repetidos são colapsados.
 * · Pontuação final é removida.
 *
 * Não aceita frases parecidas nem palavras parciais: o
 * resultado precisa ser EXATAMENTE a frase configurada.
 */
export function normalizePhrase(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.,!?;:"'`´”“”‘’…—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A transcrição corresponde exatamente à frase de ativação?
 *
 * Exige que a frase inteira seja dita — nada a mais, nada a
 * menos. Isso evita ativações acidentais e frases parecidas.
 */
export function matchesActivationPhrase(transcript: string, phrase = ACTIVATION_PHRASE): boolean {
  if (typeof transcript !== "string") return false;
  const normalized = normalizePhrase(transcript);
  if (!normalized) return false;
  return normalized === normalizePhrase(phrase);
}

/**
 * Extract the activation phrase from a transcript that may contain
 * surrounding noise ("ok ativar painel por favor").
 *
 * We deliberately do NOT match substrings for the *decision* —
 * this helper exists only to produce a helpful diagnostic message
 * for the operator, and its result is never used to open the
 * panel on its own.
 */
export function containsActivationPhrase(transcript: string, phrase = ACTIVATION_PHRASE): boolean {
  const normalized = normalizePhrase(transcript);
  const target = normalizePhrase(phrase);
  return normalized.includes(target);
}

export type VoiceActivationError =
  | "sem-suporte"
  | "sem-https"
  | "permissao-negada"
  | "indisponivel"
  | "ja-ouvindo";

export interface VoiceActivationResult {
  ok: boolean;
  error?: VoiceActivationError;
  message: string;
}

type TranscriptHandler = (transcript: string, isFinal: boolean) => void;
type ErrorHandler = (error: VoiceActivationError, message: string) => void;

/**
 * VoiceActivation — a small, self-contained recognizer used ONLY
 * for the activation phrase.
 *
 * The recognizer is created on demand and destroyed on stop(), so
 * the microphone is never left running in the background.
 */
export class VoiceActivation {
  private recognition: any = null;
  private listening = false;
  private wantListening = false;
  private transcriptHandler: TranscriptHandler | null = null;
  private errorHandler: ErrorHandler | null = null;
  private lastError: VoiceActivationError | null = null;

  get isListening(): boolean {
    return this.listening;
  }

  get lastErrorCode(): VoiceActivationError | null {
    return this.lastError;
  }

  /**
   * Start listening for the activation phrase.
   *
   * The caller MUST have obtained explicit microphone permission
   * first. This method only starts the recognizer.
   */
  async start(
    onTranscript: TranscriptHandler,
    onError?: ErrorHandler,
  ): Promise<VoiceActivationResult> {
    const support = detectVoiceSupport();
    if (support.level === "unsupported") {
      return { ok: false, error: "sem-suporte", message: support.reason };
    }
    if (support.level === "needs-https") {
      return { ok: false, error: "sem-https", message: support.reason };
    }
    if (this.wantListening) {
      return { ok: false, error: "ja-ouvindo", message: "A escuta já está ativa." };
    }

    this.transcriptHandler = onTranscript;
    this.errorHandler = onError ?? null;
    this.lastError = null;
    this.wantListening = true;

    try {
      const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechClass();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.lang = RECOGNITION_LOCALE;

      recognition.onresult = (event: any) => {
        let best = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) {
            // Prefer an exact match among the alternatives.
            for (let a = 0; a < result.length; a++) {
              const alt = result[a]?.transcript ?? "";
              if (matchesActivationPhrase(alt)) {
                best = alt;
                break;
              }
              if (!best) best = alt;
            }
          } else {
            interim += text;
          }
        }
        if (best) this.transcriptHandler?.(best, true);
        else if (interim) this.transcriptHandler?.(interim, false);
      };

      recognition.onerror = (event: any) => {
        const code = event?.error;
        if (code === "not-allowed" || code === "service-not-allowed") {
          this.lastError = "permissao-negada";
          this.errorHandler?.(
            "permissao-negada",
            "A permissão do microfone foi negada ou revogada. O painel permanece fechado.",
          );
          this.stop();
        } else if (code === "no-speech" || code === "aborted") {
          // Not an error worth surfacing — the listener simply heard nothing.
        } else if (code === "network") {
          this.lastError = "indisponivel";
          this.errorHandler?.(
            "indisponivel",
            "O serviço de reconhecimento está indisponível. Tente novamente em instantes.",
          );
          this.stop();
        } else {
          this.lastError = "indisponivel";
          this.errorHandler?.("indisponivel", "Não foi possível reconhecer a fala agora.");
          this.stop();
        }
      };

      recognition.onend = () => {
        this.listening = false;
        // Auto-restart while the user keeps the panel trigger armed.
        if (this.wantListening) {
          try {
            recognition.start();
            this.listening = true;
          } catch {
            this.wantListening = false;
          }
        }
      };

      recognition.start();
      this.recognition = recognition;
      this.listening = true;
      return {
        ok: true,
        message: "Escutando. Diga a frase de ativação.",
      };
    } catch (err) {
      this.wantListening = false;
      this.listening = false;
      this.lastError = "indisponivel";
      return {
        ok: false,
        error: "indisponivel",
        message: "Não foi possível iniciar o reconhecimento de fala neste navegador.",
      };
    }
  }

  /** Stop listening immediately and release the recognizer. */
  stop(): void {
    this.wantListening = false;
    this.listening = false;
    if (this.recognition) {
      try { this.recognition.onend = null; this.recognition.onerror = null; this.recognition.onresult = null; } catch { /* ignore */ }
      try { this.recognition.stop(); } catch { /* ignore */ }
      try { this.recognition.abort(); } catch { /* ignore */ }
      this.recognition = null;
    }
    this.transcriptHandler = null;
    this.errorHandler = null;
  }
}

// ───────────────────────────────────────────────────────────────
//  Microphone permission helper
//
//  Requests permission through the official platform API. It
//  NEVER tries to bypass a denial and NEVER records audio.
// ───────────────────────────────────────────────────────────────

export interface MicPermissionResult {
  granted: boolean;
  reason: string;
}

/** Ask the browser for microphone permission via the official API. */
export async function requestMicrophonePermission(): Promise<MicPermissionResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      reason: "Este navegador não expõe captura de microfone. A ativação por voz não está disponível.",
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    // We only need the permission decision — release the device
    // immediately. The recognizer acquires it again on its own.
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true, reason: "Permissão de microfone concedida." };
  } catch (err: any) {
    const name = err?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return {
        granted: false,
        reason: "Permissão do microfone negada. O painel permanece fechado e o jogo continua normalmente.",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        granted: false,
        reason: "Nenhum microfone disponível. A ativação por voz não está disponível.",
      };
    }
    return {
      granted: false,
      reason: "Não foi possível obter a permissão do microfone. O painel permanece fechado.",
    };
  }
}

/** Is the microphone currently allowed according to the browser? */
export async function microphonePermissionState(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state as "granted" | "denied" | "prompt";
  } catch {
    return "unknown";
  }
}
