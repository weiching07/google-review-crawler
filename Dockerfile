FROM ghcr.io/puppeteer/puppeteer:latest

USER root

WORKDIR /app

RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN mkdir -p /data && chown -R pptruser:pptruser /app /data

USER pptruser

ENV NODE_ENV=production
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["npm", "start"]