# 🥑 Paddle Billing — Day of the Undead

Servidor de webhooks + API de gestão de assinaturas. É ele que **concede, suspende e revoga** o acesso ao jogo após pagamentos, cancelamentos e reembolsos.

---

## ⚠️ Segurança — leia antes de qualquer deploy

| Credencial | Onde vive | Pode ir pro navegador? |
|---|---|---|
| `PADDLE_CLIENT_TOKEN` (`live_f1f4f92…`) | `src/game/paddle.ts` (padrão) ou `VITE_PADDLE_CLIENT_TOKEN` | ✅ **Sim** — é pública por design |
| `PADDLE_API_KEY` (`pdl_live_apikey_…`) | **somente variável de ambiente** | ❌ **NUNCA** |
| `PADDLE_WEBHOOK_SECRET` (`pdl_whsec_…`) | **somente variável de ambiente** | ❌ **NUNCA** |

A API key secreta permite **reembolsar, cancelar e ler todas as transações** da sua conta.

🔒 **Nenhuma credencial secreta é versionada neste repositório.**
Anteriormente `server/paddleConfig.mjs` trazia uma chave `pdl_live_…` como
valor padrão. Isso foi removido: agora a chave só existe na variável de
ambiente, e o GitHub push protection passaria a bloquear o commit de
qualquer forma.

Sem `PADDLE_API_KEY` configurada o servidor sobe em modo degradado e
reporta o estado com clareza:

* `/health` → `secretKeyConfigured: false`
* chamadas à API do Paddle → `503 paddle_not_configured` (sem nenhuma
  requisição externa é feita)
* requisições de webhook → assinatura inválida (o segredo ausente não
  valida nada)

Configure antes de publicar:

```bash
export PADDLE_API_KEY="pdl_live_apikey_..."
export PADDLE_WEBHOOK_SECRET="pdl_whsec_..."
```

> **Se a chave antiga foi publicada em algum repositório público, revogue-a
> no painel da Paddle e gere outra.** Chaves vazadas não podem ser
> "des-publicadas" — apenas trocadas.

---

## 🚀 Rodando localmente

```bash
cd server
node paddle-server.mjs
# → http://localhost:8787
```

O front já aponta para `http://localhost:8787` (constante `PADDLE_SERVER_URL` em `src/game/paddle.ts`). Para trocar:

```bash
# vite: defina no .env
VITE_PADDLE_SERVER=https://billing.seudominio.com
```

---

## 🔔 Configurando o webhook no Paddle

1. Paddle Dashboard → **Developer tools** → **Notifications** → **New Destination**
2. URL: `https://SEU-HOST/api/paddle/webhook`
3. Marque os eventos:

```
transaction.completed
transaction.payment_failed
subscription.activated
subscription.trialing
subscription.updated
subscription.paused
subscription.resumed
subscription.past_due
subscription.canceled
subscription.expired
adjustment.created
adjustment.updated
```

4. Copie o **Secret key** e exporte:

```bash
export PADDLE_WEBHOOK_SECRET="pdl_whsec_xxxxxxxxxxxx"
```

Sem esse segredo o servidor **rejeita** todo webhook (400 + motivo no log) — a assinatura é verificada com `timingSafeEqual` e eventos com mais de 5 minutos são descartados como replay.

### Testando sem expor servidor

```bash
# instale o túnel do Paddle
brew install paddlehq/tap/paddle-cli        # macOS
paddle webhook simulate --url http://localhost:8787/api/paddle/webhook \
  --secret "$PADDLE_WEBHOOK_SECRET" --event subscription.activated
```

---

## 🧭 Endpoints

| Método | Rota | Função |
|---|---|---|
| POST | `/api/paddle/webhook` | Recebe eventos do Paddle (assinatura obrigatória) |
| GET | `/api/paddle/stream` | **SSE** — empurra mudanças de acesso para o jogo em tempo real |
| POST | `/api/paddle/subscriptions/:id/cancel` | Cancela (`end_of_term` ou `immediately`) |
| POST | `/api/paddle/subscriptions/:id/pause` | Pausa cobrança |
| POST | `/api/paddle/subscriptions/:id/resume` | Retoma cobrança |
| POST | `/api/paddle/subscriptions/:id/change` | Upgrade/downgrade com proration |
| GET | `/api/paddle/subscriptions/:id` | Consulta assinatura |
| GET | `/api/paddle/transactions` | Últimas 50 transações |
| GET | `/api/paddle/customers?email=` | Busca cliente |
| GET | `/api/paddle/discounts` | Cupons ativos |
| GET | `/api/paddle/state` | Espelho local de entitlements + log de eventos |
| GET | `/health` | Status do serviço |

