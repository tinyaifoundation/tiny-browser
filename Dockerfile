FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-alpine
ENV NODE_ENV=production TINYBROWSER_MODE=relay TINYBROWSER_BASE_PATH=/tinybrowser
WORKDIR /app
COPY --from=build /app/server/dist/ ./dist/
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
