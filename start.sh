#!/bin/sh
cd /app/server
npx prisma db push --skip-generate
npx tsx prisma/seed.ts
cd /app
node --import tsx server/src/index.ts
