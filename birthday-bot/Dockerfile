FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

# Install cron
RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*

# Script that exports env vars to cron and starts it
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create log file
RUN touch /var/log/birthday-bot.log

ENTRYPOINT ["/entrypoint.sh"]
