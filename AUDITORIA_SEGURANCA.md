# Auditoria de Segurança — Day of the Undead

**Revisor:** Engenheiro Especialista em Cibersegurança
**Escopo:** front-end (React/TypeScript), servidor Node/WebSocket, build e deploy
**Data:** 2026-10-30

Este documento lista **cada falha encontrada**, o **porquê** ela importa e
**exatamente o que foi reescrito** para corrigi-la.

---

## Resumo executivo

| # | Achado | Severidade | Status |
|---|---|---|---|
| 1 | Chave secreta do Paddle versionada no repositório | **Crítica** | ✅ Removida |
| 2 | Senhas de conta com hash de 32 bits (trivial de quebrar) | **Crítica** | ✅ Reescrita (PBKDF2) |
| 3 | Token de sessão gerado com `Math.random()` | **Alta** | ✅ Reescrito (CSPRNG) |
| 4 | Sem cabeçalhos de segurança (CSP, HSTS, X-Frame-Options…) | **Alta** | ✅ Adicionados |
| 5 | Sem HTTPS forçado / sem redirecionamento HTTP→HTTPS | **Alta** | ✅ Adicionado |
| 6 | Corpo de requisição sem limite de tamanho nem validação | **Alta** | ✅ Corrigido |
| 7 | Sem rate limiting em login/cadastro | **Alta** | ✅ Adicionado |
| 8 | Sem proteção contra força bruta | **Alta** | ✅ Adicionada |
| 9 | Nome de usuário autorizado embutido no bundle | **Alta** | ✅ Removido |
| 10 | Chave de assinatura de códigos de resgate hardcoded | **Alta** | ✅ Removida |
| 11 | `localStorage` de usuários aceitando campos de privilégio | **Média** | ✅ Corrigido |
| 12 | Mensagens WebSocket sem limite de tamanho | **Média** | ✅ Corrigido |
| 13 | Possível poluição de protótipo via JSON | **Média** | ✅ Corrigido |
| 14 | Chat sem saneamento de caracteres de controle | **Média** | ✅ Corrigido |
| 15 | CORS sem restrição | **Média** | ✅ Corrigido |
| 16 | Formulários sem proteção anti-spam | **Média** | ✅ Honeypot |
| 17 | Senha mínima de 4 caracteres | **Baixa** | ✅ Elevada para 8 |
| 18 | Enumeração de contas ("usuário não encontrado") | **Baixa** | ✅ Mensagem genérica |

**Total: 18 achados, 18 corrigidos.**

---

## 1. HTTPS e criptografia

### O que foi encontrado

O projeto servia **apenas HTTP**. Não existia nenhum redirecionamento para
HTTPS, nenhum `Strict-Transport-Security`, e o `vite.config.ts` não aplicava
nenhum cabeçalho de segurança.

### Por que isso importa

Sem HTTPS, todo o tráfego — incluindo a **senha da conta**, o **token de
sessão** e o **código de acesso administrativo** — trafega em texto claro.
Qualquer pessoa na mesma rede (Wi-Fi de cafeteria, hotel,chool) consegue
ler esses dados. O token de sessão stolen permite assumir a conta.

### Correção

**`server/securityHeaders.mjs`** (novo) — aplica os cabeçalhos em **todas**
as respostas e faz o redirecionamento:

```js
export function applySecurityHeaders(res, opts = {}) {
  const isSecure = opts.isSecure ?? false;

  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), payment=(self)");

  // Só anuncia HSTS quando a conexão é realmente segura —
  // em http://localhost isso quebraria o desenvolvimento.
  if (opts.hsts ?? isSecure) {
    res.setHeader("Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload");
  }
}
```

O redirecionamento **valida o `Host`** antes de responder — um header
`Host` é controlado pelo cliente, então redirecionar para um host
desconhecido seria um vetor de *open redirect*:

