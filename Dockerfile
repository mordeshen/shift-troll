FROM node:22-slim AS builder

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package
COPY package.json ./

# Copy client
COPY client/package.json client/package-lock.json* client/
RUN cd client && npm install

COPY client/ client/
RUN cd client && npm run build

# Copy server
COPY server/package.json server/package-lock.json* server/
RUN cd server && npm install

COPY server/ server/
RUN cd server && npx prisma generate

# --- Production image ---
FROM node:22-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server with all deps (need tsx + prisma at runtime)
COPY --from=builder /app/server ./server

# Copy built client
COPY --from=builder /app/client/dist ./client/dist

# Copy root package.json for start script
COPY package.json ./

WORKDIR /app/server

# Expose port (Railway sets PORT env var)
EXPOSE ${PORT:-3001}

# Start server
CMD ["npx", "tsx", "src/index.ts"]
