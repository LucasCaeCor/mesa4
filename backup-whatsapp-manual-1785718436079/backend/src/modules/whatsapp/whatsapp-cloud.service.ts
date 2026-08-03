import type { OrderStatus, Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Aguardando pagamento",
  PAID: "Pagamento confirmado ✅",
  CONFIRMED: "Pedido confirmado",
  PREPARING: "Pedido em preparo 🍔",
  READY: "Pedido pronto",
  OUT_FOR_DELIVERY: "Saiu para entrega 🛵",
  DELIVERED: "Pedido entregue. Bom apetite!",
  CANCELED: "Pedido cancelado",
};

type NotificationSource = "AUTO" | "MANUAL";

type SendOptions = {
  source?: NotificationSource;
  force?: boolean;
  throwOnError?: boolean;
};

type MetaMessageResponse = {
  messaging_product?: string;
  contacts?: Array<{
    input?: string;
    wa_id?: string;
  }>;
  messages?: Array<{
    id?: string;
    message_status?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

export type WhatsAppSendResult = {
  sent: boolean;
  skipped?: boolean;
  reason?:
    | "NOT_CONFIGURED"
    | "DISABLED"
    | "NO_OPT_IN"
    | "DUPLICATE";
  notificationId?: string;
  providerMessageId?: string;
};

function isConfigured() {
  return Boolean(
    env.WHATSAPP_PHONE_NUMBER_ID &&
      env.WHATSAPP_ACCESS_TOKEN,
  );
}

function normalizeBrazilianPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  throw new HttpError(
    422,
    "O WhatsApp do cliente está em um formato inválido",
    "INVALID_WHATSAPP_NUMBER",
  );
}

function configurationError(options: SendOptions): WhatsAppSendResult {
  if (options.throwOnError) {
    throw new HttpError(
      503,
      "A integração com WhatsApp ainda não foi configurada",
      "WHATSAPP_NOT_CONFIGURED",
    );
  }

  return {
    sent: false,
    skipped: true,
    reason: "NOT_CONFIGURED",
  };
}

export async function sendOrderStatusWhatsApp(
  orderId: string,
  options: SendOptions = {},
): Promise<WhatsAppSendResult> {
  const source = options.source ?? "AUTO";

  const [order, settings] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
    }),
    prisma.storeSettings.findUnique({
      where: { singletonKey: "default" },
    }),
  ]);

  if (!order) {
    throw new HttpError(
      404,
      "Pedido não encontrado",
      "ORDER_NOT_FOUND",
    );
  }

  if (settings?.whatsappNotificationsEnabled !== true) {
    if (options.throwOnError) {
      throw new HttpError(
        409,
        "Ative as notificações automáticas nas configurações da loja",
        "WHATSAPP_NOTIFICATIONS_DISABLED",
      );
    }

    return {
      sent: false,
      skipped: true,
      reason: "DISABLED",
    };
  }

  if (order.whatsappOptIn !== true) {
    if (options.throwOnError) {
      throw new HttpError(
        409,
        "O cliente não autorizou atualizações pelo WhatsApp",
        "WHATSAPP_OPT_IN_REQUIRED",
      );
    }

    return {
      sent: false,
      skipped: true,
      reason: "NO_OPT_IN",
    };
  }

  if (!isConfigured()) {
    return configurationError(options);
  }

  if (!options.force) {
    const previous = await prisma.whatsAppNotification.findFirst({
      where: {
        orderId,
        orderStatus: order.status,
        source: "AUTO",
        deliveryStatus: {
          in: ["ACCEPTED", "SENT", "DELIVERED", "READ"],
        },
      },
    });

    if (previous) {
      return {
        sent: false,
        skipped: true,
        reason: "DUPLICATE",
        notificationId: previous.id,
        providerMessageId: previous.providerMessageId ?? undefined,
      };
    }
  }

  const notification = await prisma.whatsAppNotification.create({
    data: {
      orderId,
      orderStatus: order.status,
      templateName: env.WHATSAPP_TEMPLATE_NAME,
      source,
      deliveryStatus: "SENDING",
    },
  });

  try {
    const phone = normalizeBrazilianPhone(order.customerPhone);

    const response = await fetch(
      `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type: "template",
          template: {
            name: env.WHATSAPP_TEMPLATE_NAME,
            language: {
              code: env.WHATSAPP_TEMPLATE_LANGUAGE,
            },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: order.customerName,
                  },
                  {
                    type: "text",
                    text: order.publicId,
                  },
                  {
                    type: "text",
                    text: STATUS_LABELS[order.status],
                  },
                ],
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );

    const data = (await response.json().catch(() => ({}))) as MetaMessageResponse;

    if (!response.ok) {
      const message =
        data.error?.message ??
        `WhatsApp Cloud API respondeu com status ${response.status}`;

      await prisma.whatsAppNotification.update({
        where: { id: notification.id },
        data: {
          deliveryStatus: "FAILED",
          errorMessage: message.slice(0, 1000),
          providerResponse: data as unknown as Prisma.InputJsonValue,
        },
      });

      if (options.throwOnError) {
        throw new HttpError(
          502,
          `Não foi possível enviar o WhatsApp: ${message}`,
          "WHATSAPP_PROVIDER_ERROR",
        );
      }

      return {
        sent: false,
        notificationId: notification.id,
      };
    }

    const providerMessageId = data.messages?.[0]?.id;

    await prisma.whatsAppNotification.update({
      where: { id: notification.id },
      data: {
        deliveryStatus: "ACCEPTED",
        providerMessageId,
        providerResponse: data as unknown as Prisma.InputJsonValue,
        sentAt: new Date(),
      },
    });

    return {
      sent: true,
      notificationId: notification.id,
      providerMessageId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro desconhecido ao enviar WhatsApp";

    await prisma.whatsAppNotification
      .update({
        where: { id: notification.id },
        data: {
          deliveryStatus: "FAILED",
          errorMessage: message.slice(0, 1000),
        },
      })
      .catch(() => undefined);

    if (options.throwOnError) {
      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(
        502,
        "Não foi possível enviar a atualização pelo WhatsApp",
        "WHATSAPP_PROVIDER_ERROR",
      );
    }

    return {
      sent: false,
      notificationId: notification.id,
    };
  }
}
