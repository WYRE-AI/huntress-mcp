# Multi-stage build for efficient container size
FROM node:26-alpine AS builder

# Build arguments
ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# GitHub Packages auth comes in as a BuildKit secret (the release workflow
# passes --secret id=npmrc) so the token never lands in a layer or in image
# metadata. Local builds: --secret id=npmrc,src=$HOME/.npmrc
# Install dependencies (--ignore-scripts prevents 'prepare' from running before source is copied)
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Prune dev dependencies in builder stage
RUN npm prune --omit=dev

# Production stage
FROM node:26-alpine AS production

# Pull latest Alpine package fixes (e.g. OpenSSL) even when the base layer is cached
RUN apk -U upgrade --no-cache

# Create a non-root user for security
RUN addgroup -g 1001 -S huntress && \
    adduser -S huntress -u 1001 -G huntress

# Set working directory
WORKDIR /app

# Copy package files and built application from builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Create logs directory
RUN mkdir -p /app/logs && chown -R huntress:huntress /app

# Remove bundled npm/npx from the runtime image (not needed at runtime; CMD runs node directly).
# Eliminates Trivy findings against npm's bundled dependencies in the base image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Switch to non-root user
USER huntress

# Expose port
EXPOSE 8080

# Health check against the actual HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=8080
ENV MCP_HTTP_HOST=0.0.0.0
ENV AUTH_MODE=env

# Define volume for logs
VOLUME ["/app/logs"]

# Start the application
CMD ["node", "dist/http.js"]

# Build arguments for runtime
ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"

# Labels for metadata
LABEL io.modelcontextprotocol.server.name="io.github.WYRE-AI/huntress-mcp"
LABEL maintainer="engineering@wyre.ai"
LABEL version="${VERSION}"
LABEL description="Huntress MCP Server - Model Context Protocol server for Huntress cybersecurity platform"
LABEL org.opencontainers.image.title="huntress-mcp"
LABEL org.opencontainers.image.description="Model Context Protocol server for Huntress cybersecurity platform integration"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${COMMIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/WYRE-AI/huntress-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/WYRE-AI/huntress-mcp/blob/main/README.md"
LABEL org.opencontainers.image.url="https://github.com/WYRE-AI/huntress-mcp/pkgs/container/huntress-mcp"
LABEL org.opencontainers.image.vendor="Wyre Technology"
LABEL org.opencontainers.image.licenses="Apache-2.0"
