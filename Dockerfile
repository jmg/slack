# syntax=docker/dockerfile:1

# ---- Build stage: install all deps, generate Prisma client, build Next ----
# NODE_ENV is left unset so `npm ci` installs devDependencies (needed to build)
# while `next build` still produces a production build.
FROM node:22-slim AS build
WORKDIR /app

# OpenSSL is handy for Prisma; ca-certificates for outbound TLS at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
# Generate the Prisma client (schema only — no DB needed) then build Next.
RUN npx prisma generate && npm run build

# ---- Runner stage: full app + deps so `next start`, `prisma migrate deploy`
#      (release) and the seed script are all available at runtime. ----
FROM node:22-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app ./

EXPOSE 3000
CMD ["npm", "run", "start"]
