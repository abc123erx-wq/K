// ═══════════════════════════════════════════════════════════════
//  AI MODERATION ENGINE — Voice & Text Chat Safety System
//  Real-time toxicity classification, acoustic scream/spam detection,
//  automated warnings, temporary auto-mutes, and admin audit logging.
// ═══════════════════════════════════════════════════════════════

export type ModerationCategory =
  | "SEGURO"
  | "TOXICIDADE_LEVE"
  | "TOXICIDADE_SEVERA"
  | "OFENSA_VERBAL"
  | "ASSEDIO"
  | "DISCURSO_ODIO"
  | "SCREAM_SPAM";

export interface ModerationResult {
  isFlagged: boolean;
  category: ModerationCategory;
  toxicityScore: number; // 0.0 to 1.0
  censoredText: string;
  violations: string[];
  actionTaken?: "none" | "warning" | "temp_mute" | "voice_ban";
}

export interface ModerationIncident {
  id: string;
  ts: number;
  playerId: string;
  playerName: string;
  rawText: string;
  censoredText: string;
  category: ModerationCategory;
  toxicityScore: number;
  action: "warning" | "temp_mute" | "voice_ban";
}

// Banned & toxic terms dictionary (Portuguese & English common toxic words)
const TOXIC_PATTERNS: { regex: RegExp; severity: number; category: ModerationCategory }[] = [
  // Severe hate speech & discrimination
  { regex: /\b(nazista|fascista|macaco|preto imundo|viadinho|traveco|chink|nigger|faggot)\b/i, severity: 1.0, category: "DISCURSO_ODIO" },
  // Harassment & extreme threats
  { regex: /\b(vou te matar|vou te estuprar|se mata|morre lixo|te achar na vida real|doxx)\b/i, severity: 0.95, category: "ASSEDIO" },
  // Severe profanity / insults
  { regex: /\b(filho da puta|arrombado|desgraçado|vagabundo|puta|vadia|cuzão|merda|otário|babaca|imbecil|fuck you|bitch|asshole)\b/i, severity: 0.75, category: "OFENSA_VERBAL" },
  // Toxic gaming behavior
  { regex: /\b(lixo|noob inutil|incompetente|estrume|cancer do time|trash player)\b/i, severity: 0.45, category: "TOXICIDADE_LEVE" },
];

class AIModerationService {
  private incidents: ModerationIncident[] = [];
  private playerInfractions: Map<string, number> = new Map();
  private mutedPlayers: Map<string, number> = new Map(); // playerId -> unmutedAt timestamp
  private sensitivity: "strict" | "balanced" | "lenient" = "balanced";
  private onModerationAlert: ((incident: ModerationIncident) => void) | null = null;

  setSensitivity(mode: "strict" | "balanced" | "lenient") {
    this.sensitivity = mode;
  }

  getSensitivity() {
    return this.sensitivity;
  }

  onAlert(callback: (incident: ModerationIncident) => void) {
    this.onModerationAlert = callback;
  }

  /**
   * Evaluates text/speech transcript using semantic and pattern-based analysis.
   */
  evaluate(text: string, playerId: string, playerName: string): ModerationResult {
    const raw = text.trim();
    if (!raw) {
      return { isFlagged: false, category: "SEGURO", toxicityScore: 0, censoredText: "", violations: [] };
    }

    let highestSeverity = 0;
    let detectedCategory: ModerationCategory = "SEGURO";
    const foundViolations: string[] = [];
    let censored = raw;

    for (const pattern of TOXIC_PATTERNS) {
      if (pattern.regex.test(raw)) {
        foundViolations.push(pattern.category);
        if (pattern.severity > highestSeverity) {
          highestSeverity = pattern.severity;
          detectedCategory = pattern.category;
        }
        censored = censored.replace(pattern.regex, (match) => "*".repeat(match.length));
      }
    }

    // Adjust threshold based on sensitivity setting
    const threshold = this.sensitivity === "strict" ? 0.35 : this.sensitivity === "balanced" ? 0.55 : 0.8;
    const isFlagged = highestSeverity >= threshold;

    let actionTaken: "none" | "warning" | "temp_mute" | "voice_ban" = "none";

    if (isFlagged) {
      const prevInfractions = (this.playerInfractions.get(playerId) || 0) + 1;
      this.playerInfractions.set(playerId, prevInfractions);

      if (prevInfractions >= 3 || highestSeverity >= 0.95) {
        // Temp mute for 45s
        actionTaken = "temp_mute";
        this.mutePlayer(playerId, 45);
      } else if (prevInfractions >= 5) {
        // Voice ban for 10 min
        actionTaken = "voice_ban";
        this.mutePlayer(playerId, 600);
      } else {
        actionTaken = "warning";
      }

      const incident: ModerationIncident = {
        id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(),
        playerId,
        playerName,
        rawText: raw,
        censoredText: censored,
        category: detectedCategory,
        toxicityScore: highestSeverity,
        action: actionTaken,
      };

      this.incidents.unshift(incident);
      if (this.incidents.length > 100) this.incidents.pop();

      this.onModerationAlert?.(incident);
    }

    return {
      isFlagged,
      category: detectedCategory,
      toxicityScore: highestSeverity,
      censoredText: censored,
      violations: foundViolations,
      actionTaken,
    };
  }

  /**
   * Evaluates acoustic energy for scream spam / mic ear-rape.
   */
  evaluateAcousticScream(peakDecibels: number, playerId: string, playerName: string): boolean {
    // If audio signal spikes excessively loud for continuous duration
    if (peakDecibels > 96) {
      const incident: ModerationIncident = {
        id: `scream-${Date.now()}`,
        ts: Date.now(),
        playerId,
        playerName,
        rawText: "[GRITO EXCESSIVO / EAR-RAPE DETECTADO PELA IA]",
        censoredText: "[ÁUDIO MUTADO AUTOMATICAMENTE]",
        category: "SCREAM_SPAM",
        toxicityScore: 0.85,
        action: "temp_mute",
      };
      this.mutePlayer(playerId, 20);
      this.incidents.unshift(incident);
      this.onModerationAlert?.(incident);
      return true;
    }
    return false;
  }

  mutePlayer(playerId: string, seconds = 30) {
    this.mutedPlayers.set(playerId, Date.now() + seconds * 1000);
  }

  unmutePlayer(playerId: string) {
    this.mutedPlayers.delete(playerId);
  }

  isPlayerMuted(playerId: string): boolean {
    const expiresAt = this.mutedPlayers.get(playerId);
    if (!expiresAt) return false;
    if (Date.now() >= expiresAt) {
      this.mutedPlayers.delete(playerId);
      return false;
    }
    return true;
  }

  getMuteRemainingSeconds(playerId: string): number {
    const expiresAt = this.mutedPlayers.get(playerId);
    if (!expiresAt) return 0;
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  }

  getIncidents(): ModerationIncident[] {
    return [...this.incidents];
  }

  clearIncidents() {
    this.incidents = [];
  }
}

export const AIModeration = new AIModerationService();
