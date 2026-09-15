FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application files
COPY src/ ./src/
COPY public/ ./public/
COPY data/ ./data/

# Environment defaults
ENV NODE_ENV=production
ENV PORT=5000

# Declare persistent volume for server registrations and dynamic services
VOLUME ["/app/data"]

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/health || exit 1

CMD ["node", "src/app.js"]
