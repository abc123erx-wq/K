// ═══════════════════════════════════════════════════════════════
//  VOICE CHAT SYSTEM — In-Game Proximity Voice Chat & Audio Engine
//  Microphone capture, real-time waveform analyzer, Push-to-Talk,
//  Web Speech API transcription, and AI content moderation integration.
// ═══════════════════════════════════════════════════════════════

import { AIModeration, type ModerationIncident } from "./aiModeration";
import { Net } from "./net";

export interface VoiceChatState {
  isSupported: boolean;
  isMicActive: boolean;
  isSpeaking: boolean;
  isMutedBySelf: boolean;
  isMutedByAI: boolean;
  aiMuteCountdown: number;
  inputMode: "ptt" | "vad"; // Push-To-Talk vs Voice Activity Detection
  vadThreshold: number; // 0.0 to 1.0 volume threshold
  micVolume: number; // 0.0 to 2.0 gain
  audioLevel: number; // 0.0 to 1.0 current RMS level
  frequencyData: number[]; // 8-16 bands for visualizer
  lastTranscript: string;
  activeSpeakers: { id: string; name: string; volume: number; isFlagged: boolean }[];
  incidentToast: ModerationIncident | null;
}

type VoiceStateListener = (state: VoiceChatState) => void;

class VoiceChatManager {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private recognition: any = null;

  private isPTTPressed = false;
  private isMutedBySelf = false;
  private inputMode: "ptt" | "vad" = "ptt";
  private vadThreshold = 0.15;
  private micVolume = 1.0;
  private currentAudioLevel = 0;
  private frequencyData: number[] = new Array(8).fill(0);

  private lastTranscript = "";
  private myId = "";
  private myName = "";
  private listeners: Set<VoiceStateListener> = new Set();
  private updateInterval: any = null;
  private currentIncidentToast: ModerationIncident | null = null;
  private remoteSpeakers: Map<string, { id: string; name: string; volume: number; isFlagged: boolean; ts: number }> = new Map();

  constructor() {
    AIModeration.onAlert((incident) => {
      this.currentIncidentToast = incident;
      this.notify();
      setTimeout(() => {
        if (this.currentIncidentToast?.id === incident.id) {
          this.currentIncidentToast = null;
          this.notify();
        }
      }, 5000);
    });
  }

  init(myId: string, myName: string) {
    this.myId = myId;
    this.myName = myName;
    this.setupSpeechRecognition();
  }

  subscribe(listener: VoiceStateListener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  /**
   * Request microphone access and setup audio analysis pipeline.
   */
  async startMicrophone(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn("[VoiceChat] getUserMedia not supported in this environment");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.mediaStream = stream;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }

      this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 64;
      this.analyserNode.smoothingTimeConstant = 0.5;

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.micVolume;

      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.analyserNode);

      // Start processing loop
      this.startAudioProcessing();

      // Start speech-to-text recognition
      this.startSpeechRecognition();

