FROM node:20-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY api/package.json ./api/


FROM base AS builder

RUN pnpm install --frozen-lockfile

COPY api ./api

RUN pnpm --filter @lecture-summarizer/api build


FROM base

RUN pnpm install --frozen-lockfile --prod

RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/api/dist ./api/dist

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "api/dist/src/main.js"]