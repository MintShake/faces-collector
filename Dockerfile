FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV CLOUD_STORAGE_ONLY=true
ENV KAFKA_ENABLED=false
ENV BLOB_UPLOAD_ORIGINALS=false
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY scripts ./scripts
COPY public ./public
EXPOSE 3000
CMD ["npm", "run", "start:hosted"]