As rotas de gestão existem justamente para que o navegador **nunca** precise da API key: ele chama o seu servidor, que chama o Paddle.

---

## 🔄 Fluxo de acesso

```
Cliente                    Seu servidor                Paddle
  │  openCheckout(plan)         │                          │
  ├─────────────────────────────┼─────────────────────────►│
  │◄──── checkout overlay ──────┼──────────────────────────┤
  │  checkout.completed         │                          │
  ├────────────────────────────►│                          │
  │                             │◄─── transaction.completed│ (webhook assinado)
  │                             │  valida HMAC + idade     │
  │                             │  atualiza entitlement    │
  │◄──── SSE: entitlement ──────┤                          │
  │  grant + deliver (moedas/itens/unlocks)                │
```

O `checkout.completed` do cliente é apenas **reconciliação otimista**. A fonte de verdade é o webhook — se ele nunca chegar, o acesso não é concedido de forma permanente.

### Máquina de estados implementada

| Evento | Efeito no acesso |
|---|---|
| `transaction.completed` | concede (moedas, itens, unlock) |
| `subscription.activated` | concede + define `current_period_end` |
| `subscription.trialing` | concede como trial |
| `subscription.paused` | **suspende** benefícios |
| `subscription.resumed` | restaura |
| `subscription.past_due` | **suspende** até regularizar |
| `subscription.canceled` (`end_of_term`) | mantém até o fim do período pago |
| `subscription.canceled` (`immediately`) | **revoga na hora** |
| `subscription.expired` | revoga |
| `adjustment.created` (refund total) | **revoga + desfaz entrega** |
| `adjustment.created` (refund parcial) | registra valor, mantém acesso |
| `transaction.payment_failed` | suspende |

Reembolso remove os itens ainda não consumidos da fila e marca as chaves cosméticas como revogadas — `enforceRevocations(save)` as retira do perfil no próximo login.

---

## 🗄️ Persistência

Por padrão o servidor grava em `server/data/*.json` (zero dependências). Em produção troque por Postgres/Redis — só há dois pontos de acesso:

```js
readStore(file)   // server/paddle-server.mjs
writeStore(file, data)
```

Schema sugerido:

```sql
CREATE TABLE paddle_entitlements (
  key TEXT PRIMARY KEY,             -- subscription_id ?? transaction_id
  user_id UUID REFERENCES users(id),
  plan_id TEXT NOT NULL,
  price_ids TEXT[],
  status TEXT NOT NULL,             -- active|trialing|paused|past_due|expiring|canceled|refunded|expired
  amount_minor INT,
  currency CHAR(3) DEFAULT 'BRL',
  customer_id TEXT,
  transaction_id TEXT,
  subscription_id TEXT,
  starts_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  scheduled_end_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  refunded_amount INT DEFAULT 0,
  delivered BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON paddle_entitlements (user_id, status);
CREATE INDEX ON paddle_entitlements (subscription_id);
```

---

## ☁️ Deploy

### Railway / Render / Fly.io
```bash
# build command
npm install
# start command
node server/paddle-server.mjs
# env
PADDLE_API_KEY=pdl_live_apikey_...
PADDLE_WEBHOOK_SECRET=pdl_whsec_...
PORT=8787
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/ ./server/
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server/paddle-server.mjs"]
```

Depois do deploy, atualize a **Notification URL** no Paddle para `https://SEU-HOST/api/paddle/webhook` e defina `VITE_PADDLE_SERVER` no build do front.

---

## 🛒 Catálogo

Os planos ficam em `src/game/paddlePlans.ts`, com preços em **centavos de BRL** (nunca float). Substitua os `priceId` de exemplo pelos IDs reais criados em **Paddle → Catalog → Prices**:

```ts
{ id: "passe-mensal", priceId: "pri_01SEU_ID_REAL", amountBrl: 1990, interval: "month", ... }
```

Enquanto os IDs forem de exemplo, o checkout roda no **simulador local**, que reproduz a mesma sequência de eventos do Paddle real (`opening → pending → processing → completed`) — dá para testar o fluxo inteiro offline.
