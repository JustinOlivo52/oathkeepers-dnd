# One container runs everything: the game server, the AI DM, and the built game pages.
FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm ci && npm run build
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
EXPOSE 8080
CMD ["node", "--import", "tsx", "packages/server/src/index.ts"]
