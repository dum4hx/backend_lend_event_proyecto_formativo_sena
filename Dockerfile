# ============================================
# Stage 1: Build TypeScript
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source files and build config
COPY src ./src
COPY tsconfig.json ./
COPY tsconfig.build.json ./

# Compile TypeScript to JavaScript
RUN npm run build

# ============================================
# Stage 2: Production Image
# ============================================
FROM node:22-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Copy keys directory (JWT keys - mount as volume in production)
# Keys should be generated and mounted, not baked into image
RUN mkdir -p keys logs

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose application port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start the application
CMD ["node", "dist/server.js"]
