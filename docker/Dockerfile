FROM nginx:1.27-alpine

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
	CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1
