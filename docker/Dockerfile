# NUPLEX — web(Next.js) · sync(동기화 워커) 두 개의 실행 이미지를 한 파일에서 만든다.
# 기동은 항상 compose.sh 를 통해서만 한다 — AGENTS.md §2

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# ---------------------------------------------------------------------------
# 빌드 — Next.js standalone
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL 없이도 빌드가 통과해야 한다(연결은 첫 쿼리까지 지연된다 — lib/db/index.ts)
RUN npm run build

# ---------------------------------------------------------------------------
# web — 외부 접속 포트 2620
# ---------------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
# standalone 서버(node server.js)는 -p/-H 같은 CLI 플래그를 읽지 않는다.
# 포트 · 호스트는 이 환경변수로만 바뀐다 — AGENTS.md §4
ENV PORT=2620
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# self-hosted runner의 umask 때문에 static 파일이 403 이 되는 것을 막는다 — AGENTS.md §4
RUN chmod -R a+rX /app

EXPOSE 2620
CMD ["node", "server.js"]

# ---------------------------------------------------------------------------
# sync — 포트를 열지 않는 내부 워커. Plex를 호출하는 유일한 컨테이너다.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS sync
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY lib ./lib
COPY sync ./sync
RUN chmod -R a+rX /app
CMD ["npx", "tsx", "sync/worker.ts"]
