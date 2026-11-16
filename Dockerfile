FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:stable-alpine
LABEL org.opencontainers.image.source="https://github.com/SKBlacksmith/sam" \
      org.opencontainers.image.description="SAM - Addons Manager for Stremio: order, logos and Home visibility" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/conf.d/security-headers.conf
EXPOSE 80
