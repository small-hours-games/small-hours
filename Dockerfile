FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data
EXPOSE 3001
CMD ["node", "src/server.js"]
