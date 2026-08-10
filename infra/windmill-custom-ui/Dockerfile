FROM node:24-alpine AS frontend

ARG WINDMILL_REF=d638fab5f6c2a38ad55dd6951220eed25d2598b3

RUN apk add --no-cache bash git
WORKDIR /src
RUN git clone https://github.com/windmill-labs/windmill.git \
  && cd windmill \
  && git checkout "${WINDMILL_REF}"

WORKDIR /src/windmill
COPY enum-image-select.patch /tmp/enum-image-select.patch
COPY lumenclip-input-roots.patch /tmp/lumenclip-input-roots.patch
COPY responsive-flow-forms.patch /tmp/responsive-flow-forms.patch
RUN git apply --check /tmp/enum-image-select.patch \
  && git apply /tmp/enum-image-select.patch \
  && git apply --check /tmp/lumenclip-input-roots.patch \
  && git apply /tmp/lumenclip-input-roots.patch \
  && git apply --check /tmp/responsive-flow-forms.patch \
  && git apply /tmp/responsive-flow-forms.patch

WORKDIR /src/windmill/frontend
RUN npm ci
RUN cd /src/windmill/backend/windmill-api \
  && ./build_openapi.sh \
  && cd /src/windmill/frontend \
  && npm run generate-backend-client
ENV NODE_OPTIONS=--max-old-space-size=8192
RUN npm run build

FROM ghcr.io/windmill-labs/windmill:main@sha256:99ddb6664d8519a4c45d7bb18fa26d1f0c90f32ba1dc1dcce40412095e832937

COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy
COPY --from=frontend /src/windmill/frontend/build /static_frontend
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8000
CMD ["sh", "-c", "PORT=8001 windmill & exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]
