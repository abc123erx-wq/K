# 🧟 Zomboid Web — Multiplayer Server

Real-time WebSocket server for Knox County multiplayer.

## Quick Start

```bash
cd server
npm install
node ws-server.mjs
```

Server runs on `ws://localhost:8080`

## 🚀 Deploy to Cloud Platforms

### Railway (Recommended - Free Tier)

1. Go to [railway.app](https://railway.app)
2. Create new project → "Deploy from GitHub"
3. Point to the `server/` directory
4. Railway auto-detects Node.js and deploys
5. Copy the generated URL (e.g., `wss://your-app.up.railway.app`)
6. Enter the URL in the game's Server panel

**Cost:** Free tier includes 500 hours/month

### Fly.io (Edge Locations - Low Latency)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Deploy
cd server
fly launch --now
```

**Cost:** Free tier includes 3 small VMs, 160GB data transfer

### AWS EC2 (Full Control)

1. Launch EC2 `t2.micro` (free tier)
2. Security Group: open TCP port 8080
3. SSH into instance:
```bash
sudo yum update -y
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install nodejs -y
# Upload files via scp or git clone
npm install
node ws-server.mjs
```
4. Connect with `wss://<your-ec2-ip>:8080`

**Cost:** Free tier: 750 hours/month t2.micro

### Render (Free with Cold Start)

1. Go to [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub → select `server/` directory
4. Build Command: `npm install`
5. Start Command: `node ws-server.mjs`
6. Auto-deploys with URL

**Cost:** Free tier (cold starts after 15 min inactivity)

### Google Cloud Run

```bash
# Deploy using Cloud Run
gcloud run deploy zomboid-server \
  --source ./server \
  --platform managed \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated
```

**Cost:** 2M requests/month free

### Vercel (WebSocket via Edge Functions)

Vercel doesn't natively support WebSocket. Use the `ws-server.mjs` with a separate hosting like Railway instead.

### Heroku

```bash
# Install Heroku CLI
heroku create zomboid-web-server
heroku buildpacks:set heroku/nodejs
git subtree push --prefix server heroku main
```

### DigitalOcean App Platform

1. Go to [digitalocean.com](https://digitalocean.com)
2. Create → Apps
3. Connect GitHub → select `server/`
4. Type: "Worker" (not Web Service)
5. Run command: `node ws-server.mjs`

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Server status page (auto-refresh) |
| `GET /health` | JSON health check with player count |
| `POST /admin/permission` | Exchange an authenticated account id for an admin session token |
| `GET /admin/session` | Inspect the current admin session |
| `DELETE /admin/session` | Revoke the current admin session |
| `POST /panel/activate` | Anti-replay bookkeeping for a special-panel activation |
| `POST /panel/spawn` | Request an effect near a target player (server decides) |
| `GET /panel/players` | Connected players, for the panel's target picker |
| `GET /admin/audit` | Minimal technical audit feed |
| `WS /` | WebSocket multiplayer connection |

## 🔐 Administrative access

The admin panel and the special panel are gated by the **server**. There is
no password and no access code in the client bundle.

Two environment variables configure who is allowed:

```bash
# The stable account ids that may administer the game.
export ADMIN_ACCOUNT_IDS="usr_abc123,usr_def456"

# Optional: bind a display name to that exact account id.
export ADMIN_ACCOUNT_NAMES='{"RimuOfc":"usr_abc123","Guisdfas":"usr_def456"}'
```

When `ADMIN_ACCOUNT_NAMES` is set, the session's account id **and** its
exact display name must both match the same entry. Look-alike names
(`RimuOfc123`, `rimuofc`, ` RimuOfc`) are rejected.

Alternative to the env var:

```bash
export ADMIN_ACCOUNTS_FILE=./admin-accounts.json
# { "accountIds": ["usr_abc123"] }
```

> **If `ADMIN_ACCOUNT_IDS` is empty or missing, every privileged panel stays
> closed for everybody.** That is intentional — there is no client-side
> fallback.

See `server/adminConfig.mjs` for the allowed effects and the rate limits,
and `DOCUMENTACAO_ATUALIZACAO.md` (repo root) for the full guide.

## 🔧 Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server listening port |
| `ADMIN_ACCOUNT_IDS` | *(empty)* | Comma-separated account ids allowed to administer |
| `ADMIN_ACCOUNT_NAMES` | *(empty)* | JSON map of exact display name → account id |
| `ADMIN_ACCOUNTS_FILE` | *(unset)* | Path to a JSON file with `accountIds` |
| `ADMIN_SESSION_TTL_MS` | 1800000 | Admin session lifetime |
| `PANEL_COMMAND_COOLDOWN_MS` | 3000 | Minimum interval between privileged commands |
| `PANEL_ACTIVATION_COOLDOWN_MS` | 5000 | Minimum interval between panel activations |
| `PANEL_MAX_COMMANDS_PER_WINDOW` | 10 | Max privileged commands per sliding window |
| `PANEL_COMMAND_WINDOW_MS` | 60000 | Sliding window length |
| `PANEL_MAX_ACTIVE_EFFECTS_PER_ROOM` | 30 | Max live panel effects per room |
| `PANEL_MAX_ACTIVE_EFFECTS_PER_TARGET` | 6 | Max live panel effects per target player |

## 📊 Monitor

The server exposes a beautiful status page at `http://localhost:8080` showing:
- Connected players
- Peak players
- Total connections
- Uptime
- Individual player stats

## 🛡️ Security Notes

- Privileged commands (admin panel, special panel) are validated
  server-side: token → account → allowlist → target → effect → limits.
  The client only hides the UI; it never grants access.
- The admin session token is opaque, server-held, and re-checked against
  the allowlist on every privileged command. Removing an id from
  `ADMIN_ACCOUNT_IDS` invalidates outstanding sessions.
- Rate limiting (cooldown + sliding window) is enforced on the server and
  the cooldown slot is consumed by the *attempt*, so rejected requests
  cannot be used to spam.
- Display names are never used as the identity proof.
- The special panel's spawn placement is validated against a deterministic,
  read-only mirror of the client world (`server/worldProbe.mjs`) so the
  server can reject blocked or unsafe positions without trusting the client.
- WebSocket chat messages still accept unverified display names — for
  production, add JWT authentication for player identity.
- Use HTTPS/WSS (not WS) for browser security; the `ws` package supports TLS.

## 🔧 Scaling

For 100+ concurrent players:
1. Use a process manager like PM2: `pm2 start ws-server.mjs -i max`
2. Deploy behind a load balancer (AWS ALB, Nginx)
3. Use Redis Pub/Sub for multi-server sync
4. Consider Kubernetes for auto-scaling

## 🎮 Client Connection

In the game's Server Configuration panel:
1. Enter your server URL: `wss://your-app.railway.app:8080`
2. Click Connect
3. Open multiple browser tabs or share the URL with friends
4. Everyone sees each other in the same Knox County!
