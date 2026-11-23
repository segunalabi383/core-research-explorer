# Build the Angular app
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Run: the server has no npm dependencies, so the image needs only Node, the server and the build.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist ./dist
COPY server/core-proxy.mjs server/index.mjs ./server/
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
