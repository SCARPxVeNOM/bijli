import { defineRailway, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const bijliServer = service("bijli-server", {
    replicas: { "sfo": 1 },
    build: "npm install && npm run build:server",
    start: "npm run start -w @bijli/server",
    env: { GEMINI_API_KEY: preserve() },
  });
  const bijliWeb = service("bijli-web", {
    replicas: { "sfo": 1 },
    build: "npm install && npm run build:web",
    start: "npm run start -w @bijli/web",
  });

  return project("bijlisaathi", {
    resources: [bijliServer, bijliWeb],
  });
});