```js
export function redirectToHttps(req, res, host) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || (req.socket && req.socket.encrypted ? "https" : "http");
  if (proto === "https") return false;

  const hostname = String(host || req.headers.host || "").split(":")[0];
  // Host desconhecido → recusa, em vez de redirecionar.
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return false;
  }

  const target = `https://${hostname}${req.url || "/"}`;
  res.writeHead(301, { Location: target, "Content-Type": "text/plain; charset=utf-8" });
  res.end("Redirecting to HTTPS…\n");
  return true;
}
```

**`server/ws-server.mjs`** — aplica em todas as requisições:

```js
const FORCE_HTTPS =
  process.env.FORCE_HTTPS === "1" ||
  process.env.FORCE_HTTPS === "true" ||
  process.env.NODE_ENV === "production";

const httpServer = createServer(async (req, res) => {
  const isSecure = Boolean(req.socket && req.socket.encrypted);
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const effectiveSecure = isSecure || forwardedProto === "https";

  applySecurityHeaders(res, { isSecure: effectiveSecure, hsts: FORCE_HTTPS || effectiveSecure });

  if (FORCE_HTTPS && redirectToHttps(req, res, req.headers.host)) {
    return;
  }
  // …
});
```

**`vite.config.ts`** — o servidor de desenvolvimento também envia os
mesmos cabeçalhos, para que o ambiente de desenvolvimento não seja um
"espaço seguro" onde um cabeçalho falta silenciosamente.

---

## 2. Segurança de credenciais

### O que foi encontrado

**Achado crítico.** `server/paddleConfig.mjs` continha uma **chave secreta
real do Paddle** como valor padrão:

```js
// ANTES — chave real no repositório (valor REDIGIDO aqui de propósito:
// o segredo jamais deve ser reproduzido, nem em documentação).
apiKey: process.env.PADDLE_API_KEY || "pdl_live_apikey_<REDIGIDO>",
apiKeyAlt: process.env.PADDLE_API_KEY_ALT || "apikey_<REDIGIDO>",
```

A própria mensagem do arquivo dizia *"NUNCA commitar"* — mas a chave
estava lá. O GitHub **push protection** bloqueou o push, e a chave foi
removida inclusive do histórico git.

Também existiam:
- `src/game/security.ts` com uma **chave de assinatura hardcoded**;
- `src/game/adminAccess.ts` com uma **allowlist de nomes no cliente**;
- `src/game/panelAccess.ts` com os **nomes autorizados no bundle**.

### Correção

**`server/paddleConfig.mjs`** — nenhuma credencial versionada:

```js
function requiredEnv(name, hint) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    console.warn(`[paddle-config] ${name} is not set — a Paddle integration stays disabled. ${hint}`);
    return "";
  }
  return value;
}

export const PADDLE = {
  apiKey: requiredEnv("PADDLE_API_KEY",
    "Export the secret API key from the Paddle dashboard."),
  apiKeyAlt: optionalEnv("PADDLE_API_KEY_ALT"),
  clientToken: optionalEnv("PADDLE_CLIENT_TOKEN"),
  webhookSecret: optionalEnv("PADDLE_WEBHOOK_SECRET"),
  environment: (process.env.PADDLE_ENVIRONMENT || "sandbox").trim(),
};
```

E o servidor degrada com clareza em vez de falhar de forma obscura:

```js
async function paddleApi(method, path, body) {
  if (!PADDLE.apiKey) {
    return { status: 503, ok: false,
      json: { error: "paddle_not_configured", message: "PADDLE_API_KEY não configurado." } };
  }
  // …
}
```

**`.env.example`** (novo) documenta todas as variáveis. O `.env` real está
no `.gitignore`.

**Código de acesso administrativo** — reintroduzido **sem vazar**: vive
apenas em `ADMIN_ACCESS_CODE` no servidor e é devolvido **somente** a uma
conta que já passou pela allowlist:

```js
// server/adminConfig.mjs
export const ADMIN_ACCESS_CODE = (process.env.ADMIN_ACCESS_CODE || "").trim();

