FROM node:22-alpine AS ui-build
WORKDIR /ui
COPY admin-ui/package*.json ./
RUN npm ci
COPY admin-ui/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app

COPY admin-api/package*.json ./
RUN npm ci --omit=dev

COPY admin-api/src/ ./src/
COPY --from=ui-build /ui/dist/ ./public/

CMD ["node", "src/index.js"]
