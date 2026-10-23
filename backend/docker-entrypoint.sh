#!/bin/sh
set -e
echo "Waiting for database..."
sleep 3
npx prisma migrate deploy
node prisma/seed.js || echo "Seed skipped"
if [ -f dist/main.js ]; then
  exec node dist/main.js
else
  exec node dist/src/main.js
fi

