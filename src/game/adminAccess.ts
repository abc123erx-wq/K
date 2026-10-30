// ============================================================
//  ADMIN / SPECIAL PANEL ACCESS — server-authoritative
//
//  PRINCÍPIO (não negociável):
//    · O nome exibido NÃO é prova de identidade.
//    · A permissão vem de um TOKEN emitido pelo servidor, e o
//      servidor valida o identificador estável da conta contra a
//      sua allowlist (ADMIN_ACCOUNT_IDS).
//    · Nenhuma senha, chave, token ou credencial vive no cliente.
//    · Sem servidor configurado ⇒ TODO MODO PRIVADO FICA
//      FECHADO. Não há fallback "local" que conceda acesso.
//
//  O cliente apenas esconde a UI. A autoridade é o servidor, que
//  rejeita qualquer comando privilegiado e registra a tentativa
//  sem revelar detalhes internos.
//
//  Configuração do servidor: server/adminConfig.mjs
// ============================================================

export interface AccountInfo {
  id: string;
  username: string;
  isGuest: boolean;
}

export type AccessDenial =
  | "sem-conta"
  | "conta-visitante"
  | "sem-servidor"
  | "servidor-indisponivel"
  | "servidor-negou"
  | "sem-sessao";

export interface AccessResult {
  ok: boolean;
  reason?: AccessDenial;
  scope: "servidor" | "local";
}

export type ServerPermissionMode = "unconfigured" | "granted" | "denied" | "unknown";

interface ServerPermissionState {
  mode: ServerPermissionMode;
  token: string | null;
  accountId: string | null;
  checkedAt: number | null;
  spawnable: string[];
}

let serverPermission: ServerPermissionState = {
  mode: "unknown",
  token: null,
  accountId: null,
  checkedAt: null,
  spawnable: [],
};

/**
 * Base URL of the authoritative backend.
 * Configured by the player in the Server panel (knox-ws-url) or by
 * the deployment (VITE_ADMIN_API_BASE). Returns null when no
 * backend is reachable — in that case every privileged feature
 * stays closed.
 */
export function getAdminApiBase(): string | null {
  // Explicit override wins (used by deployments behind a proxy).
  try {
    const env = (import.meta as any).env?.VITE_ADMIN_API_BASE;
    if (typeof env === "string" && env) return env.replace(/\/+$/, "");
  } catch { /* ignore */ }

  try {
    const ws = localStorage.getItem("knox-ws-url");
    if (ws) {
      const url = new URL(ws);
      const protocol = url.protocol === "wss:" ? "https:" : "http:";
      return `${protocol}//${url.host}`;
    }
  } catch { /* ignore */ }

  try {
    const legacy = localStorage.getItem("knox-admin-api");
    if (legacy) return legacy.replace(/\/+$/, "");
  } catch { /* ignore */ }

  return null;
}

/** Has the player ever been denied? Keeps the UI honest about state. */
export function hasServerPermission(): boolean {
  return serverPermission.mode === "granted" && !!serverPermission.token;
}

/**
 * Ask the server whether this account may administer the game.
 *
 * The server compares the stable account id against its own
 * allowlist. If it does not know the account, it answers 403 and
 * the panel stays closed for everyone else.
 */
export async function requestServerPermission(account: AccountInfo): Promise<ServerPermissionState> {
  const endpoint = getAdminApiBase();
  if (!endpoint) {
    serverPermission = { mode: "unconfigured", token: null, accountId: null, checkedAt: Date.now(), spawnable: [] };
    return serverPermission;
  }
  try {
    const res = await fetch(`${endpoint}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.id, displayName: account.username }),
    });
    if (!res.ok) {
      serverPermission = { mode: "denied", token: null, accountId: null, checkedAt: Date.now(), spawnable: [] };
      return serverPermission;
    }
    const data = (await res.json()) as {
      granted?: boolean;
      token?: string;
      accountId?: string;
      spawnable?: string[];
    };
    serverPermission = data.granted && data.token
      ? {
          mode: "granted",
          token: data.token,
          accountId: data.accountId ?? account.id,
          checkedAt: Date.now(),
          spawnable: Array.isArray(data.spawnable) ? data.spawnable : [],
        }
      : { mode: "denied", token: null, accountId: null, checkedAt: Date.now(), spawnable: [] };
  } catch {
    // Servidor inacessível: NÃO conceder por conta própria.
    serverPermission = { mode: "denied", token: null, accountId: null, checkedAt: Date.now(), spawnable: [] };
  }
  notifyPermissionListeners();
  return serverPermission;
}

/**
 * Re-validates a privileged action.
 *
 * The server re-checks on every command regardless; this is the
 * client-side mirror used to keep the UI honest and to avoid
 * sending requests that are certain to be rejected.
 */
export function revalidate(account: AccountInfo | null): AccessResult {
  if (!account) return { ok: false, reason: "sem-conta", scope: "local" };
  if (account.isGuest) return { ok: false, reason: "conta-visitante", scope: "local" };
  if (serverPermission.mode === "unconfigured") {
    return { ok: false, reason: "sem-servidor", scope: "local" };
  }
  if (serverPermission.mode === "denied") {
    return { ok: false, reason: "servidor-negou", scope: "servidor" };
  }
  if (serverPermission.mode === "granted" && serverPermission.token) {
    return { ok: true, scope: "servidor" };
  }
  return { ok: false, reason: "sem-sessao", scope: "servidor" };
}

/** The current server-issued token, if any. */
export function getServerToken(): string | null {
  return serverPermission.mode === "granted" ? serverPermission.token : null;
}

/** The allowlist of invocable effect ids, as provided by the server. */
export function getSpawnableIds(): string[] {
  return [...serverPermission.spawnable];
}

type PermissionListener = (state: ServerPermissionState) => void;
const permissionListeners = new Set<PermissionListener>();

/**
 * Subscribe to permission state changes.
 * Used by the panels so they refresh their lists as soon as the
 * server confirms (or revokes) the permission.
 */
export function subscribeToPermission(listener: PermissionListener): () => void {
  permissionListeners.add(listener);
  listener(getServerPermissionState());
  return () => { permissionListeners.delete(listener); };
}

function notifyPermissionListeners() {
  const state = getServerPermissionState();
  for (const listener of permissionListeners) {
    try { listener(state); } catch { /* ignore */ }
  }
}

export function getServerPermissionState(): ServerPermissionState {
  return { ...serverPermission, spawnable: [...serverPermission.spawnable] };
}

export function resetServerPermission() {
  serverPermission = { mode: "unknown", token: null, accountId: null, checkedAt: null, spawnable: [] };
  notifyPermissionListeners();
}

export const ACCESS_REASON_TEXT: Record<AccessDenial, string> = {
  "sem-conta": "Faça login com uma conta autorizada.",
  "conta-visitante": "Contas de visitante não possuem permissão administrativa.",
  "sem-servidor": "Nenhum servidor autoritativo configurado. O painel permanece fechado.",
  "servidor-indisponivel": "O servidor não pôde ser contatado. O painel permanece fechado.",
  "servidor-negou": "O servidor negou a permissão administrativa.",
  "sem-sessao": "A sessão administrativa expirou. Entre novamente.",
};
