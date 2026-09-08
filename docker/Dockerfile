# Stage 1: Build static assets
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files and install
COPY monitoring-frontend/package*.json ./
RUN npm ci

# Copy source files and build
COPY monitoring-frontend ./
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
