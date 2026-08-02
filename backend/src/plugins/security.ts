import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export async function registerSecurity(app: FastifyInstance) {
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
  origin(origin, callback) {
    const allowedOrigins = env.frontendUrls.map((url) =>
      url.replace(/\/$/, ""),
    );

    const normalizedOrigin = origin?.replace(/\/$/, "");

    if (!origin || allowedOrigins.includes(normalizedOrigin ?? "")) {
      return callback(null, true);
    }

    app.log.warn(
      {
        origin,
        allowedOrigins,
      },
      "CORS origin blocked",
    );

    return callback(null, false);
  },

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Idempotency-Key",
  ],
});
  await app.register(rateLimit, {
    max: 150,
    timeWindow: "1 minute",
    ban: 5,
  });
}
