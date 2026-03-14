FROM node:22-alpine

# curl is required for the docker-compose healthcheck
RUN apk add --no-cache curl

WORKDIR /app

EXPOSE 3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# auth/ is mounted as a volume at runtime — not baked into the image
VOLUME ["/app/auth"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
