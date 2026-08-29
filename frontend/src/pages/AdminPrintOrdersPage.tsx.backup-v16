import { useQuery } from "@tanstack/react-query";
import { Printer, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AdminNav } from "../components/AdminNav";
import { adminApi } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { OrderStatus } from "../types";

type AdminPayment = {
  id: string;
  provider: string;
  method:
    | "PIX"
    | "CASH"
    | "CARD"
    | "DEBIT"
    | "CREDIT"
    | "TICKET"
    | "VR_ALIMENTACAO"
    | "VR_REFEICAO"
    | "PLUXEE";
  status: string;
  statusDetail?: string;
  amountCents: number;
};

type OrderOption = {
  id: string;
  groupName?: string;
  optionName: string;
  unitPriceCents?: number;
  quantity?: number;
};

type AdminOrderItem = {
  id: string;
  quantity: number;
  productName: string;
  unitPriceCents: number;
  lineTotalCents: number;
  notes?: string;
  options: OrderOption[];
};

type AdminOrder = {
  id: string;
  publicId: string;
  customerName: string;
  customerPhone: string;
  fulfillment: "DELIVERY" | "PICKUP";
  postalCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  reference?: string;
  notes?: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  status: OrderStatus;
  createdAt: string;
  payments: AdminPayment[];
  items: AdminOrderItem[];
};

const statusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Aguardando pagamento",
  PAID: "Pago",
  CONFIRMED: "Confirmado",
  PREPARING: "Preparando",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};

