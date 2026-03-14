#!/bin/bash

# Export current env vars and PATH so cron can access them
printenv | grep -E '^(GOOGLE_|WHATSAPP_|SHEET_|PATH=)' > /etc/environment

# Set up cron job (daily at 3 PM UTC = 7 AM PST)
echo "0 15 * * * . /etc/environment; cd /app && /usr/local/bin/npx tsx src/index.ts >> /var/log/birthday-bot.log 2>&1" | crontab -

echo "Birthday bot cron scheduled (daily at 3 PM UTC / 7 AM PST)"
echo "To run manually: docker exec birthday-bot npx tsx src/index.ts"

# Start cron in foreground
cron -f
