# ============================================================
# Zomboid Web - Multiplayer Server Dockerfile
# Deploy to: AWS ECS, Fly.io, Railway, Render, any Docker host
# ============================================================

FROM node:20-alpine

WORKDIR /app

# Copy server files
COPY package.json ./
RUN npm install --production

COPY ws-server.mjs ./

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:${PORT:-8080}/health || exit 1

ENV PORT=8080
EXPOSE 8080

CMD ["node", "ws-server.mjs"]
