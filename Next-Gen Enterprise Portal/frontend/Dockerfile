FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY scripts/start-nginx-with-watch.sh /usr/local/bin/start-nginx-with-watch.sh
RUN chmod +x /usr/local/bin/start-nginx-with-watch.sh
EXPOSE 80 443 443/udp
CMD ["/bin/sh", "/usr/local/bin/start-nginx-with-watch.sh"]
