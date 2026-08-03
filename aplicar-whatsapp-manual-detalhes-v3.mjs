#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  resolve,
} from "node:path";

const root = process.cwd();
const staged = new Map();

function absolute(relative) {
  return resolve(root, relative);
}

function read(relative) {
  if (staged.has(relative)) {
    return staged.get(relative);
  }

  const file = absolute(relative);

  if (!existsSync(file)) {
    throw new Error(
      `Arquivo não encontrado: ${relative}`,
    );
  }

  const content = readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n");

  staged.set(relative, content);
  return content;
}

function stage(relative, content) {
  staged.set(relative, content);
}

function removeImport(content, modulePath) {
  const escaped = modulePath.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  return content.replace(
    new RegExp(
      `\\n?import\\s+\\{\\s*sendOrderStatusWhatsApp\\s*\\}\\s+from\\s+"${escaped}";\\n?`,
    ),
    "\n",
  );
}

function updateAdminRoutes() {
  const relative =
    "backend/src/routes/admin.routes.ts";
  let content = read(relative);

  const ordersStart = content.indexOf(
    'app.get("/admin/orders"',
  );
  const statusStart = content.indexOf(
    "app.patch(",
    ordersStart,
  );

  if (ordersStart < 0 || statusStart < 0) {
    throw new Error(
      "Não encontrei as rotas administrativas de pedidos.",
    );
  }

  let ordersBlock = content.slice(
    ordersStart,
    statusStart,
  );

  if (!ordersBlock.includes("statusHistory:")) {
    const paymentsPattern =
      /(\n\s*payments:\s*\{\s*orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}\s*,\s*take:\s*1\s*,?\s*\})\s*,?/;

    if (!paymentsPattern.test(ordersBlock)) {
      throw new Error(
        "Não encontrei a inclusão dos pagamentos em /admin/orders.",
      );
    }

    ordersBlock = ordersBlock.replace(
      paymentsPattern,
      `$1,
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },`,
    );
  }

  content =
    content.slice(0, ordersStart) +
    ordersBlock +
    content.slice(statusStart);

  stage(relative, content);
}

function removeAutomaticCall(
  relative,
  modulePath,
  orderExpression,
) {
  let content = read(relative);

  content = removeImport(content, modulePath);

  const escapedOrderExpression =
    orderExpression.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

  const callPattern = new RegExp(
    `\\n\\s*await sendOrderStatusWhatsApp\\(\\s*${escapedOrderExpression}\\s*,\\s*\\{[\\s\\S]*?\\n\\s*\\}\\);`,
  );

  content = content.replace(callPattern, "");

  if (
    content.includes("sendOrderStatusWhatsApp")
  ) {
    throw new Error(
      `Não foi possível remover o envio automático de ${relative}.`,
    );
  }

  stage(relative, content);
}

function disableCloudApi() {
  const relative =
    "backend/src/modules/whatsapp/whatsapp-cloud.service.ts";
  let content = read(relative);

  if (
    content.includes(
      "WhatsApp Cloud API desativada: envio manual pelo painel",
    )
  ) {
    stage(relative, content);
    return;
  }

  const configuredPattern =
    /function isConfigured\(\)\s*\{[\s\S]*?\n\}/;

  if (!configuredPattern.test(content)) {
    throw new Error(
      "Não encontrei a função isConfigured no serviço do WhatsApp.",
    );
  }

  content = content.replace(
    configuredPattern,
    `function isConfigured() {
  // WhatsApp Cloud API desativada: envio manual pelo painel
  return false;
}`,
  );

  stage(relative, content);
}

function disableAutomaticSetting() {
  const relative =
    "frontend/src/pages/AdminSettingsPage.tsx";
  let content = read(relative);

  content = content.replace(
    /whatsappNotificationsEnabled:\s*form\.get\(\s*"whatsappNotificationsEnabled",?\s*\)\s*===\s*"on",/,
    "whatsappNotificationsEnabled: false,",
  );

  const inputIndex = content.indexOf(
    'name="whatsappNotificationsEnabled"',
  );

  if (inputIndex >= 0) {
    const labelStart = content.lastIndexOf(
      "<label",
      inputIndex,
    );
    const labelEnd =
      content.indexOf("</label>", inputIndex);

    if (labelStart < 0 || labelEnd < 0) {
      throw new Error(
        "Não foi possível remover a opção de notificações automáticas.",
      );
    }

    content =
      content.slice(0, labelStart) +
      content.slice(labelEnd + "</label>".length);
  }

  if (
    !content.includes(
      "whatsappNotificationsEnabled: false",
    )
  ) {
    throw new Error(
      "Não foi possível desativar o bot nas configurações.",
    );
  }

  stage(relative, content);
}

