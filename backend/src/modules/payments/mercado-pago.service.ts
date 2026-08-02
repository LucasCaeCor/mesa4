import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { centsToNumber } from "../../lib/money.js";
import { HttpError } from "../../lib/http-error.js";

type CreatePixInput = {
  amountCents: number;
  description: string;
  email: string;
  firstName: string;
  externalReference: string;
  idempotencyKey: string;
};

type MercadoPagoPayment = {
  id: number;
  status: string;
  status_detail?: string;
  date_of_expiration?: string;
  external_reference?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

async function mercadoPagoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new HttpError(
      503,
      "O Mercado Pago não está configurado",
      "MERCADO_PAGO_NOT_CONFIGURED",
    );
  }
console.error("Mercado Pago error", response.status, data);
    throw new HttpError(502, "Não foi possível gerar o PIX agora", "PAYMENT_PROVIDER_ERROR");
  }
  return data as T;
}

export async function createPixPayment(input: CreatePixInput) {
  return mercadoPagoRequest<MercadoPagoPayment>("/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      transaction_amount: centsToNumber(input.amountCents),
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.externalReference,
      notification_url: `${env.API_PUBLIC_URL}/webhooks/mercadopago?type=payment`,
      payer: {
        email: input.email,
        first_name: input.firstName,
      },
    }),
  });
}

export async function getMercadoPagoPayment(id: string) {
  return mercadoPagoRequest<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(id)}`, { method: "GET" });
}

export function validateMercadoPagoSignature(input: {
  xSignature?: string;
  xRequestId?: string;
  dataId?: string;
}) {
  if (!env.MERCADO_PAGO_WEBHOOK_SECRET) {
    if (env.NODE_ENV === "production") return false;
    return true;
  }

  const xSignature = input.xSignature ?? "";
  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  const ts = parts.ts;
  const receivedHash = parts.v1;
  if (!ts || !receivedHash) return false;

  const manifestParts: string[] = [];
  if (input.dataId) manifestParts.push(`id:${input.dataId.toLowerCase()}`);
  if (input.xRequestId) manifestParts.push(`request-id:${input.xRequestId}`);
  manifestParts.push(`ts:${ts}`);
  const manifest = `${manifestParts.join(";")};`;

  const computed = createHmac("sha256", env.MERCADO_PAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");

  const computedBuffer = Buffer.from(computed);
  const receivedBuffer = Buffer.from(receivedHash);
  return computedBuffer.length === receivedBuffer.length && timingSafeEqual(computedBuffer, receivedBuffer);
}