      this.notify();
      return true;
    } catch (err) {
      console.warn("[VoiceChat] Microphone permission denied or audio error:", err);
      return false;
    }
  }

  stopMicrophone() {
    this.stopAudioProcessing();
    this.stopSpeechRecognition();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.notify();
  }

  private startAudioProcessing() {
    if (this.updateInterval) clearInterval(this.updateInterval);

    const buffer = new Uint8Array(32);

    this.updateInterval = setInterval(() => {
      if (!this.analyserNode) return;

      this.analyserNode.getByteFrequencyData(buffer);

      // Calculate audio energy / RMS
      let sum = 0;
      for (let i = 0; i < 16; i++) {
        sum += buffer[i];
      }
      const rawAvg = sum / 16;
      this.currentAudioLevel = Math.min(1, rawAvg / 128);

      // 8 visualizer bars
      const freqs: number[] = [];
      for (let i = 0; i < 8; i++) {
        freqs.push(Math.min(1, buffer[i * 2] / 200));
      }
      this.frequencyData = freqs;

      // Check scream / ear-rape acoustic anomaly
      if (this.isSpeakingNow()) {
        const estDecibels = rawAvg * 0.9;
        if (estDecibels > 95) {
          AIModeration.evaluateAcousticScream(estDecibels, this.myId, this.myName);
        }
      }

      this.notify();
    }, 80);
  }

  private stopAudioProcessing() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.currentAudioLevel = 0;
    this.frequencyData = new Array(8).fill(0);
  }

  /**
   * Setup Web Speech API for real-time speech-to-text
   */
  private setupSpeechRecognition() {
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass) {
      console.info("[VoiceChat] Web Speech API not natively available; audio analysis enabled");
      return;
    }

    try {
      this.recognition = new SpeechClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = "pt-BR";

      this.recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        if (transcript.trim()) {
          this.lastTranscript = transcript.trim();

          // Evaluate with AI Moderation!
          const result = AIModeration.evaluate(this.lastTranscript, this.myId, this.myName);

          if (result.isFlagged) {
            // Send warning in chat
            Net.sendChat(`⚠️ [IA MODERAÇÃO] Conteúdo censurado de ${this.myName}: "${result.censoredText}"`);
          }

          this.notify();
        }
      };

      this.recognition.onerror = () => {
        // Silently recover
      };

      this.recognition.onend = () => {
        // Auto restart if mic is still active
        if (this.mediaStream && this.isSpeakingNow()) {
          try {
            this.recognition.start();
          } catch {}
        }
      };
    } catch {}
  }

  private startSpeechRecognition() {
    if (this.recognition) {
      try {
        this.recognition.start();
      } catch {}
    }
  }

  private stopSpeechRecognition() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
  }

  // --- Push To Talk / Controls ---
  setPTTPressed(pressed: boolean) {
    this.isPTTPressed = pressed;
    this.notify();
  }

  toggleMuteSelf() {
    this.isMutedBySelf = !this.isMutedBySelf;
    this.notify();
  }

  setInputMode(mode: "ptt" | "vad") {
    this.inputMode = mode;
    this.notify();
  }

  setVadThreshold(val: number) {
    this.vadThreshold = Math.max(0.01, Math.min(1, val));
    this.notify();
  }

  setMicVolume(val: number) {
    this.micVolume = Math.max(0, Math.min(2, val));
    if (this.gainNode) {
      this.gainNode.gain.value = this.micVolume;
    }
    this.notify();
  }

  isSpeakingNow(): boolean {
    if (!this.mediaStream || this.isMutedBySelf || AIModeration.isPlayerMuted(this.myId)) {
      return false;
    }

    if (this.inputMode === "ptt") {
      return this.isPTTPressed && this.currentAudioLevel > 0.05;
    }

    return this.currentAudioLevel > this.vadThreshold;
  }

  // Handle peer audio indicator from network
  setRemoteSpeaker(id: string, name: string, volume: number, isFlagged: boolean) {
    this.remoteSpeakers.set(id, { id, name, volume, isFlagged, ts: Date.now() });
    this.notify();
  }

  getState(): VoiceChatState {
    const isMutedByAI = AIModeration.isPlayerMuted(this.myId);
    const aiMuteCountdown = AIModeration.getMuteRemainingSeconds(this.myId);

    // Prune expired remote speakers
    const now = Date.now();
    const activeSpeakers: { id: string; name: string; volume: number; isFlagged: boolean }[] = [];
    for (const [id, s] of this.remoteSpeakers) {
      if (now - s.ts < 1200) {
        activeSpeakers.push(s);
      } else {
        this.remoteSpeakers.delete(id);
      }
    }

    return {
      isSupported: !!(navigator.mediaDevices?.getUserMedia),
      isMicActive: !!this.mediaStream,
      isSpeaking: this.isSpeakingNow(),
      isMutedBySelf: this.isMutedBySelf,
      isMutedByAI,
      aiMuteCountdown,
      inputMode: this.inputMode,
      vadThreshold: this.vadThreshold,
      micVolume: this.micVolume,
      audioLevel: this.currentAudioLevel,
      frequencyData: this.frequencyData,
      lastTranscript: this.lastTranscript,
      activeSpeakers,
      incidentToast: this.currentIncidentToast,
    };
  }
}

export const VoiceChat = new VoiceChatManager();
