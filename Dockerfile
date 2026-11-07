FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Version comes from package.json, the commit from .git refs (see .dockerignore)
# or GIT_SHA from CI. Record when this image was built; shown on the front page.
RUN mkdir -p /app/data && date -u +%Y-%m-%dT%H:%M:%SZ > /app/.build-time
ARG GIT_SHA=
ENV GIT_SHA=$GIT_SHA
EXPOSE 3001
CMD ["node", "src/server.js"]