// server/ws-server.mjs — só depois de resolveAuthorizedAccountId()
res.end(JSON.stringify({
  granted: true, token, accountId: resolved, displayName,
  accessCode: ADMIN_ACCESS_CODE || null,   // ← só para conta autorizada
  // …
}));
```

O cliente (`src/game/adminAccess.ts`) apenas guarda o valor recebido:

```ts
export function getAdminAccessCode(): string | null {
  return serverPermission.accessCode;
}
```

Verificado: o bundle `dist/index.html` **não contém** `vocedescobriu`,
`RimuOfc`, `Guisdfas`, nem o antigo código de acesso do admin, nem a chave do Paddle.

---

## 3. Tratamento e validação de dados

### O que foi encontrado

`server/ws-server.mjs` fazia apenas:

```js
const body = await readJsonBody(req);   // JSON.parse, sem limite, sem tipo
if (!body) { /* 400 */ }
const accountId = typeof body.accountId === "string" ? body.accountId : "";
```

Problemas:
- **sem limite de tamanho** → um corpo de 1 GB derrubava o servidor;
- **sem `Content-Type`** → texto puro era interpretado como JSON;
- **sem verificação de tipo** → um array passava;
- **sem proteção contra poluição de protótipo** → `__proto__` era aceito;
- **nomes de exibição eram "trimados"** — e `" RimuOfc"` virava
  `"RimuOfc"`, **contornando a allowlist** (o teste `denies a look-alike
  display name` cobria exatamente esse caso e passava a falhar).

### Correção

**`server/validation.mjs`** (novo) — validação por *allow-list*:

```js
export const MAX_BODY_BYTES = 16 * 1024;

export function readJsonBody(req) {
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, error: "content-type-invalid" };
  }
  // …
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "body-not-object" };
  }
  // Descarta chaves de poluição de protótipo.
  const clean = {};
  for (const [key, val] of Object.entries(parsed)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    clean[key] = val;
  }
  return { ok: true, value: clean };
}
```

Validadores de campo:

```js
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ACCOUNT_ID_PATTERN = /^usr_[a-z0-9]{2,32}$/;

export function validateId(value) { /* … */ }
export function validateAccountId(value) { /* … */ }
export function validateRoomId(value) { /* … */ }

/**
 * IMPORTANTE: o nome NÃO é aparado (trim).
 * " RimuOfc" deve ser REJEITADO, não normalizado para "RimuOfc" —
 * senão a checagem da allow-list poderia ser contornada com espaços.
 */
export function validateDisplayName(value) {
  if (typeof value !== "string") return null;
  if (value !== value.trim()) return null;
  if (value.length < 2 || value.length > 24) return null;
  if (!/^[\p{L}\p{N} _.\\-]+$/u.test(value)) return null;
  return value;
}
```

Saneamento de texto (remove controles C0/C1, zero-width, limita tamanho):

```js
export function sanitizeText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  let out = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
  out = out.replace(/[\u200B-\u200D\uFEFF]/g, "");
  out = out.trim();
  if (out.length > maxLength) out = out.slice(0, maxLength);
  return out;
}
```

Aplicado em todas as rotas e no WebSocket:

```js
const accountId = validateAccountId(body.accountId) ?? "";
const displayName = validateDisplayName(body.displayName) ?? "";
// …
const targetId = typeof body.targetId === "string" ? body.targetId.trim().slice(0, 64) : "";
const effectId = validateId(body.effectId) ?? "";
```

> **Sobre SQL Injection:** o projeto **não usa SQL** — o multiplayer usa
> Firebase RTDB (JSON) e o estado local fica em `localStorage`. A
> validação acima é o equivalente correto para esse cenário: impede XSS
> (texto de chat/inventário injetado em HTML), *prototype pollution*,
> negação de serviço por payload gigante e *type confusion*.

---

## 4. Proteção de formulários

### O que foi encontrado

`src/components/AuthScreen.tsx` não tinha nenhuma proteção: um script
podia criar milhares de contas ou tentar milhões de senhas.

### Correção

**Honeypot** — um campo invisível que um humano nunca preenche, mas que
todo bot preenche:

```tsx
{/* Honeypot anti-spam field — hidden from humans, filled by bots. */}
<div className="hidden" aria-hidden="true">
  <label htmlFor="knx-website">Website</label>
  <input
    id="knx-website" name="website" type="text" tabIndex={-1}
    autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)}
  />
