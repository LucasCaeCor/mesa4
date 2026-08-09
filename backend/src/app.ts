import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { registerSecurity } from "./plugins/security.js";
import { registerAuth } from "./plugins/auth.js";
import { publicRoutes } from "./routes/public.routes.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { pixSecurityRoutes } from "./routes/pix-security.routes.js";
import { catalogSecurityRoutes } from "./routes/catalog-security.routes.js";
import { webhookRoutes } from "./routes/webhook.routes.js";
import { HttpError } from "./lib/http-error.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      redact: [
        "req.headers.x-admin-authorization",
"req.headers.x-catalog-authorization",
        "req.headers.authorization",
        "req.headers.x-pix-authorization",
        "req.headers.x-admin-authorization",
        "req.headers.x-catalog-authorization",
        "req.headers.x-catalog-authorization",
        "body.password",
        "body.code",
        "body.customerDocument",
      ],
    },
    trustProxy: true,
    bodyLimit: 6 * 1024 * 1024,
  });

  await registerSecurity(app);
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 5 * 1024 * 1024,
    },
  });
  await registerAuth(app);

  app.get("/health", async () => ({ ok: true, timestamp: new Date().toISOString() }));
  await app.register(publicRoutes);
  await app.register(adminRoutes);
  await app.register(pixSecurityRoutes);
  await app.register(catalogSecurityRoutes);
  await app.register(webhookRoutes);

  app.setNotFoundHandler((request, reply) => reply.code(404).send({ message: "Rota não encontrada", path: request.url }));
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(422).send({ message: "Dados inválidos", issues: error.issues });
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ message: error.message, code: error.code });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reply.code(409).send({ message: "Já existe um registro com estes dados", code: "DUPLICATE" });
    }
    request.log.error(error);
    return reply.code(500).send({ message: "Erro interno do servidor", code: "INTERNAL_ERROR" });
  });

  return app;
}
