# syntax=docker.io/docker/dockerfile:1

FROM node:22-slim AS base


FROM base AS builder
WORKDIR /app

COPY package.json package-lock.json* yarn.lock .npmrc* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi


FROM base AS runner
WORKDIR /app

COPY . .
COPY --from=builder /app/ .

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

ENTRYPOINT ["yarn", "run", "start"]
