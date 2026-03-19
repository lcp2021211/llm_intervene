import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import apiRouter from "./routes/api.js";

export const createApp = () => {
  const app = express();
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const webDistDir = process.env.WEB_DIST_DIR
    ? path.resolve(process.env.WEB_DIST_DIR)
    : path.resolve(currentDir, "../../web/dist");

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", apiRouter);

  if (existsSync(webDistDir)) {
    app.use(express.static(webDistDir));
    app.get(/^(?!\/api).*/u, (_request, response) => {
      response.sendFile(path.join(webDistDir, "index.html"));
    });
  }

  return app;
};
