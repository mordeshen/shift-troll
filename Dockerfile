FROM node:22-alpine

WORKDIR /app

# Copy everything
COPY . .

# Build client
WORKDIR /app/client
RUN npm install
RUN npm run build

# Build server
WORKDIR /app/server
RUN npm install
RUN npx prisma generate

# Back to root
WORKDIR /app

EXPOSE 3001

CMD ["sh", "start.sh"]
