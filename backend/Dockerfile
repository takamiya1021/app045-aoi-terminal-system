FROM node:20-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY config ./config

RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends tmux bash openssh-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PORT=3102
ENV NODE_ENV=development
ENV SHELL=/bin/bash

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/config ./config

EXPOSE 3102

USER node
CMD ["node", "dist/server.js"]

