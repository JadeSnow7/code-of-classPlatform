FROM node:18-alpine AS build

WORKDIR /workspace

# Install workspace dependencies (monorepo-root context is required)
COPY package.json package-lock.json ./
COPY frontend-react/package.json frontend-react/package.json
COPY shared/package.json shared/package.json
COPY mobile/package.json mobile/package.json

RUN npm ci --workspaces

# Copy sources needed for building the web app
COPY shared shared
COPY frontend-react frontend-react

RUN npm -w shared run build && npm -w frontend-react run build

FROM nginx:alpine AS runtime

COPY --from=build /workspace/frontend-react/dist /usr/share/nginx/html

EXPOSE 80
