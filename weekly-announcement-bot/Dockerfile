FROM node:22-alpine

RUN apk add --no-cache tzdata

WORKDIR /app/weekly-announcement-bot

COPY weekly-announcement-bot/package*.json ./
RUN npm ci --omit=dev

COPY weekly-announcement-bot/src/ ./src/
COPY shared/ /app/shared/

CMD ["node", "src/index.js"]