function paymentLabel(payment?: AdminPayment) {
  const labels: Record<string, string> = {
    PIX:
      payment?.provider === "MANUAL_PIX"
        ? "Pix manual"
        : "Pix",
    CASH: "Dinheiro",
    CARD: "Cartão",
    DEBIT: "Débito",
    CREDIT: "Crédito",
    TICKET: "Ticket",
    VR_ALIMENTACAO: "VR Alimentação",
    VR_REFEICAO: "VR Refeição",
    PLUXEE: "Pluxee",
  };

  return payment?.method
    ? labels[payment.method] ?? payment.method
    : "Não informado";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printOrder(order: AdminOrder) {
  const deliveryFeeForPrint =
    order.deliveryFeeCents > 0
      ? order.deliveryFeeCents
      : Math.max(
          0,
          order.totalCents -
            order.subtotalCents +
            order.discountCents,
        );
  const payment = order.payments?.[0];

  const itemsHtml = order.items
    .map((item) => {
      const options = item.options
        .map((option) => {
          const quantity =
            option.quantity && option.quantity > 1
              ? `${option.quantity}x `
              : "";

          return `${quantity}${escapeHtml(option.optionName)}`;
        })
        .join(", ");

      return `
        <div class="item">
          <strong>${item.quantity}x ${escapeHtml(item.productName)}</strong>
          ${options ? `<small>${options}</small>` : ""}
          ${item.notes ? `<small><b>Obs.:</b> ${escapeHtml(item.notes)}</small>` : ""}
          <span>${escapeHtml(formatMoney(item.lineTotalCents))}</span>
        </div>
      `;
    })
    .join("");

  const address =
    order.fulfillment === "DELIVERY"
      ? [
          `${order.street ?? ""}, ${order.number ?? ""}${order.complement ? ` - ${order.complement}` : ""}`,
          `${order.neighborhood ?? ""} - ${order.city ?? ""}/${order.state ?? ""}`,
          order.postalCode ? `CEP ${order.postalCode}` : "",
          order.reference ? `Referência: ${order.reference}` : "",
        ]
          .filter(Boolean)
          .map((line) => `<div>${escapeHtml(line)}</div>`)
          .join("")
      : "<div>Retirada na loja</div>";

  const popup = window.open(
    "",
    "_blank",
    "width=460,height=760",
  );

  if (!popup) {
    window.alert(
      "O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente novamente.",
    );
    return;
  }

  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Pedido ${escapeHtml(order.publicId)}</title>
        <style>
          @page { size: 80mm auto; margin: 5mm; }
          * { box-sizing: border-box; }
          body {
            width: 70mm;
            margin: 0 auto;
            color: #111;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            line-height: 1.35;
          }
          h1, h2, p { margin: 0; }
          h1 { font-size: 20px; text-align: center; }
          h2 { font-size: 14px; margin-bottom: 5px; }
          .center { text-align: center; }
          .muted { color: #555; }
          .divider {
            border-top: 1px dashed #222;
            margin: 10px 0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin: 3px 0;
          }
          .item {
            display: grid;
            gap: 2px;
            margin-bottom: 9px;
          }
          .item span {
            text-align: right;
            font-weight: 700;
          }
          small { display: block; }
          .notes {
            border: 1px solid #111;
            padding: 7px;
            margin-top: 8px;
          }
          .total {
            font-size: 16px;
            font-weight: 700;
          }
          @media print {
            body { width: auto; }
          }
        </style>
      </head>
      <body>
        <h1>Mesa IV Burgers</h1>
        <p class="center"><strong>Pedido ${escapeHtml(order.publicId)}</strong></p>
        <p class="center muted">${escapeHtml(
          new Date(order.createdAt).toLocaleString("pt-BR"),
        )}</p>

        <div class="divider"></div>

        <h2>Cliente</h2>
        <div>${escapeHtml(order.customerName)}</div>
        <div>${escapeHtml(order.customerPhone)}</div>
        <div><strong>Status:</strong> ${escapeHtml(statusLabels[order.status])}</div>
        <div><strong>Pagamento:</strong> ${escapeHtml(paymentLabel(payment))}</div>

        <div class="divider"></div>

        <h2>Entrega</h2>
        ${address}

        <div class="divider"></div>

        <h2>Itens</h2>
        ${itemsHtml}

        ${
          order.notes
            ? `
          <div class="notes">
            <strong>OBSERVAÇÃO GERAL</strong>
            <div>${escapeHtml(order.notes)}</div>
          </div>
        `
            : ""
        }

        <div class="divider"></div>

        <div class="row">
          <span>Subtotal</span>
          <strong>${escapeHtml(formatMoney(order.subtotalCents))}</strong>
        </div>
        <div class="row">
          <span>Entrega</span>
          <strong>${escapeHtml(formatMoney(deliveryFeeForPrint))}</strong>
        </div>
        ${
          order.discountCents > 0
            ? `
          <div class="row">
            <span>Desconto</span>
            <strong>-${escapeHtml(formatMoney(order.discountCents))}</strong>
          </div>
        `
            : ""
        }
        <div class="row total">
          <span>Total</span>
          <strong>${escapeHtml(formatMoney(order.totalCents))}</strong>
        </div>

        <div class="divider"></div>
        <p class="center">Mesa IV Burgers</p>
      </body>
    </html>
  `);

  popup.document.close();
  popup.focus();

  window.setTimeout(() => {
    popup.print();
  }, 250);
}

export function AdminPrintOrdersPage() {
  const navigate = useNavigate();

  const orders = useQuery({
    queryKey: ["admin-orders-print"],
    queryFn: () =>
      adminApi<AdminOrder[]>("/admin/orders?limit=100"),
    refetchInterval: 15000,
    retry: false,
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
          <small>Impressão</small>
          <h1>Imprimir pedidos</h1>
        </div>

        <button
          className="secondary"
          type="button"
          onClick={() => orders.refetch()}
          disabled={orders.isFetching}
        >
          <RefreshCw />
          {orders.isFetching ? "Atualizando..." : "Atualizar"}
        </button>
      </header>

      <section className="admin-orders">
        <div className="section-title">
          <h2>Pedidos recentes</h2>
          <span>Escolha um pedido para imprimir</span>
        </div>

        {orders.isLoading && (
          <p>Carregando pedidos...</p>
        )}

        {orders.error && (
          <p className="error-text">
            {orders.error.message}
          </p>
        )}

        {orders.data?.map((order) => (
          <article
            className="admin-order"
            key={order.id}
          >
            <div className="admin-order-head">
              <div>
                <span
                  className={`status-chip ${order.status.toLowerCase()}`}
                >
                  {statusLabels[order.status]}
                </span>
                <h3>{order.publicId}</h3>
                <p>
                  {order.customerName} ·{" "}
                  {order.customerPhone}
                </p>
                <small>
                  {paymentLabel(order.payments?.[0])}
                </small>
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
                <b>Entrega</b>
                <p>
                  {order.street}, {order.number} —{" "}
                  {order.neighborhood}
                </p>
              </div>
            </div>

            <div className="order-card-actions">
              <button
                className="primary"
                type="button"
                onClick={() => printOrder(order)}
              >
                <Printer />
                Imprimir pedido
              </button>
            </div>
          </article>
        ))}

        {orders.data?.length === 0 && (
          <p>Nenhum pedido encontrado.</p>
        )}
      </section>
    </main>
  );
}