function appendCss() {
  const relative = "frontend/src/styles.css";
  const current = read(relative);
  const marker =
    "/* Painel lateral de detalhes e WhatsApp manual */";

  if (current.includes(marker)) {
    return;
  }

  stage(
    relative,
    `${current.trimEnd()}\n\n${"\n/* Painel lateral de detalhes e WhatsApp manual */\n.order-card-actions {\n  display: flex;\n  justify-content: flex-end;\n  flex-wrap: wrap;\n  gap: 0.7rem;\n  margin-top: 0.9rem;\n}\n\n.order-card-actions button,\n.order-detail-footer .primary,\n.whatsapp-prompt-actions button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 0.45rem;\n}\n\n.order-card-actions svg,\n.order-detail-footer svg,\n.whatsapp-prompt-actions svg {\n  width: 18px;\n  height: 18px;\n}\n\n.whatsapp-manual-button {\n  border-color: rgba(37, 211, 102, 0.32);\n}\n\n.whatsapp-consent-warning {\n  display: block;\n  margin-top: 0.6rem;\n  color: #d5ad62;\n  text-align: right;\n}\n\n.order-detail-overlay,\n.whatsapp-prompt-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: 120;\n  display: flex;\n  justify-content: flex-end;\n  background: rgba(0, 0, 0, 0.72);\n  backdrop-filter: blur(4px);\n}\n\n.order-detail-drawer {\n  display: flex;\n  flex-direction: column;\n  width: min(720px, 94vw);\n  height: 100%;\n  overflow: hidden;\n  border-left: 1px solid var(--border);\n  background: #0f0e0c;\n  box-shadow: -24px 0 70px rgba(0, 0, 0, 0.45);\n  animation: order-drawer-in 180ms ease-out;\n}\n\n@keyframes order-drawer-in {\n  from {\n    opacity: 0;\n    transform: translateX(28px);\n  }\n\n  to {\n    opacity: 1;\n    transform: translateX(0);\n  }\n}\n\n.order-detail-header {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 1rem;\n  padding: 1.3rem 1.4rem;\n  border-bottom: 1px solid var(--border);\n  background: #151310;\n}\n\n.order-detail-header small {\n  color: var(--muted);\n}\n\n.order-detail-header h2 {\n  margin: 0.25rem 0 0.65rem;\n}\n\n.icon-button {\n  display: grid;\n  width: 42px;\n  height: 42px;\n  flex: 0 0 auto;\n  place-items: center;\n  padding: 0;\n  border: 1px solid var(--border);\n  border-radius: 50%;\n  background: #201d18;\n  color: #fff;\n}\n\n.order-detail-content {\n  display: grid;\n  gap: 1rem;\n  flex: 1;\n  overflow-y: auto;\n  padding: 1.2rem 1.4rem 2rem;\n}\n\n.order-detail-section {\n  padding: 1.1rem;\n  border: 1px solid var(--border);\n  border-radius: 15px;\n  background: #171511;\n}\n\n.order-detail-section h3 {\n  display: flex;\n  align-items: center;\n  gap: 0.55rem;\n  margin: 0 0 1rem;\n  font-size: 1rem;\n}\n\n.order-detail-section h3 svg {\n  width: 19px;\n  height: 19px;\n  color: var(--orange);\n}\n\n.order-detail-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 0.8rem;\n}\n\n.order-detail-grid > div {\n  display: grid;\n  gap: 0.25rem;\n  min-width: 0;\n  padding: 0.75rem;\n  border-radius: 11px;\n  background: rgba(255, 255, 255, 0.035);\n}\n\n.order-detail-grid span,\n.order-values span,\n.order-general-notes span {\n  color: var(--muted);\n  font-size: 0.78rem;\n}\n\n.order-detail-grid strong {\n  overflow-wrap: anywhere;\n}\n\n.order-detail-items {\n  display: grid;\n  gap: 0.75rem;\n}\n\n.order-detail-items article {\n  padding: 0.9rem;\n  border-radius: 12px;\n  background: rgba(255, 255, 255, 0.035);\n}\n\n.order-detail-items article > div {\n  display: flex;\n  justify-content: space-between;\n  gap: 1rem;\n}\n\n.order-detail-items ul {\n  display: grid;\n  gap: 0.25rem;\n  margin: 0.65rem 0 0;\n  padding-left: 1.15rem;\n  color: var(--muted);\n  font-size: 0.86rem;\n}\n\n.order-detail-items small {\n  display: block;\n  margin-top: 0.65rem;\n  color: #e9c96f;\n}\n\n.order-general-notes {\n  margin-top: 0.85rem;\n  padding: 0.85rem;\n  border-radius: 11px;\n  background: rgba(255, 196, 61, 0.07);\n}\n\n.order-general-notes p {\n  margin: 0.25rem 0 0;\n}\n\n.order-address,\n.order-reference {\n  color: #e8e2d8;\n  line-height: 1.65;\n}\n\n.order-reference {\n  color: var(--muted);\n}\n\n.manual-payment-alert {\n  margin: 0.9rem 0 0;\n  padding: 0.8rem;\n  border: 1px solid rgba(255, 196, 61, 0.24);\n  border-radius: 10px;\n  background: rgba(255, 196, 61, 0.07);\n  color: #e9c96f;\n  line-height: 1.5;\n}\n\n.order-values {\n  display: grid;\n  gap: 0.65rem;\n  margin-top: 1rem;\n}\n\n.order-values > div {\n  display: flex;\n  justify-content: space-between;\n  gap: 1rem;\n}\n\n.order-total-row {\n  margin-top: 0.25rem;\n  padding-top: 0.75rem;\n  border-top: 1px solid var(--border);\n  font-size: 1.08rem;\n}\n\n.order-total-row strong {\n  color: var(--orange);\n}\n\n.admin-order-timeline {\n  display: grid;\n  gap: 0.85rem;\n}\n\n.admin-order-timeline > div {\n  display: grid;\n  grid-template-columns: 32px 1fr;\n  gap: 0.65rem;\n}\n\n.admin-order-timeline > div > span {\n  display: grid;\n  width: 29px;\n  height: 29px;\n  place-items: center;\n  border-radius: 50%;\n  background: rgba(255, 107, 26, 0.14);\n  color: var(--orange);\n}\n\n.admin-order-timeline svg {\n  width: 16px;\n  height: 16px;\n}\n\n.admin-order-timeline > div > div {\n  display: grid;\n  gap: 0.2rem;\n  padding-bottom: 0.8rem;\n  border-bottom: 1px solid rgba(255, 255, 255, 0.06);\n}\n\n.admin-order-timeline small {\n  color: var(--muted);\n}\n\n.admin-order-timeline p {\n  margin: 0.25rem 0 0;\n  color: #d9d1c5;\n}\n\n.order-detail-footer {\n  display: grid;\n  gap: 0.9rem;\n  padding: 1rem 1.4rem;\n  border-top: 1px solid var(--border);\n  background: #151310;\n}\n\n.order-detail-footer .status-actions {\n  max-height: 118px;\n  overflow-y: auto;\n}\n\n.order-detail-footer .primary {\n  width: 100%;\n}\n\n.whatsapp-prompt-overlay {\n  z-index: 140;\n  align-items: center;\n  justify-content: center;\n  padding: 1rem;\n}\n\n.whatsapp-prompt {\n  width: min(470px, 100%);\n  padding: 1.4rem;\n  border: 1px solid rgba(37, 211, 102, 0.25);\n  border-radius: 18px;\n  background: #171511;\n  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5);\n  text-align: center;\n}\n\n.whatsapp-prompt-icon {\n  display: grid;\n  width: 58px;\n  height: 58px;\n  margin: 0 auto 1rem;\n  place-items: center;\n  border-radius: 50%;\n  background: rgba(37, 211, 102, 0.12);\n  color: #61e893;\n}\n\n.whatsapp-prompt h2 {\n  margin: 0 0 0.8rem;\n}\n\n.whatsapp-prompt p {\n  color: var(--muted);\n  line-height: 1.55;\n}\n\n.whatsapp-prompt-actions {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 0.75rem;\n  margin-top: 1.2rem;\n}\n\n@media (max-width: 700px) {\n  .order-card-actions {\n    display: grid;\n    grid-template-columns: 1fr;\n  }\n\n  .order-card-actions button {\n    width: 100%;\n  }\n\n  .order-detail-drawer {\n    width: 100%;\n  }\n\n  .order-detail-header,\n  .order-detail-content,\n  .order-detail-footer {\n    padding-left: 1rem;\n    padding-right: 1rem;\n  }\n\n  .order-detail-grid {\n    grid-template-columns: 1fr;\n  }\n\n  .whatsapp-prompt-actions {\n    grid-template-columns: 1fr;\n  }\n}\n"}\n`,
  );
}