</div>
```

```tsx
const handleLogin = async () => {
  setError(null);
  if (website.trim()) {
    // Finge que funcionou — não diz ao bot por que falhou.
    setError("Credenciais inválidas");
    return;
  }
  // …
};
```

**Rate limiting + bloqueio progressivo** (ver seção 5).

---

## 5. Autenticação e sessão

### O que foi encontrado — o achado mais grave do front-end

`src/game/auth.ts` usava um hash caseiro de 32 bits:

```js
// ANTES — 32 bits, sem custo, vulnerável a rainbow tables
function hashPassword(password: string, salt: string): string {
  let hash = 0;
  const str = password + salt;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + "_" + salt.slice(0, 8);
}
```

Para dimensionar: **32 bits = ~4 bilhões de combinações**. Uma GPU moderna
examina bilhões por segundo → o espaço inteiro é explorado em **segundos**.
A "sal" tinha apenas 8 caracteres tirados do `Math.random()`.

O token de sessão também usava `Math.random()`:

```js
// ANTES — previsível
function generateToken(): string {
  return `tok_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}
```

E o `id` da conta idem. Não havia nenhuma proteção contra força bruta.

### Correção

**`src/game/passwordHash.ts`** (novo) — PBKDF2-HMAC-SHA256, 210 000
iterações, salt de 16 bytes aleatórios, comparação em tempo constante.
Usa a **WebCrypto nativa** — **zero dependências novas**:

```ts
const ALGORITHM = "PBKDF2";
const HASH_NAME = "SHA-256";
const ITERATIONS = 210_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;

export async function hashPassword(password: string, salt?: string): Promise<string> {
  const usedSalt = salt && salt.length > 0 ? salt : generateSalt();
  const derived = await deriveKey(password, usedSalt);
  return `pbkdf2_sha256$${ITERATIONS}$${usedSalt}$${derived}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 4) return false;
  const [scheme, iterRaw, salt, expected] = parts;
  if (scheme !== "pbkdf2_sha256") return false;

  const iterations = Number.parseInt(iterRaw, 10);
  // Faixa limitada: um "$999999999$" seria um DoS.
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 2_000_000) return false;

  const derived = await deriveKey(password, salt, iterations);
  return timingSafeEqualString(derived, expected);
}
```

Formato: `pbkdf2_sha256$210000$<salt>$<hash>`.

**`src/game/auth.ts`** — reescrito com:

- **CSPRNG** para token, id e salt (`crypto.getRandomValues`);
- **PBKDF2** com o salt realmente armazenado (bug corrigido: o salt
  gravado e o usado no hash precisam ser o mesmo);
- **bloqueio progressivo** contra força bruta;
- **rate limiting** por janela deslizante;
- **mensagem genérica** (não revela se a conta existe);
- **re-hash oportunista** quando os parâmetros ficam obsoletos;
- **filtro de campos de privilégio** no `localStorage`;
- validação de nome, email e senha.

```ts
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_BASE_MS = 30_000;
const LOCK_MAX_MS = 15 * 60_000;

/** Backoff exponencial: 30s, 60s, 120s… até 15 minutos. */
function registerFailure(key: string): number {
  const now = Date.now();
  const record = failures.get(key);
  if (!record || now - record.firstAt > ATTEMPT_WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: now, lastAt: now, lockedUntil: 0 });
    return 0;
  }
  record.count += 1;
  record.lastAt = now;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    const lockMs = Math.min(LOCK_BASE_MS * 2 ** (record.count - MAX_FAILED_ATTEMPTS), LOCK_MAX_MS);
    record.lockedUntil = now + lockMs;
    return lockMs;
  }
  return 0;
}
```

```ts
// Mensagem idêntica para "conta não existe" e "senha errada" —
// não permite enumerar contas.
if (!user) {
  registerFailure(lockKey);
  return { success: false, error: "Credenciais inválidas" };
}
```

**`localStorage` endurecido** — um registro adulterado é descartado, e
só os campos esperados são reconstruídos:

```ts
const FORBIDDEN_USER_KEYS = new Set([
  "__proto__", "constructor", "prototype",
  "isAdmin", "role", "permissions", "admin",
  "isModerator", "banned", "whitelist", "allowlist",
]);

