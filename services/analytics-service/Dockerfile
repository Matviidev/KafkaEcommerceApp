FROM node:20-alpine
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/analytics-service/ ./services/analytics-service/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ecommerce/shared build
RUN pnpm --filter @ecommerce/analytics-service build
CMD ["node", "services/analytics-service/dist/index.js"]
