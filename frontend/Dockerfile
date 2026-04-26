FROM node:25.6.1-alpine3.22 AS deps

WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml .yarn ./

RUN npm uninstall -g yarn pnpm
RUN npm install --force -g corepack@latest
RUN corepack enable

RUN yarn install

FROM deps AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VITE_APP_BASE
ARG VITE_API_BASE
ENV VITE_APP_BASE=${VITE_APP_BASE}
ENV VITE_API_BASE=${VITE_API_BASE}

RUN yarn build

FROM nginx:1.29-alpine AS server

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]