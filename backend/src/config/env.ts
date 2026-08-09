import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  FRONTEND_URLS: z.string().default("http://localhost:5173"),
  API_PUBLIC_URL: z.string().url(),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional().default(""),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_TEMPLATE_NAME: z.string().trim().min(1).default("pedido_status"),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().trim().min(2).default("pt_BR"),
  WHATSAPP_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v25.0"),
  OPENROUTESERVICE_API_KEY: z.string().optional().default(""),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  PIX_TOTP_ENCRYPTION_KEY: z.string().min(1).refine(
    (value) => {
      try {
        return Buffer.from(value, "base64").length === 32;
      } catch {
        return false;
      }
    },
    {
      message:
        "PIX_TOTP_ENCRYPTION_KEY deve possuir 32 bytes em Base64",
    },
  ),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = {
  ...parsed.data,
  frontendUrls: parsed.data.FRONTEND_URLS.split(",").map((url) => url.trim()).filter(Boolean),
};
