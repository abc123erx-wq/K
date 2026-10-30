// ============================================================
//  PANEL SERVICE — client ⇄ server bridge for the special panel
//
//  All privileged operations are server-side. This module only:
//    · builds well-formed requests,
//    · sends the server-issued token,
//    · interprets the server's response codes,
//    · never evaluates anything it receives.
//
//  Server endpoints (see server/ws-server.mjs):
//    POST /admin/permission  → { granted, token, spawnable }
//    POST /panel/activate     → anti-replay bookkeeping
//    POST /panel/spawn        → validated spawn request
//    GET  /panel/players      → target picker list
// ============================================================

import { getAdminApiBase, getServerToken } from "./adminAccess";

export interface PanelEffect {
  id: string;
  label: string;
}

export interface PanelTarget {
  id: string;
  name: string;
  x?: number;
  y?: number;
}

export interface PanelSpawnResult {
  ok: boolean;
  /** Server reason code (safe, no internals). */
  code?: string;
  message: string;
  effectId?: string;
  label?: string;
  targetId?: string;
  targetName?: string;
  positions?: { x: number; y: number }[];
  retryAfterMs?: number;
}

export const PANEL_MESSAGES: Record<string, string> = {
  "sem-permissao": "A permissão não foi confirmada pelo servidor. O painel foi fechado.",
  "cooldown": "Aguarde um instante antes de tentar novamente.",
  "recurso-invalido": "Esse recurso não está disponível. Escolha um item da lista.",
  "alvo-invalido": "Alvo inválido. Selecione um jogador conectado.",
  "alvo-desconectado": "O jogador escolhido saiu da partida. Selecione outro alvo.",
  "limite-sala": "Limite de efeitos ativos na sala atingido.",
  "limite-alvo": "Limite de efeitos ativos para este jogador atingido.",
  "sem-ponto-seguro": "Não há um ponto seguro próximo para esse efeito. Nada foi criado.",
  "mundo-indisponivel": "Não foi possível validar o terreno no servidor.",
  "requisicao-invalida": "Requisição inválida.",
};

function describe(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return PANEL_MESSAGES[code] ?? fallback;
}

function base(): string | null {
  return getAdminApiBase();
}

function authHeaders(): Record<string, string> {
  const token = getServerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Ask the server to record a panel activation.
 * Used for anti-replay only — the phrase never leaves the device.
 */
export async function notifyActivation(): Promise<{ ok: boolean; message: string }> {
  const endpoint = base();
  const token = getServerToken();
  if (!endpoint || !token) {
    return { ok: false, message: "Permissão não confirmada pelo servidor." };
  }
  try {
    const res = await fetch(`${endpoint}/panel/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({}),
    });
    if (res.status === 401) {
      return { ok: false, message: "A permissão expirou. Entre novamente para reabrir o painel." };
    }
    if (res.status === 429) {
      const data = (await res.json().catch(() => ({}))) as { retryAfterMs?: number };
      return {
        ok: false,
        message: `Aguarde ${Math.ceil((data.retryAfterMs ?? 5000) / 1000)}s antes de reabrir o painel.`,
      };
    }
    if (!res.ok) {
      return { ok: false, message: "O servidor não confirmou a ativação." };
    }
    return { ok: true, message: "Ativação confirmada pelo servidor." };
  } catch {
    return { ok: false, message: "Servidor indisponível. O painel foi fechado." };
  }
}

/** Fetch the list of connected players for the target picker. */
export async function fetchPanelPlayers(room = "global"): Promise<PanelTarget[]> {
  const endpoint = base();
  const token = getServerToken();
  if (!endpoint || !token) return [];
  try {
    const res = await fetch(`${endpoint}/panel/players?room=${encodeURIComponent(room)}`, {
      method: "GET",
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; players?: PanelTarget[] };
    return Array.isArray(data.players) ? data.players : [];
  } catch {
    return [];
  }
}

/**
 * Request a spawn. The server decides whether it happens and where.
 *
 * @param effectId an id from the server-provided allowlist
 * @param targetId a session id of a connected player
 */
export async function requestSpawn(
  effectId: string,
  targetId: string,
  room = "global",
): Promise<PanelSpawnResult> {
  const endpoint = base();
  const token = getServerToken();
  if (!endpoint || !token) {
    return { ok: false, code: "sem-permissao", message: "Permissão não confirmada pelo servidor." };
  }
  if (!effectId || !targetId) {
    return { ok: false, code: "requisicao-invalida", message: "Escolha um recurso e um alvo antes de enviar." };
  }

  try {
    const res = await fetch(`${endpoint}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ effectId, targetId, room }),
    });

    if (res.status === 401) {
      return { ok: false, code: "sem-permissao", message: PANEL_MESSAGES["sem-permissao"] };
    }
    if (res.status === 429) {
      const data = (await res.json().catch(() => ({}))) as { retryAfterMs?: number };
      return {
        ok: false,
        code: "cooldown",
        message: PANEL_MESSAGES["cooldown"],
        retryAfterMs: data.retryAfterMs ?? 0,
      };
    }

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
      effectId?: string;
      label?: string;
      targetId?: string;
      targetName?: string;
      positions?: { x: number; y: number }[];
    };

    if (!res.ok || !data.ok) {
      return {
        ok: false,
        code: data.code,
        message: describe(data.code, "O servidor recusou o comando."),
      };
    }

    return {
      ok: true,
      effectId: data.effectId,
      label: data.label,
      targetId: data.targetId,
      targetName: data.targetName,
      positions: data.positions,
      message: `Efeito "${data.label}" invocado perto de ${data.targetName}.`,
    };
  } catch {
    return { ok: false, code: "requisicao-invalida", message: "Não foi possível contatar o servidor." };
  }
}
