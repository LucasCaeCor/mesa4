#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();

function target(relative) {
  return resolve(root, relative);
}

function read(relative) {
  const file = target(relative);
  if (!existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${relative}`);
  }
  return readFileSync(file, "utf8");
}

function write(relative, content) {
  const file = target(relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
  console.log(`✓ ${relative}`);
}

function replaceOnce(relative, search, replacement, marker) {
  const current = read(relative);

  if (marker && current.includes(marker)) {
    console.log(`↷ ${relative} já atualizado`);
    return;
  }

  if (!current.includes(search)) {
    throw new Error(
      `Não encontrei o trecho esperado em ${relative}.\n` +
      `Não continue às cegas: envie esse arquivo para revisão.`,
    );
  }

  write(relative, current.replace(search, replacement));
}

function replaceRegex(relative, regex, replacement, marker) {
  const current = read(relative);

  if (marker && current.includes(marker)) {
    console.log(`↷ ${relative} já atualizado`);
    return;
  }

  if (!regex.test(current)) {
    throw new Error(
      `Não encontrei o padrão esperado em ${relative}.\n` +
      `Não continue às cegas: envie esse arquivo para revisão.`,
    );
  }

  write(relative, current.replace(regex, replacement));
}

function appendOnce(relative, marker, block) {
  const current = read(relative);

  if (current.includes(marker)) {
    console.log(`↷ ${relative} já atualizado`);
    return;
  }

  write(relative, `${current.trimEnd()}\n\n${block.trim()}\n`);
}

// -----------------------------------------------------------------------------
// 1. Prisma
// -----------------------------------------------------------------------------

replaceOnce(
  "backend/prisma/schema.prisma",
  `  whatsappConfirmation Boolean  @default(true)
  createdAt`,
  `  whatsappConfirmation       Boolean  @default(true)
  whatsappNotificationsEnabled Boolean? @default(false)
  createdAt`,
  "whatsappNotificationsEnabled",
);

replaceOnce(
  "backend/prisma/schema.prisma",
  `  customerPhone         String
  customerEmail`,
  `  customerPhone         String
  whatsappOptIn        Boolean? @default(false)
  whatsappOptInAt      DateTime?
  customerEmail`,
  "whatsappOptIn",
);

replaceRegex(
  "backend/prisma/schema.prisma",
  /(  statusHistory\s+OrderStatusHistory\[\]\s*\n)(\s*@@index)/,
  `$1  whatsappNotifications WhatsAppNotification[]\n\n$2`,
  "whatsappNotifications WhatsAppNotification[]",
);

replaceOnce(
  "backend/prisma/schema.prisma",
  `model WebhookEvent {`,
  `model WhatsAppNotification {
  id                String      @id @default(auto()) @map("_id") @db.ObjectId
  orderId           String      @db.ObjectId
  order             Order       @relation(fields: [orderId], references: [id])
  orderStatus       OrderStatus
  templateName      String
  source            String      @default("AUTO")
  deliveryStatus    String      @default("SENDING")
  providerMessageId String?
  errorMessage      String?
  providerResponse  Json?
  sentAt            DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  @@index([orderId, createdAt])
  @@index([providerMessageId])
}

model WebhookEvent {`,
  "model WhatsAppNotification",
);

// -----------------------------------------------------------------------------
// 2. Variáveis de ambiente
// -----------------------------------------------------------------------------

replaceRegex(
  "backend/src/config/env.ts",
  /(MERCADO_PAGO_WEBHOOK_SECRET:[^\n]+\n)/,
  `$1  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_TEMPLATE_NAME: z.string().trim().min(1).default("pedido_status"),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().trim().min(2).default("pt_BR"),
  WHATSAPP_GRAPH_API_VERSION: z.string().regex(/^v\\d+\\.\\d+$/).default("v25.0"),
`,
  "WHATSAPP_PHONE_NUMBER_ID",
);

appendOnce(
  "backend/.env.example",
  "WHATSAPP_PHONE_NUMBER_ID=",
  `
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_TEMPLATE_NAME=pedido_status
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_GRAPH_API_VERSION=v25.0
`,
);

replaceOnce(
  "render.yaml",
  `      - key: MERCADO_PAGO_WEBHOOK_SECRET
        sync: false`,
  `      - key: MERCADO_PAGO_WEBHOOK_SECRET
        sync: false

      - key: WHATSAPP_PHONE_NUMBER_ID
        sync: false

      - key: WHATSAPP_ACCESS_TOKEN
        sync: false

      - key: WHATSAPP_TEMPLATE_NAME
        value: pedido_status

      - key: WHATSAPP_TEMPLATE_LANGUAGE
        value: pt_BR

      - key: WHATSAPP_GRAPH_API_VERSION
        value: v25.0`,
  "WHATSAPP_PHONE_NUMBER_ID",
);

// -----------------------------------------------------------------------------
// 3. Serviço da WhatsApp Cloud API
// -----------------------------------------------------------------------------

write(
  "backend/src/modules/whatsapp/whatsapp-cloud.service.ts",
  `import type { OrderStatus, Prisma } from "@prisma/client";
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
  const digits = phone.replace(/\\D/g, "");

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return \`55\${digits}\`;
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
      \`https://graph.facebook.com/\${env.WHATSAPP_GRAPH_API_VERSION}/\${env.WHATSAPP_PHONE_NUMBER_ID}/messages\`,
      {
        method: "POST",
        headers: {
          Authorization: \`Bearer \${env.WHATSAPP_ACCESS_TOKEN}\`,
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
        \`WhatsApp Cloud API respondeu com status \${response.status}\`;

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
          \`Não foi possível enviar o WhatsApp: \${message}\`,
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
`,
);

// -----------------------------------------------------------------------------
// 4. Pedido e consentimento
// -----------------------------------------------------------------------------

replaceOnce(
  "backend/src/modules/orders/order.schemas.ts",
  `  customerPhone: z.string().trim().min(10).max(20),
  customerEmail`,
  `  customerPhone: z.string().trim().min(10).max(20),
  whatsappOptIn: z.boolean().default(false),
  customerEmail`,
  "whatsappOptIn:",
);

replaceOnce(
  "backend/src/modules/orders/order.service.ts",
  `import { createPixPayment } from "../payments/mercado-pago.service.js";`,
  `import { createPixPayment } from "../payments/mercado-pago.service.js";
import { sendOrderStatusWhatsApp } from "../whatsapp/whatsapp-cloud.service.js";`,
  "sendOrderStatusWhatsApp",
);

replaceOnce(
  "backend/src/modules/orders/order.service.ts",
  `      customerPhone: input.customerPhone.replace(/\\D/g, ""),
      customerEmail`,
  `      customerPhone: input.customerPhone.replace(/\\D/g, ""),
      whatsappOptIn: input.whatsappOptIn,
      whatsappOptInAt: input.whatsappOptIn ? new Date() : undefined,
      customerEmail`,
  "whatsappOptInAt:",
);

replaceRegex(
  "backend/src/modules/orders/order.service.ts",
  /(if \(paymentStatus === "APPROVED"\) \{\s+await prisma\.order\.update\(\{[\s\S]*?\}\);\s+)(\})/,
  `$1      await sendOrderStatusWhatsApp(order.id, {
        source: "AUTO",
      }).catch((error) => {
        console.error("WhatsApp automatic notification failed", {
          orderId: order.id,
          error,
        });
      });
    $2`,
  'source: "AUTO"',
);

// -----------------------------------------------------------------------------
// 5. Configurações e rotas administrativas
// -----------------------------------------------------------------------------

replaceOnce(
  "backend/src/routes/admin.routes.ts",
  `import { slugify } from "../lib/slug.js";`,
  `import { slugify } from "../lib/slug.js";
import { sendOrderStatusWhatsApp } from "../modules/whatsapp/whatsapp-cloud.service.js";`,
  "sendOrderStatusWhatsApp",
);

replaceOnce(
  "backend/src/routes/admin.routes.ts",
  `  whatsappConfirmation: z.boolean(),
});`,
  `  whatsappConfirmation: z.boolean(),
  whatsappNotificationsEnabled: z.boolean().default(false),
});`,
  "whatsappNotificationsEnabled:",
);

replaceRegex(
  "backend/src/routes/admin.routes.ts",
  /include:\s*\{\s*items:\s*\{\s*include:\s*\{\s*options:\s*true\s*\}\s*\},\s*payments:\s*\{\s*orderBy:\s*\{\s*createdAt:\s*"desc"\s*\},\s*take:\s*1\s*\}\s*\}/,
  `include: {
        items: { include: { options: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        whatsappNotifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      }`,
  "whatsappNotifications: {",
);

replaceOnce(
  "backend/src/routes/admin.routes.ts",
  `    await audit(request, "UPDATE_STATUS", "ORDER", id, input);
    return order;
  });`,
  `    await audit(request, "UPDATE_STATUS", "ORDER", id, input);

    const whatsapp = await sendOrderStatusWhatsApp(order.id, {
      source: "AUTO",
    }).catch((error) => {
      request.log.error(
        { err: error, orderId: order.id },
        "WhatsApp automatic notification failed",
      );

      return { sent: false };
    });

    return {
      ...order,
      whatsapp,
    };
  });

  app.post(
    "/admin/orders/:id/whatsapp",
    { preHandler: app.authenticateAdmin },
    async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);

      const result = await sendOrderStatusWhatsApp(id, {
        source: "MANUAL",
        force: true,
        throwOnError: true,
      });

      await audit(
        request,
        "SEND_WHATSAPP",
        "ORDER",
        id,
        result,
      );

      return result;
    },
  );`,
  '"/admin/orders/:id/whatsapp"',
);

// -----------------------------------------------------------------------------
// 6. Pagamento aprovado pelo webhook
// -----------------------------------------------------------------------------

replaceOnce(
  "backend/src/routes/webhook.routes.ts",
  `import { getMercadoPagoPayment, validateMercadoPagoSignature } from "../modules/payments/mercado-pago.service.js";`,
  `import { getMercadoPagoPayment, validateMercadoPagoSignature } from "../modules/payments/mercado-pago.service.js";
import { sendOrderStatusWhatsApp } from "../modules/whatsapp/whatsapp-cloud.service.js";`,
  "sendOrderStatusWhatsApp",
);

replaceRegex(
  "backend/src/routes/webhook.routes.ts",
  /(if \(status === "APPROVED" && localPayment\.order\.status === "PENDING_PAYMENT"\) \{\s+await prisma\.order\.update\(\{[\s\S]*?\}\);\s+)(\})/,
  `$1      await sendOrderStatusWhatsApp(localPayment.orderId, {
        source: "AUTO",
      }).catch((error) => {
        request.log.error(
          { err: error, orderId: localPayment.orderId },
          "WhatsApp automatic notification failed",
        );
      });
    $2`,
  'sendOrderStatusWhatsApp(localPayment.orderId',
);

// -----------------------------------------------------------------------------
// 7. Frontend: tipos, checkout e configurações
// -----------------------------------------------------------------------------

replaceOnce(
  "frontend/src/types.ts",
  `whatsappConfirmation: boolean };`,
  `whatsappConfirmation: boolean; whatsappNotificationsEnabled?: boolean | null };`,
  "whatsappNotificationsEnabled",
);

replaceOnce(
  "frontend/src/pages/CheckoutPage.tsx",
  `      customerPhone: form.get("phone"),
      customerEmail`,
  `      customerPhone: form.get("phone"),
      whatsappOptIn: form.get("whatsappOptIn") === "on",
      customerEmail`,
  "whatsappOptIn:",
);

replaceRegex(
  "frontend/src/pages/CheckoutPage.tsx",
  /(\s*<\/div>\s*\n)(\s*\{fulfillment === "DELIVERY" && \()/,
  `$1
          <label className="whatsapp-opt-in">
            <input
              name="whatsappOptIn"
              type="checkbox"
            />
            <span>
              <strong>Receber atualizações pelo WhatsApp</strong>
              <small>
                A Mesa IV Burgers poderá avisar sobre pagamento,
                preparo, saída para entrega e conclusão deste pedido.
              </small>
            </span>
          </label>

$2`,
  "whatsapp-opt-in",
);

replaceOnce(
  "frontend/src/pages/AdminSettingsPage.tsx",
  `      whatsappConfirmation: true,`,
  `      whatsappConfirmation: true,
      whatsappNotificationsEnabled:
        form.get("whatsappNotificationsEnabled") === "on",`,
  "whatsappNotificationsEnabled:",
);

replaceRegex(
  "frontend/src/pages/AdminSettingsPage.tsx",
  /(<label>\s*<input\s+name="pixEnabled"[\s\S]*?PIX habilitado\s*<\/label>)/,
  `$1
            <label>
              <input
                name="whatsappNotificationsEnabled"
                type="checkbox"
                defaultChecked={s.whatsappNotificationsEnabled ?? false}
              />{" "}
              Notificações automáticas pelo WhatsApp
            </label>`,
  'name="whatsappNotificationsEnabled"',
);

// -----------------------------------------------------------------------------
// 8. Painel administrativo com reenvio manual
// -----------------------------------------------------------------------------

write(
  "frontend/src/pages/AdminDashboardPage.tsx",
  `import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { MessageCircle, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../lib/api";
import { formatMoney } from "../lib/format";
import { AdminNav } from "../components/AdminNav";
import type { OrderStatus } from "../types";

type WhatsAppNotification = {
  id: string;
  orderStatus: OrderStatus;
  deliveryStatus: string;
  errorMessage?: string;
  createdAt: string;
};

type AdminOrder = {
  id: string;
  publicId: string;
  customerName: string;
  customerPhone: string;
  whatsappOptIn?: boolean | null;
  fulfillment: string;
  totalCents: number;
  status: OrderStatus;
  createdAt: string;
  deliveryZoneName?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  whatsappNotifications?: WhatsAppNotification[];
  items: Array<{
    id: string;
    quantity: number;
    productName: string;
    options: Array<{
      id: string;
      optionName: string;
    }>;
  }>;
};

type Dashboard = {
  openOrders: number;
  paidToday: number;
  revenueTodayCents: number;
};

const flow: OrderStatus[] = [
  "PAID",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELED",
];

const labels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Aguardando PIX",
  PAID: "Pago",
  CONFIRMED: "Confirmado",
  PREPARING: "Preparando",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};

const notificationLabels: Record<string, string> = {
  SENDING: "Enviando",
  ACCEPTED: "Aceita pela Meta",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  READ: "Lida",
  FAILED: "Falhou",
};

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const orders = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => adminApi<AdminOrder[]>("/admin/orders"),
    refetchInterval: 10000,
    retry: false,
  });

  const dashboard = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => adminApi<Dashboard>("/admin/dashboard"),
    refetchInterval: 15000,
    retry: false,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: OrderStatus;
    }) =>
      adminApi(\`/admin/orders/\${id}/status\`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["admin-orders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin-dashboard"],
      });
    },
  });

  const notify = useMutation({
    mutationFn: (id: string) =>
      adminApi(\`/admin/orders/\${id}/whatsapp\`, {
        method: "POST",
      }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["admin-orders"],
      });
    },
  });

  if (
    orders.error &&
    (orders.error as { status?: number }).status === 401
  ) {
    sessionStorage.removeItem("mesa4.admin.token");
    navigate("/admin/login");
    return null;
  }

  return (
    <main className="admin-page">
      <AdminNav />

      <header className="admin-header">
        <div>
          <small>Painel de pedidos</small>
          <h1>Mesa IV Burgers</h1>
        </div>

        <div>
          <button
            className="secondary"
            onClick={() => queryClient.invalidateQueries()}
          >
            <RefreshCw />
            Atualizar
          </button>
        </div>
      </header>

      <section className="stats">
        <article>
          <span>Pedidos abertos</span>
          <strong>{dashboard.data?.openOrders ?? 0}</strong>
        </article>

        <article>
          <span>Pagos hoje</span>
          <strong>{dashboard.data?.paidToday ?? 0}</strong>
        </article>

        <article>
          <span>Faturamento hoje</span>
          <strong>
            {formatMoney(
              dashboard.data?.revenueTodayCents ?? 0,
            )}
          </strong>
        </article>
      </section>

      <section className="admin-orders">
        <div className="section-title">
          <h2>Pedidos recentes</h2>
          <span>Atualização automática</span>
        </div>

        {orders.data?.map((order) => {
          const lastNotification =
            order.whatsappNotifications?.[0];

          return (
            <article
              className="admin-order"
              key={order.id}
            >
              <div className="admin-order-head">
                <div>
                  <span
                    className={\`status-chip \${order.status.toLowerCase()}\`}
                  >
                    {labels[order.status]}
                  </span>

                  <h3>{order.publicId}</h3>
                  <p>
                    {order.customerName} ·{" "}
                    {order.customerPhone}
                  </p>

                  <div className="whatsapp-admin-status">
                    <span
                      className={
                        order.whatsappOptIn
                          ? "whatsapp-opted-in"
                          : "whatsapp-opted-out"
                      }
                    >
                      <MessageCircle size={15} />
                      {order.whatsappOptIn
                        ? "WhatsApp autorizado"
                        : "Sem autorização"}
                    </span>

                    {lastNotification && (
                      <small
                        title={
                          lastNotification.errorMessage ?? ""
                        }
                      >
                        Último envio:{" "}
                        {notificationLabels[
                          lastNotification.deliveryStatus
                        ] ??
                          lastNotification.deliveryStatus}
                      </small>
                    )}
                  </div>
                </div>

                <div>
                  <strong>
                    {formatMoney(order.totalCents)}
                  </strong>
                  <small>
                    {new Date(
                      order.createdAt,
                    ).toLocaleString("pt-BR")}
                  </small>
                </div>
              </div>

              <div className="admin-order-body">
                <div>
                  {order.items.map((item) => (
                    <p key={item.id}>
                      <b>{item.quantity}x</b>{" "}
                      {item.productName}
                      <small>
                        {item.options
                          .map(
                            (option) =>
                              option.optionName,
                          )
                          .join(", ")}
                      </small>
                    </p>
                  ))}
                </div>

                <div>
                  <b>
                    {order.fulfillment === "DELIVERY"
                      ? "Entrega"
                      : "Retirada"}
                  </b>

                  {order.fulfillment === "DELIVERY" && (
                    <p>
                      {order.street}, {order.number} —{" "}
                      {order.neighborhood}
                    </p>
                  )}
                </div>
              </div>

              <div className="status-actions">
                {flow.map((status) => (
                  <button
                    key={status}
                    disabled={
                      update.isPending ||
                      order.status === status
                    }
                    onClick={() =>
                      update.mutate({
                        id: order.id,
                        status,
                      })
                    }
                  >
                    {labels[status]}
                  </button>
                ))}
              </div>

              <div className="whatsapp-admin-actions">
                <button
                  className="secondary"
                  type="button"
                  disabled={
                    !order.whatsappOptIn ||
                    notify.isPending
                  }
                  onClick={() =>
                    notify.mutate(order.id)
                  }
                >
                  <MessageCircle />
                  {notify.isPending
                    ? "Enviando..."
                    : "Reenviar status no WhatsApp"}
                </button>
              </div>

              {notify.error && (
                <p className="error-text">
                  {notify.error.message}
                </p>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
`,
);

// -----------------------------------------------------------------------------
// 9. CSS
// -----------------------------------------------------------------------------

appendOnce(
  "frontend/src/styles.css",
  ".whatsapp-opt-in {",
  `
.whatsapp-opt-in {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  margin: 0.5rem 0 1.25rem;
  padding: 1rem;
  border: 1px solid rgba(37, 211, 102, 0.28);
  border-radius: 14px;
  background: rgba(37, 211, 102, 0.08);
  cursor: pointer;
}

.whatsapp-opt-in input {
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
  accent-color: #25d366;
}

.whatsapp-opt-in span {
  display: grid;
  gap: 0.25rem;
}

.whatsapp-opt-in strong {
  color: #f7f7f7;
}

.whatsapp-opt-in small {
  color: var(--muted);
  line-height: 1.45;
}

.whatsapp-admin-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.6rem;
}

.whatsapp-admin-status > span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}

.whatsapp-opted-in {
  color: #70f2a0;
  background: rgba(37, 211, 102, 0.12);
  border: 1px solid rgba(37, 211, 102, 0.25);
}

.whatsapp-opted-out {
  color: var(--muted);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.whatsapp-admin-status small {
  color: var(--muted);
}

.whatsapp-admin-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.9rem;
}

.whatsapp-admin-actions .secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

@media (max-width: 640px) {
  .whatsapp-admin-actions {
    justify-content: stretch;
  }

  .whatsapp-admin-actions .secondary {
    width: 100%;
    justify-content: center;
  }
}
`,
);

console.log(`
Atualização aplicada.

Agora execute:

  cd backend
  npm run prisma:generate
  npm run prisma:push
  npm run build

  cd ../frontend
  npm run build

Depois configure as variáveis da Meta no Render e habilite
"Notificações automáticas pelo WhatsApp" no painel da loja.
`);