clean.push({
  id: entry.id, username: entry.username,
  email: typeof entry.email === "string" ? entry.email : "",
  passwordHash: entry.passwordHash,
  salt: typeof entry.salt === "string" ? entry.salt : "",
  createdAt: Number(entry.createdAt) || 0,
  lastLogin: Number(entry.lastLogin) || 0,
  avatar: typeof entry.avatar === "string" ? entry.avatar : "🧟",
});
```

> **Nota honesta:** como o login é 100 % local (`localStorage`), o
> `localStorage` **é** a fonte de identidade. Um atacante com acesso ao
> navegador pode editar o `localStorage` — inclusive o `id` da conta. É
> uma limitação **estrutural** do modo offline, não do código. A
> correção definitiva é o `accountId` vir do **Firebase Auth** (`uid`),
> que o servidor já aceita sem nenhuma mudança de arquitetura.

### Sessões administrativas (servidor)

O servidor já emitia tokens opacos, e isso foi mantido e endurecido:

- token de 32 bytes (`base64url`), **só** para contas na allowlist;
- TTL de 30 min, revogação ao remover da allowlist, no logout ou na
  desconexão;
- **revalidação em cada comando privilegiado**;
- comparação em tempo constante.

---

## 6. Cabeçalhos de segurança

### O que foi encontrado

Nenhum. O servidor respondia apenas com `Content-Type`.

### Correção

Ver seção 1. A CSP aplicada:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://cdn.paddle.com https://cdn.tailwindcss.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.paddle.com;
img-src 'self' data: blob: https://*.firebaseio.com https://cdn.paddle.com;
font-src 'self' data: https://fonts.gstatic.com https://cdn.paddle.com;
connect-src 'self' ws://localhost:* wss://* https://*.firebaseio.com
            https://*.googleapis.com https://cdn.paddle.com https://api.paddle.com;
media-src 'self' blob:;
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
manifest-src 'self';
upgrade-insecure-requests
```

Pontos-chave:

| Cabeçalho | Efeito |
|---|---|
| `object-src 'none'` | bloqueia `<object>`/`<embed>` (plugins) |
| `frame-ancestors 'none'` + `X-Frame-Options: DENY` | impede **clickjacking** |
| `base-uri 'self'` | impede sequestro de `<base>` |
| `form-action 'self'` | impede exfiltração de formulário para domínio externo |
| `X-Content-Type-Options: nosniff` | impede sniffing de MIME |
| `Referrer-Policy: strict-origin-when-cross-origin` | não vaza a URL completa |
| `Permissions-Policy` | desliga geolocalização e câmera por padrão |
| `Cross-Origin-Opener-Policy: same-origin` | isola a janela de *popups* |
| `Strict-Transport-Security` | força HTTPS nos próximos 12 meses |

---

## Correções adicionais encontradas durante a auditoria

### WebSocket sem limite de tamanho

```js
const MAX_WS_MESSAGE_BYTES = 8 * 1024;

ws.on("message", (data) => {
  const raw = typeof data === "string" ? data : data.toString("utf8");
  if (raw.length > MAX_WS_MESSAGE_BYTES) {
    try { ws.close(1009, "message-too-big"); } catch { /* ignore */ }
    return;
  }
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
  for (const key of Object.keys(msg)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") delete msg[key];
  }
  handleMessage(playerId, msg);
});
```

### Chat sem saneamento

```js
const text = sanitizeText(msg.chatText, LIMITS.MAX_COMMAND_LENGTH);
if (!text) break;
```

O texto é renderizado como texto pelo React (que escapa HTML), mas o
saneamento evita caracteres de controle corromperem o log e o JSON.

### CORS sem restrição

```js
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || "").trim();

const origin = String(req.headers.origin || "");
if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
}
if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
```

Com `ALLOWED_ORIGIN` vazio (padrão), só same-origin é aceito.

### Nomes autorizados no bundle

`src/game/panelAccess.ts` guardava a lista de nomes no cliente — qualquer
pessoa via devtools descobria **quem** tem acesso. Agora:

```ts
/**
 * ⚠️  NÃO há allowlist de nomes neste arquivo.
 * A lista vive exclusivamente no servidor.
 */
export function isAuthorizedPanelUsername(_username: string): boolean {
  return false;   // A autorização vem do servidor.
}
```

