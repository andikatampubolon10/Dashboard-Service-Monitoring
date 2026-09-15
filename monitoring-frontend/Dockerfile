# Stage 1: Build static assets
FROM node:20-alpine AS builder

WORKDIR /app

# Allow passing API URL during build (empty string uses relative reverse proxy)
ARG VITE_MONITORING_API_URL=""
ENV VITE_MONITORING_API_URL=$VITE_MONITORING_API_URL

# Copy dependency files and install
COPY package*.json ./
RUN npm ci

# Copy source files and build
COPY . ./
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
