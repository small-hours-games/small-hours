FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ENV APP_VERSION=$APP_VERSION GIT_SHA=$GIT_SHA
EXPOSE 3001
CMD ["node", "src/server.js"]
