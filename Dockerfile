FROM node:22-alpine

WORKDIR /app

# Install dependencies (layer cached until package.json changes)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source (used when running without docker-compose bind mount)
COPY . .

# Data directory — bind-mounted at runtime, created here as fallback
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
