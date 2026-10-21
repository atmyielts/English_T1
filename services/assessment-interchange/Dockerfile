# Pinned official multi-platform Node 24 image, verified 2026-10-20.
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
WORKDIR /app/services/assessment-interchange
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY src/ ./src/
COPY --from=core . /app/packages/assessment-core/src/
USER 10001:10001
# OS-enforced lifetime survives a caller crash or a blocked JS event loop.
ENTRYPOINT ["/usr/bin/timeout", "--signal=KILL", "45s", "node", "--experimental-transform-types", "--max-old-space-size=256", "src/cli.ts"]
