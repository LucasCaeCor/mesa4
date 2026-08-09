import "@fastify/jwt";
import "fastify";

interface AdminJwtPayload {
  sub: string;
  email: string;
  name: string;
  role: "ADMIN";
}

interface StepUpJwtPayload {
  sub: string;
  scope:
    | "CATALOG_SENSITIVE_WRITE"
    | "ADMIN_SENSITIVE_WRITE";
  kind: "STEP_UP";
}

type JwtPayload =
  | AdminJwtPayload
  | StepUpJwtPayload;

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: AdminJwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticateAdmin: import("fastify").preHandlerHookHandler;
  }
}