O veredito chega por `requestServerPermission()` → `serverAuthorized`.

---

## Verificação

```bash
npx tsc --noEmit      # ✅ sem erros
npm run build         # ✅ dist/index.html 999,58 kB (gzip 289,56 kB)
npx vitest run        # ✅ 155 testes, 10 arquivos, todos passando
```

| Suíte | Testes | Cobre |
|---|---|---|
| `tests/security.test.ts` | 26 | PBKDF2, validação, força bruta, rate limit, `localStorage` envenenado, ausência de allowlist no cliente |
| `tests/serverSecurity.test.mjs` | 18 | Cabeçalhos em 200/404, HTTPS, content-type, corpo grande (413), JSON inválido, array, `__proto__`, código de acesso só para autorizado, token forjado, cooldown |
| `tests/panelAccess.test.ts` | 15 | Frase de ativação, ausência de allowlist no cliente |
| `tests/voiceActivation.test.ts` | 13 | Permissão de microfone, ciclo do recognizer |
| `tests/panelCommand.test.ts` | 14 | Parsing estrito de comandos |
| `tests/firstPerson.test.ts` | 7 | Persistência da câmera |
| `tests/firstPersonRenderer.test.ts` | 9 | Render em primeira pessoa |
| `tests/serverAuthorization.test.mjs` | 29 | Allowlist, sessões, limites |
| `tests/serverIntegration.test.mjs` | 16 | HTTP real contra o servidor |
| `tests/serverWebsocket.test.mjs` | 8 | WebSocket real |

Varredura do bundle final (`dist/index.html`) — **0 ocorrências** de:
o código de acesso administrativo, `RimuOfc`, `Guisdfas`, a antiga chave de
assinatura dos códigos de resgate e a chave do Paddle.

---

## Configuração de produção

```bash
# HTTPS (obrigatório em produção)
FORCE_HTTPS=1
NODE_ENV=production

# CORS — seu domínio
ALLOWED_ORIGIN=https://seu-dominio.com

# Painel administrativo — as DUAS contas autorizadas
ADMIN_ACCOUNT_IDS=usr_rimu,usr_guis
ADMIN_ACCOUNT_NAMES='{"RimuOfc":"usr_rimu","Guisdfas":"usr_guis"}'

# Código de acesso (mostrado no painel apenas a contas autorizadas)
ADMIN_ACCESS_CODE=troque-este-valor

# Cobrança
PADDLE_API_KEY=...
PADDLE_WEBHOOK_SECRET=...
PADDLE_ENVIRONMENT=production
```

### ⚠️ Ação recomendada imediata

A chave do Paddle que estava no repositório deve ser **revogada** no
painel da Paddle e substituída por outra. Chaves vazadas não podem ser
"des-publicadas" — apenas trocadas. Se o repositório já foi público em
algum momento, considere todos os valores encontrados nele como
comprometidos.

---

## Limitações honestas

1. **Login local.** `localStorage` é a fonte de identidade no modo
   offline; quem controla o navegador controla o `id`. A correção
   definitiva é o `uid` do Firebase Auth — o servidor já aceita.
2. **`'unsafe-inline'` na CSP.** O `index.html` tem dois scripts inline
   legados (esconder a barra de endereço no iOS e o duplo-toque). Eles
   devem ser movidos para arquivos externos para permitir remover
   `'unsafe-inline'` da `script-src`. **Não foi feito** porque alteraria
   o comportamento do scroll em iOS — está registrado como dívida.
3. **`cdn.tailwindcss.com`** é um CDN de runtime. Para produção,
   compilar o Tailwind no build eliminaria essa dependência externa.
4. **Auditoria em memória.** O log técnico é reiniciado a cada deploy e
   limitado a 200 entradas. Para conformidade real, use um sink
   persistente.
5. **Sem verificação visual no navegador.** O sandbox não tem Chromium
   (download bloqueado pela allowlist de rede), então a CSP, o HSTS e o
   redirecionamento foram verificados por **testes automatizados contra o
   servidor real**, e não visualmente. Confirme no preview ao vivo.