updateAdminRoutes();
disableCloudApi();
disableAutomaticSetting();

stage(
  "frontend/src/pages/AdminDashboardPage.tsx",
  "import {\n  useEffect,\n  useMemo,\n  useState,\n} from \"react\";\nimport {\n  useMutation,\n  useQuery,\n  useQueryClient,\n} from \"@tanstack/react-query\";\nimport {\n  Banknote,\n  CheckCircle2,\n  Clock3,\n  Eye,\n  MapPin,\n  MessageCircle,\n  PackageCheck,\n  RefreshCw,\n  UserRound,\n  X,\n} from \"lucide-react\";\nimport { useNavigate } from \"react-router-dom\";\nimport { AdminNav } from \"../components/AdminNav\";\nimport { adminApi } from \"../lib/api\";\nimport { formatMoney } from \"../lib/format\";\nimport type { OrderStatus } from \"../types\";\n\ntype AdminPayment = {\n  id: string;\n  provider: string;\n  method: string;\n  providerPaymentId?: string;\n  status: string;\n  statusDetail?: string;\n  amountCents: number;\n  reportedAt?: string;\n  createdAt: string;\n};\n\ntype OrderOption = {\n  id: string;\n  groupName?: string;\n  optionName: string;\n  unitPriceCents?: number;\n  quantity?: number;\n};\n\ntype AdminOrderItem = {\n  id: string;\n  quantity: number;\n  productName: string;\n  unitPriceCents: number;\n  lineTotalCents: number;\n  notes?: string;\n  options: OrderOption[];\n};\n\ntype StatusHistoryEntry = {\n  id: string;\n  status: OrderStatus;\n  note?: string;\n  createdAt: string;\n};\n\ntype AdminOrder = {\n  id: string;\n  publicId: string;\n  customerName: string;\n  customerPhone: string;\n  customerEmail: string;\n  customerDocument?: string;\n  whatsappOptIn?: boolean | null;\n  fulfillment: \"DELIVERY\" | \"PICKUP\";\n  deliveryZoneName?: string;\n  postalCode?: string;\n  street?: string;\n  number?: string;\n  complement?: string;\n  neighborhood?: string;\n  city?: string;\n  state?: string;\n  reference?: string;\n  notes?: string;\n  subtotalCents: number;\n  deliveryFeeCents: number;\n  deliveryDistanceMeters?: number;\n  deliveryDurationSeconds?: number;\n  discountCents: number;\n  totalCents: number;\n  status: OrderStatus;\n  paidAt?: string;\n  canceledAt?: string;\n  createdAt: string;\n  updatedAt: string;\n  payments: AdminPayment[];\n  items: AdminOrderItem[];\n  statusHistory: StatusHistoryEntry[];\n};\n\ntype Dashboard = {\n  openOrders: number;\n  paidToday: number;\n  revenueTodayCents: number;\n};\n\ntype StatusUpdateInput = {\n  order: AdminOrder;\n  status: OrderStatus;\n};\n\ntype WhatsAppPrompt = {\n  order: AdminOrder;\n  status: OrderStatus;\n};\n\nconst flow: OrderStatus[] = [\n  \"PAID\",\n  \"CONFIRMED\",\n  \"PREPARING\",\n  \"READY\",\n  \"OUT_FOR_DELIVERY\",\n  \"DELIVERED\",\n  \"CANCELED\",\n];\n\nconst labels: Record<OrderStatus, string> = {\n  PENDING_PAYMENT: \"Aguardando PIX\",\n  PAID: \"Pago\",\n  CONFIRMED: \"Confirmado\",\n  PREPARING: \"Preparando\",\n  READY: \"Pronto\",\n  OUT_FOR_DELIVERY: \"Em entrega\",\n  DELIVERED: \"Entregue\",\n  CANCELED: \"Cancelado\",\n};\n\nconst paymentLabels: Record<string, string> = {\n  PENDING: \"Aguardando pagamento\",\n  APPROVED: \"Aprovado\",\n  IN_PROCESS: \"Em análise\",\n  REJECTED: \"Recusado\",\n  CANCELED: \"Cancelado\",\n  REFUNDED: \"Estornado\",\n  EXPIRED: \"Expirado\",\n};\n\nfunction normalizeWhatsAppPhone(phone: string) {\n  const digits = phone.replace(/\\D/g, \"\");\n\n  if (\n    digits.startsWith(\"55\") &&\n    (digits.length === 12 || digits.length === 13)\n  ) {\n    return digits;\n  }\n\n  if (digits.length === 10 || digits.length === 11) {\n    return `55${digits}`;\n  }\n\n  return digits;\n}\n\nfunction statusMessage(\n  order: AdminOrder,\n  status: OrderStatus,\n) {\n  const firstName =\n    order.customerName.trim().split(/\\s+/)[0] ||\n    order.customerName;\n\n  const messages: Record<OrderStatus, string> = {\n    PENDING_PAYMENT:\n      \"Seu pedido foi recebido e estamos aguardando a confirmação do pagamento.\",\n    PAID:\n      \"Recebemos o pagamento do seu pedido. Obrigado!\",\n    CONFIRMED:\n      \"Seu pedido foi confirmado pela loja.\",\n    PREPARING:\n      \"Seu pedido já está sendo preparado. 🍔\",\n    READY:\n      order.fulfillment === \"PICKUP\"\n        ? \"Seu pedido está pronto para retirada.\"\n        : \"Seu pedido está pronto e será encaminhado para entrega.\",\n    OUT_FOR_DELIVERY:\n      \"Seu pedido saiu para entrega. 🛵\",\n    DELIVERED:\n      \"Seu pedido foi entregue. Bom apetite!\",\n    CANCELED:\n      \"Seu pedido foi cancelado. Entre em contato com a loja em caso de dúvida.\",\n  };\n\n  return [\n    `Olá, ${firstName}!`,\n    \"\",\n    messages[status],\n    \"\",\n    `Pedido: *${order.publicId}*`,\n    `Status: *${labels[status]}*`,\n    `Total: *${formatMoney(order.totalCents)}*`,\n    \"\",\n    \"Mesa IV Burgers 🍔\",\n  ].join(\"\\n\");\n}\n\nfunction openWhatsApp(\n  order: AdminOrder,\n  status = order.status,\n) {\n  const phone = normalizeWhatsAppPhone(\n    order.customerPhone,\n  );\n\n  if (phone.length < 12) {\n    window.alert(\n      \"O telefone deste cliente parece estar incompleto.\",\n    );\n    return;\n  }\n\n  const message = statusMessage(order, status);\n  const url =\n    `https://wa.me/${phone}` +\n    `?text=${encodeURIComponent(message)}`;\n\n  window.open(\n    url,\n    \"_blank\",\n    \"noopener,noreferrer\",\n  );\n}\n\nfunction formatDistance(meters?: number) {\n  if (!meters) {\n    return \"Não calculada\";\n  }\n\n  return `${(meters / 1000).toFixed(1)} km`;\n}\n\nfunction formatDuration(seconds?: number) {\n  if (!seconds) {\n    return \"Não calculado\";\n  }\n\n  return `${Math.max(1, Math.ceil(seconds / 60))} min`;\n}\n\nfunction paymentProviderLabel(provider?: string) {\n  return provider === \"MANUAL_PIX\"\n    ? \"Pix manual\"\n    : \"Mercado Pago\";\n}\n\nexport function AdminDashboardPage() {\n  const navigate = useNavigate();\n  const queryClient = useQueryClient();\n  const [selectedOrderId, setSelectedOrderId] =\n    useState<string | null>(null);\n  const [whatsappPrompt, setWhatsappPrompt] =\n    useState<WhatsAppPrompt | null>(null);\n\n  const orders = useQuery({\n    queryKey: [\"admin-orders\"],\n    queryFn: () =>\n      adminApi<AdminOrder[]>(\"/admin/orders\"),\n    refetchInterval: 10000,\n    retry: false,\n  });\n\n  const dashboard = useQuery({\n    queryKey: [\"admin-dashboard\"],\n    queryFn: () =>\n      adminApi<Dashboard>(\"/admin/dashboard\"),\n    refetchInterval: 15000,\n    retry: false,\n  });\n\n  const selectedOrder = useMemo(\n    () =>\n      orders.data?.find(\n        (order) => order.id === selectedOrderId,\n      ) ?? null,\n    [orders.data, selectedOrderId],\n  );\n\n  const update = useMutation({\n    mutationFn: ({\n      order,\n      status,\n    }: StatusUpdateInput) =>\n      adminApi(`/admin/orders/${order.id}/status`, {\n        method: \"PATCH\",\n        body: JSON.stringify({ status }),\n      }),\n    onSuccess(_result, variables) {\n      queryClient.invalidateQueries({\n        queryKey: [\"admin-orders\"],\n      });\n      queryClient.invalidateQueries({\n        queryKey: [\"admin-dashboard\"],\n      });\n\n      if (\n        variables.order.customerPhone &&\n        variables.order.whatsappOptIn !== false\n      ) {\n        setWhatsappPrompt({\n          order: variables.order,\n          status: variables.status,\n        });\n      }\n    },\n  });\n\n  useEffect(() => {\n    if (!selectedOrder && selectedOrderId) {\n      setSelectedOrderId(null);\n    }\n  }, [selectedOrder, selectedOrderId]);\n\n  useEffect(() => {\n    const modalOpen =\n      Boolean(selectedOrderId) ||\n      Boolean(whatsappPrompt);\n\n    if (!modalOpen) {\n      return;\n    }\n\n    const previousOverflow =\n      document.body.style.overflow;\n    document.body.style.overflow = \"hidden\";\n\n    function closeOnEscape(event: KeyboardEvent) {\n      if (event.key !== \"Escape\") {\n        return;\n      }\n\n      if (whatsappPrompt) {\n        setWhatsappPrompt(null);\n      } else {\n        setSelectedOrderId(null);\n      }\n    }\n\n    window.addEventListener(\n      \"keydown\",\n      closeOnEscape,\n    );\n\n    return () => {\n      document.body.style.overflow =\n        previousOverflow;\n      window.removeEventListener(\n        \"keydown\",\n        closeOnEscape,\n      );\n    };\n  }, [selectedOrderId, whatsappPrompt]);\n\n  if (\n    orders.error &&\n    (orders.error as { status?: number }).status ===\n      401\n  ) {\n    sessionStorage.removeItem(\n      \"mesa4.admin.token\",\n    );\n    navigate(\"/admin/login\");\n    return null;\n  }\n\n  function changeStatus(\n    order: AdminOrder,\n    status: OrderStatus,\n  ) {\n    update.mutate({ order, status });\n  }\n\n  function renderStatusButtons(order: AdminOrder) {\n    const payment = order.payments?.[0];\n    const isManualPix =\n      payment?.provider === \"MANUAL_PIX\";\n\n    return flow.map((status) => {\n      if (\n        status === \"PAID\" &&\n        !isManualPix &&\n        order.status === \"PENDING_PAYMENT\"\n      ) {\n        return null;\n      }\n\n      const buttonLabel =\n        status === \"PAID\" && isManualPix\n          ? \"Confirmar Pix manual\"\n          : labels[status];\n\n      return (\n        <button\n          key={status}\n          type=\"button\"\n          disabled={\n            update.isPending ||\n            order.status === status\n          }\n          onClick={() =>\n            changeStatus(order, status)\n          }\n        >\n          {buttonLabel}\n        </button>\n      );\n    });\n  }\n\n  return (\n    <main className=\"admin-page\">\n      <AdminNav />\n\n      <header className=\"admin-header\">\n        <div>\n          <small>Painel de pedidos</small>\n          <h1>Mesa IV Burgers</h1>\n        </div>\n\n        <div>\n          <button\n            className=\"secondary\"\n            type=\"button\"\n            onClick={() =>\n              queryClient.invalidateQueries()\n            }\n          >\n            <RefreshCw />\n            Atualizar\n          </button>\n        </div>\n      </header>\n\n      <section className=\"stats\">\n        <article>\n          <span>Pedidos abertos</span>\n          <strong>\n            {dashboard.data?.openOrders ?? 0}\n          </strong>\n        </article>\n\n        <article>\n          <span>Pagos hoje</span>\n          <strong>\n            {dashboard.data?.paidToday ?? 0}\n          </strong>\n        </article>\n\n        <article>\n          <span>Faturamento hoje</span>\n          <strong>\n            {formatMoney(\n              dashboard.data?.revenueTodayCents ??\n                0,\n            )}\n          </strong>\n        </article>\n      </section>\n\n      <section className=\"admin-orders\">\n        <div className=\"section-title\">\n          <h2>Pedidos recentes</h2>\n          <span>Atualização automática</span>\n        </div>\n\n        {orders.data?.map((order) => {\n          const payment = order.payments?.[0];\n          const isManualPix =\n            payment?.provider === \"MANUAL_PIX\";\n          const customerReported =\n            Boolean(payment?.reportedAt);\n\n          return (\n            <article\n              className=\"admin-order\"\n              key={order.id}\n            >\n              <div className=\"admin-order-head\">\n                <div>\n                  <span\n                    className={`status-chip ${order.status.toLowerCase()}`}\n                  >\n                    {labels[order.status]}\n                  </span>\n\n                  <h3>{order.publicId}</h3>\n                  <p>\n                    {order.customerName} ·{\" \"}\n                    {order.customerPhone}\n                  </p>\n\n                  <div className=\"payment-provider-row\">\n                    <span className=\"payment-provider-chip\">\n                      <Banknote />\n                      {paymentProviderLabel(\n                        payment?.provider,\n                      )}\n                    </span>\n\n                    {isManualPix &&\n                      order.status ===\n                        \"PENDING_PAYMENT\" && (\n                        <span\n                          className={`manual-report-chip ${\n                            customerReported\n                              ? \"reported\"\n                              : \"\"\n                          }`}\n                        >\n                          {customerReported\n                            ? \"Cliente informou pagamento\"\n                            : \"Aguardando cliente pagar\"}\n                        </span>\n                      )}\n                  </div>\n                </div>\n\n                <div>\n                  <strong>\n                    {formatMoney(order.totalCents)}\n                  </strong>\n                  <small>\n                    {new Date(\n                      order.createdAt,\n                    ).toLocaleString(\"pt-BR\")}\n                  </small>\n                </div>\n              </div>\n\n              <div className=\"admin-order-body\">\n                <div>\n                  {order.items.map((item) => (\n                    <p key={item.id}>\n                      <b>{item.quantity}x</b>{\" \"}\n                      {item.productName}\n                      <small>\n                        {item.options\n                          .map(\n                            (option) =>\n                              option.optionName,\n                          )\n                          .join(\", \")}\n                      </small>\n                    </p>\n                  ))}\n                </div>\n\n                <div>\n                  <b>\n                    {order.fulfillment ===\n                    \"DELIVERY\"\n                      ? \"Entrega\"\n                      : \"Retirada\"}\n                  </b>\n\n                  {order.fulfillment ===\n                    \"DELIVERY\" && (\n                    <p>\n                      {order.street}, {order.number} —{\" \"}\n                      {order.neighborhood}\n                    </p>\n                  )}\n                </div>\n              </div>\n\n              <div className=\"status-actions\">\n                {renderStatusButtons(order)}\n              </div>\n\n              <div className=\"order-card-actions\">\n                <button\n                  className=\"secondary\"\n                  type=\"button\"\n                  onClick={() =>\n                    setSelectedOrderId(order.id)\n                  }\n                >\n                  <Eye />\n                  Ver pedido\n                </button>\n\n                <button\n                  className=\"secondary whatsapp-manual-button\"\n                  type=\"button\"\n                  disabled={\n                    !order.customerPhone ||\n                    order.whatsappOptIn === false\n                  }\n                  title={\n                    order.whatsappOptIn === false\n                      ? \"O cliente não autorizou atualizações pelo WhatsApp\"\n                      : \"Abrir conversa com mensagem pronta\"\n                  }\n                  onClick={() =>\n                    openWhatsApp(order)\n                  }\n                >\n                  <MessageCircle />\n                  Avisar cliente\n                </button>\n              </div>\n\n              {order.whatsappOptIn === false && (\n                <small className=\"whatsapp-consent-warning\">\n                  O cliente não autorizou atualizações\n                  pelo WhatsApp.\n                </small>\n              )}\n\n              {update.error && (\n                <p className=\"error-text\">\n                  {update.error.message}\n                </p>\n              )}\n            </article>\n          );\n        })}\n      </section>\n\n      {selectedOrder && (\n        <div\n          className=\"order-detail-overlay\"\n          role=\"presentation\"\n          onMouseDown={(event) => {\n            if (event.target === event.currentTarget) {\n              setSelectedOrderId(null);\n            }\n          }}\n        >\n          <aside\n            className=\"order-detail-drawer\"\n            role=\"dialog\"\n            aria-modal=\"true\"\n            aria-label={`Detalhes do pedido ${selectedOrder.publicId}`}\n          >\n            <header className=\"order-detail-header\">\n              <div>\n                <small>Detalhes do pedido</small>\n                <h2>{selectedOrder.publicId}</h2>\n                <span\n                  className={`status-chip ${selectedOrder.status.toLowerCase()}`}\n                >\n                  {labels[selectedOrder.status]}\n                </span>\n              </div>\n\n              <button\n                className=\"icon-button\"\n                type=\"button\"\n                aria-label=\"Fechar detalhes\"\n                onClick={() =>\n                  setSelectedOrderId(null)\n                }\n              >\n                <X />\n              </button>\n            </header>\n\n            <div className=\"order-detail-content\">\n              <section className=\"order-detail-section\">\n                <h3>\n                  <UserRound />\n                  Cliente\n                </h3>\n\n                <div className=\"order-detail-grid\">\n                  <div>\n                    <span>Nome</span>\n                    <strong>\n                      {selectedOrder.customerName}\n                    </strong>\n                  </div>\n\n                  <div>\n                    <span>Telefone</span>\n                    <strong>\n                      {selectedOrder.customerPhone}\n                    </strong>\n                  </div>\n\n                  <div>\n                    <span>E-mail</span>\n                    <strong>\n                      {selectedOrder.customerEmail}\n                    </strong>\n                  </div>\n\n                  {selectedOrder.customerDocument && (\n                    <div>\n                      <span>Documento</span>\n                      <strong>\n                        {\n                          selectedOrder.customerDocument\n                        }\n                      </strong>\n                    </div>\n                  )}\n                </div>\n              </section>\n\n              <section className=\"order-detail-section\">\n                <h3>\n                  <PackageCheck />\n                  Pedido\n                </h3>\n\n                <div className=\"order-detail-items\">\n                  {selectedOrder.items.map((item) => (\n                    <article key={item.id}>\n                      <div>\n                        <strong>\n                          {item.quantity}x{\" \"}\n                          {item.productName}\n                        </strong>\n                        <span>\n                          {formatMoney(\n                            item.lineTotalCents,\n                          )}\n                        </span>\n                      </div>\n\n                      {item.options.length > 0 && (\n                        <ul>\n                          {item.options.map(\n                            (option) => (\n                              <li key={option.id}>\n                                {option.groupName\n                                  ? `${option.groupName}: `\n                                  : \"\"}\n                                {option.optionName}\n                                {option.unitPriceCents\n                                  ? ` (+${formatMoney(\n                                      option.unitPriceCents,\n                                    )})`\n                                  : \"\"}\n                              </li>\n                            ),\n                          )}\n                        </ul>\n                      )}\n\n                      {item.notes && (\n                        <small>\n                          Observação: {item.notes}\n                        </small>\n                      )}\n                    </article>\n                  ))}\n                </div>\n\n                {selectedOrder.notes && (\n                  <div className=\"order-general-notes\">\n                    <span>\n                      Observação do pedido\n                    </span>\n                    <p>{selectedOrder.notes}</p>\n                  </div>\n                )}\n              </section>\n\n              <section className=\"order-detail-section\">\n                <h3>\n                  <MapPin />\n                  {selectedOrder.fulfillment ===\n                  \"DELIVERY\"\n                    ? \"Entrega\"\n                    : \"Retirada\"}\n                </h3>\n\n                {selectedOrder.fulfillment ===\n                \"DELIVERY\" ? (\n                  <>\n                    <p className=\"order-address\">\n                      {selectedOrder.street},{\" \"}\n                      {selectedOrder.number}\n                      {selectedOrder.complement\n                        ? ` — ${selectedOrder.complement}`\n                        : \"\"}\n                      <br />\n                      {selectedOrder.neighborhood} —{\" \"}\n                      {selectedOrder.city}/\n                      {selectedOrder.state}\n                      <br />\n                      CEP {selectedOrder.postalCode}\n                    </p>\n\n                    {selectedOrder.reference && (\n                      <p className=\"order-reference\">\n                        Referência:{\" \"}\n                        {selectedOrder.reference}\n                      </p>\n                    )}\n\n                    <div className=\"order-detail-grid\">\n                      <div>\n                        <span>Distância</span>\n                        <strong>\n                          {formatDistance(\n                            selectedOrder.deliveryDistanceMeters,\n                          )}\n                        </strong>\n                      </div>\n\n                      <div>\n                        <span>Trajeto estimado</span>\n                        <strong>\n                          {formatDuration(\n                            selectedOrder.deliveryDurationSeconds,\n                          )}\n                        </strong>\n                      </div>\n                    </div>\n                  </>\n                ) : (\n                  <p>\n                    O cliente retirará o pedido na loja.\n                  </p>\n                )}\n              </section>\n\n              <section className=\"order-detail-section\">\n                <h3>\n                  <Banknote />\n                  Pagamento e valores\n                </h3>\n\n                <div className=\"order-detail-grid\">\n                  <div>\n                    <span>Forma</span>\n                    <strong>\n                      {paymentProviderLabel(\n                        selectedOrder.payments?.[0]\n                          ?.provider,\n                      )}\n                    </strong>\n                  </div>\n\n                  <div>\n                    <span>Status</span>\n                    <strong>\n                      {paymentLabels[\n                        selectedOrder.payments?.[0]\n                          ?.status\n                      ] ??\n                        selectedOrder.payments?.[0]\n                          ?.status ??\n                        \"Não informado\"}\n                    </strong>\n                  </div>\n                </div>\n\n                {selectedOrder.payments?.[0]\n                  ?.reportedAt && (\n                  <p className=\"manual-payment-alert\">\n                    O cliente informou que realizou o\n                    Pix em{\" \"}\n                    {new Date(\n                      selectedOrder.payments[0]\n                        .reportedAt as string,\n                    ).toLocaleString(\"pt-BR\")}\n                    . Confira o banco antes de confirmar.\n                  </p>\n                )}\n\n                <div className=\"order-values\">\n                  <div>\n                    <span>Subtotal</span>\n                    <strong>\n                      {formatMoney(\n                        selectedOrder.subtotalCents,\n                      )}\n                    </strong>\n                  </div>\n\n                  <div>\n                    <span>Entrega</span>\n                    <strong>\n                      {formatMoney(\n                        selectedOrder.deliveryFeeCents,\n                      )}\n                    </strong>\n                  </div>\n\n                  {selectedOrder.discountCents > 0 && (\n                    <div>\n                      <span>Desconto</span>\n                      <strong>\n                        -\n                        {formatMoney(\n                          selectedOrder.discountCents,\n                        )}\n                      </strong>\n                    </div>\n                  )}\n\n                  <div className=\"order-total-row\">\n                    <span>Total</span>\n                    <strong>\n                      {formatMoney(\n                        selectedOrder.totalCents,\n                      )}\n                    </strong>\n                  </div>\n                </div>\n              </section>\n\n              <section className=\"order-detail-section\">\n                <h3>\n                  <Clock3 />\n                  Histórico\n                </h3>\n\n                <div className=\"admin-order-timeline\">\n                  {selectedOrder.statusHistory.map(\n                    (entry) => (\n                      <div key={entry.id}>\n                        <span>\n                          <CheckCircle2 />\n                        </span>\n\n                        <div>\n                          <strong>\n                            {labels[entry.status]}\n                          </strong>\n                          <small>\n                            {new Date(\n                              entry.createdAt,\n                            ).toLocaleString(\"pt-BR\")}\n                          </small>\n                          {entry.note && (\n                            <p>{entry.note}</p>\n                          )}\n                        </div>\n                      </div>\n                    ),\n                  )}\n                </div>\n              </section>\n            </div>\n\n            <footer className=\"order-detail-footer\">\n              <div className=\"status-actions\">\n                {renderStatusButtons(selectedOrder)}\n              </div>\n\n              <button\n                className=\"primary\"\n                type=\"button\"\n                disabled={\n                  !selectedOrder.customerPhone ||\n                  selectedOrder.whatsappOptIn ===\n                    false\n                }\n                onClick={() =>\n                  openWhatsApp(selectedOrder)\n                }\n              >\n                <MessageCircle />\n                Avisar cliente no WhatsApp\n              </button>\n            </footer>\n          </aside>\n        </div>\n      )}\n\n      {whatsappPrompt && (\n        <div\n          className=\"whatsapp-prompt-overlay\"\n          role=\"presentation\"\n          onMouseDown={(event) => {\n            if (event.target === event.currentTarget) {\n              setWhatsappPrompt(null);\n            }\n          }}\n        >\n          <section\n            className=\"whatsapp-prompt\"\n            role=\"dialog\"\n            aria-modal=\"true\"\n            aria-label=\"Avisar cliente pelo WhatsApp\"\n          >\n            <div className=\"whatsapp-prompt-icon\">\n              <MessageCircle />\n            </div>\n\n            <h2>Status atualizado</h2>\n            <p>\n              O pedido{\" \"}\n              <strong>\n                {whatsappPrompt.order.publicId}\n              </strong>{\" \"}\n              agora está como{\" \"}\n              <strong>\n                {labels[whatsappPrompt.status]}\n              </strong>\n              .\n            </p>\n\n            <p>\n              Deseja abrir o WhatsApp do cliente com a\n              mensagem pronta?\n            </p>\n\n            <div className=\"whatsapp-prompt-actions\">\n              <button\n                className=\"secondary\"\n                type=\"button\"\n                onClick={() =>\n                  setWhatsappPrompt(null)\n                }\n              >\n                Agora não\n              </button>\n\n              <button\n                className=\"primary\"\n                type=\"button\"\n                onClick={() => {\n                  openWhatsApp(\n                    whatsappPrompt.order,\n                    whatsappPrompt.status,\n                  );\n                  setWhatsappPrompt(null);\n                }}\n              >\n                <MessageCircle />\n                Abrir WhatsApp\n              </button>\n            </div>\n          </section>\n        </div>\n      )}\n    </main>\n  );\n}\n",
);

appendCss();

const backupDirectory = absolute(
  `backup-whatsapp-manual-${Date.now()}`,
);

mkdirSync(backupDirectory, {
  recursive: true,
});

for (const relative of staged.keys()) {
  const source = absolute(relative);

  if (!existsSync(source)) {
    continue;
  }

  const destination = resolve(
    backupDirectory,
    relative,
  );

  mkdirSync(dirname(destination), {
    recursive: true,
  });

  cpSync(source, destination);
}

for (const [relative, content] of staged) {
  const file = absolute(relative);

  mkdirSync(dirname(file), {
    recursive: true,
  });

  writeFileSync(file, content, "utf8");
  console.log(`✓ ${relative}`);
}

console.log(`
Atualização v3 aplicada.

O código anterior foi salvo em:
  ${backupDirectory}

Agora execute:

  cd backend
  npm run build

  cd ../frontend
  npm run build

Não é necessário prisma:push, pois esta atualização
não altera o schema do banco.
`);
