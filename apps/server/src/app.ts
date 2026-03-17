import cors from "cors";
import express from "express";
import apiRouter from "./routes/api.js";

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", apiRouter);

  return app;
};
