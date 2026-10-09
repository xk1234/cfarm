# One image for both Railway services: `web` runs `pnpm start` (default),
# `worker` overrides the start command with `pnpm worker`.
FROM node:22-bookworm-slim

# node-canvas runtime libraries (cairo/pango/image codecs) and fontconfig so
# the bundled assets/fonts render on Linux exactly as in the golden tests.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates fontconfig \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Only public build-time values; server secrets stay runtime-only.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
