# ============================================
# Stage 1: Build TypeScript
# ============================================
FROM node:22-alpine3.20 AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build configurations
COPY src ./src
COPY tsconfig.json ./
COPY tsconfig.build.json ./

# Compile TypeScript
RUN npm run build

# ============================================
# Stage 2: Development (Watch mode)
# ============================================
FROM node:22-alpine3.20 AS dev

WORKDIR /app

# Copy all files for development (node_modules already installed in builder)
COPY --from=builder /app /app

# Expose app port
EXPOSE 8080

# For development, we run in watch mode
# Note: You must mount the local 'src' directory as a volume for this to work
CMD ["npm", "run", "dev"]

# ============================================
# Stage 3: Production Image
# ============================================
FROM node:22-alpine3.20 AS production

# Set NODE_ENV to production
ENV NODE_ENV=production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install production dependencies
COPY package.json package-lock.json* ./
# Skip scripts like 'prepare' (husky) which depend on devDependencies
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled JavaScript
COPY --from=builder /app/dist ./dist

# Create necessary directories with correct permissions
RUN mkdir -p keys logs && \
    chown -R nodejs:nodejs /app/keys /app/logs

USER nodejs

# Expose app port
EXPOSE 8080

# Health check using the /health endpoint defined in server.ts
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run the application
CMD ["node", "dist/server.js"]
