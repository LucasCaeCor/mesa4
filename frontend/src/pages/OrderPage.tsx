import {
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  Check,
  Copy,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import {
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { OrderStatus } from "../types";

type PaymentMethod =
  | "PIX"
  | "CASH"
  | "CARD"
  | "DEBIT"
  | "CREDIT"
  | "TICKET"
  | "VR_ALIMENTACAO"
  | "VR_REFEICAO"
  | "PLUXEE"
  | "DEBIT_ELO"
  | "DEBIT_VISA"
  | "DEBIT_MASTERCARD"
  | "CREDIT_ELO"
  | "CREDIT_VISA"
  | "CREDIT_MASTERCARD"
  | "CREDIT_HIPER"
  | "CREDIT_HIPERCARD"
  | "CREDIT_AMEX"
  | "PLUXEE_ALIMENTACAO"
  | "PLUXEE_REFEICAO";

type Result = {
  order: {
    publicId: string;
    customerName: string;
    status: OrderStatus;
    subtotalCents: number;
    deliveryFeeCents: number;
    totalCents: number;
    fulfillment: string;
    items: Array<{
      id: string;
      quantity: number;
      productName: string;
      options: Array<{
        id: string;
        optionName: string;
      }>;
    }>;
    statusHistory: Array<{
      id: string;
      status: OrderStatus;
      createdAt: string;
    }>;
  };
  payment: {
    provider: string;
    method: PaymentMethod;
    status: string;
    statusDetail?: string;
    cashChangeForCents?: number | null;
    reportedAt?: string;
    qrCode?: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
  } | null;
};

const labels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Aguardando pagamento",
  PAID: "Pagamento aprovado",
  CONFIRMED: "Pedido confirmado",
  PREPARING: "Em preparo",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
    PIX: "Pix",
    CASH: "Dinheiro",
    CARD: "Cartão",
    DEBIT: "Débito",
    CREDIT: "Crédito",
    TICKET: "Ticket",
    VR_ALIMENTACAO: "VR Alimentação",
    VR_REFEICAO: "VR Refeição",
    PLUXEE: "Pluxee",
    DEBIT_ELO: "Débito · Elo",
    DEBIT_VISA: "Débito · Visa",
    DEBIT_MASTERCARD: "Débito · Mastercard",
    CREDIT_ELO: "Crédito · Elo",
    CREDIT_VISA: "Crédito · Visa",
    CREDIT_MASTERCARD: "Crédito · Mastercard",
    CREDIT_HIPER: "Crédito · Hiper",
    CREDIT_HIPERCARD: "Crédito · Hipercard",
    CREDIT_AMEX: "Crédito · American Express",
    PLUXEE_ALIMENTACAO: "Pluxee Alimentação",
    PLUXEE_REFEICAO: "Pluxee Refeição",
  };

export function OrderPage() {
  const { publicId = "" } = useParams();
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";

  const order = useQuery({
    queryKey: ["order", publicId, token],
    queryFn: () =>
      api<Result>(
        `/orders/${publicId}?token=${encodeURIComponent(token)}`,
      ),
    refetchInterval: 8000,
  });

  const reportPayment = useMutation({
    mutationFn: () =>
      api<Result>(
        `/orders/${publicId}/payment-reported?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
        },
      ),
    onSuccess: () => order.refetch(),
  });

  async function whatsapp() {
    const result = await api<{ url: string }>(
      `/orders/${publicId}/whatsapp?token=${encodeURIComponent(token)}`,
    );

    window.open(
      result.url,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function copyPix() {
    await navigator.clipboard.writeText(
      order.data?.payment?.qrCode ?? "",
    );

    alert("Código PIX copiado");
  }

  if (order.isLoading) {
    return (
      <div className="center-page">
        <p>Carregando pedido...</p>
      </div>
    );
  }

  if (!order.data) {
    return (
      <div className="center-page">
        <h1>Pedido não encontrado</h1>
      </div>
    );
  }

  const data = order.data;
  const deliveryFeeForDisplay =
    data.order.deliveryFeeCents > 0
      ? data.order.deliveryFeeCents
      : Math.max(
          0,
          data.order.totalCents -
            data.order.subtotalCents,
        );
  const isManualPix =
    data.payment?.provider === "MANUAL_PIX";

  return (
    <main className="order-page">
      <section className="order-card">
        <div className="success-icon">
          <Check />
        </div>

        <small>Pedido {data.order.publicId}</small>
        <h1>{labels[data.order.status]}</h1>

        <p>
          Olá, {data.order.customerName}. Esta página
          atualiza automaticamente.
        </p>

        {data.payment && (
          <p className="payment-note">
            <strong>Forma de pagamento:</strong>{" "}
            {paymentMethodLabels[data.payment.method] ??
              data.payment.method}
          </p>
        )}

        {/* MESA4_ORDER_CASH_CHANGE_V19 */}
        {data.payment?.method === "CASH" &&
          data.payment.cashChangeForCents && (
            <p className="payment-note">
              <strong>Troco para:</strong>{" "}
              {formatMoney(
                data.payment.cashChangeForCents,
              )}
            </p>
          )}

        {data.order.status === "PENDING_PAYMENT" &&
          data.payment?.method === "PIX" &&
          data.payment && (
            <div className="pix-box">
              <h2>
                {isManualPix
                  ? "Pix direto para a loja"
                  : "Pague com PIX"}
              </h2>

              {data.payment.qrCodeBase64 && (
                <img
                  src={`data:image/png;base64,${data.payment.qrCodeBase64}`}
                  alt="QR Code PIX"
                />
              )}

              <div
                data-pix-price-breakdown="true"
                style={{
                  width: "100%",
                  maxWidth: 360,
                  margin: "8px auto 16px",
                  padding: "14px 16px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <span>Pedido</span>
                  <strong>
                    {formatMoney(
                      data.order.subtotalCents,
                    )}
                  </strong>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <span>Entrega</span>
                  <strong>
                    {formatMoney(
                      deliveryFeeForDisplay,
                    )}
                  </strong>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    paddingTop: 8,
                    marginTop: 4,
                    borderTop:
                      "1px solid rgba(255,255,255,0.14)",
                    fontSize: "1.05rem",
                  }}
                >
                  <span>Total</span>
                  <strong>
                    {formatMoney(
                      data.order.totalCents,
                    )}
                  </strong>
                </div>
              </div>

              <button
                className="secondary"
                type="button"
                onClick={copyPix}
              >
                <Copy />
                Copiar código PIX
              </button>

              {isManualPix ? (
                <div className="manual-pix-customer">
                  <p>
                    Depois de pagar, avise a loja. O
                    pedido só será confirmado após a
                    conferência no aplicativo bancário.
                  </p>

                  {data.payment.reportedAt ? (
                    <div className="manual-payment-reported">
                      <ShieldCheck />
                      <span>
                        Pagamento informado. Aguardando
                        conferência da loja.
                      </span>
                    </div>
                  ) : (
                    <button
                      className="primary"
                      type="button"
                      disabled={reportPayment.isPending}
                      onClick={() =>
                        reportPayment.mutate()
                      }
                    >
                      {reportPayment.isPending
                        ? "Avisando a loja..."
                        : "Já fiz o PIX"}
                    </button>
                  )}

                  {reportPayment.error && (
                    <p className="error-text">
                      {reportPayment.error.message}
                    </p>
                  )}
                </div>
              ) : (
                <p className="pix-provider-note">
                  A confirmação é automática pelo
                  Mercado Pago.
                </p>
              )}
            </div>
          )}

        <div className="timeline">
          {data.order.statusHistory.map(
            (history, index) => (
              <div
                className="timeline-item"
                key={history.id}
              >
                <span
                  className={
                    index ===
                    data.order.statusHistory.length - 1
                      ? "active"
                      : ""
                  }
                >
                  <Check />
                </span>
                <div>
                  <strong>
                    {labels[history.status]}
                  </strong>
                  <small>
                    {new Date(
                      history.createdAt,
                    ).toLocaleString("pt-BR")}
                  </small>
                </div>
              </div>
            ),
          )}
        </div>

        <div className="order-products">
          {data.order.items.map((item) => (
            <div key={item.id}>
              <span>
                {item.quantity}x {item.productName}
                <small>
                  {item.options
                    .map(
                      (option) => option.optionName,
                    )
                    .join(", ")}
                </small>
              </span>
            </div>
          ))}

          <strong>
            Total: {formatMoney(data.order.totalCents)}
          </strong>
        </div>

        <button
          className="whatsapp"
          type="button"
          onClick={whatsapp}
        >
          <MessageCircle />
          Enviar pedido no WhatsApp
        </button>
      </section>
    </main>
  );
}
