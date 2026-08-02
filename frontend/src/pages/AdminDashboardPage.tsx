import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Banknote,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AdminNav } from "../components/AdminNav";
import { adminApi } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { OrderStatus } from "../types";

type WhatsAppNotification = {
  id: string;
  orderStatus: OrderStatus;
  deliveryStatus: string;
  errorMessage?: string;
  createdAt: string;
};

type AdminPayment = {
  id: string;
  provider: string;
  status: string;
  statusDetail?: string;
  reportedAt?: string;
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
  payments: AdminPayment[];
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
    queryFn: () =>
      adminApi<AdminOrder[]>("/admin/orders"),
    refetchInterval: 10000,
    retry: false,
  });

  const dashboard = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () =>
      adminApi<Dashboard>("/admin/dashboard"),
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
      adminApi(`/admin/orders/${id}/status`, {
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
      adminApi(`/admin/orders/${id}/whatsapp`, {
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
    (orders.error as { status?: number }).status ===
      401
  ) {
    sessionStorage.removeItem(
      "mesa4.admin.token",
    );
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
            type="button"
            onClick={() =>
              queryClient.invalidateQueries()
            }
          >
            <RefreshCw />
            Atualizar
          </button>
        </div>
      </header>

      <section className="stats">
        <article>
          <span>Pedidos abertos</span>
          <strong>
            {dashboard.data?.openOrders ?? 0}
          </strong>
        </article>

        <article>
          <span>Pagos hoje</span>
          <strong>
            {dashboard.data?.paidToday ?? 0}
          </strong>
        </article>

        <article>
          <span>Faturamento hoje</span>
          <strong>
            {formatMoney(
              dashboard.data?.revenueTodayCents ??
                0,
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
          const payment = order.payments?.[0];
          const isManualPix =
            payment?.provider === "MANUAL_PIX";
          const customerReported =
            Boolean(payment?.reportedAt);
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
                    className={`status-chip ${order.status.toLowerCase()}`}
                  >
                    {labels[order.status]}
                  </span>

                  <h3>{order.publicId}</h3>
                  <p>
                    {order.customerName} ·{" "}
                    {order.customerPhone}
                  </p>

                  <div className="payment-provider-row">
                    <span className="payment-provider-chip">
                      <Banknote />
                      {isManualPix
                        ? "Pix manual"
                        : "Mercado Pago"}
                    </span>

                    {isManualPix &&
                      order.status ===
                        "PENDING_PAYMENT" && (
                        <span
                          className={`manual-report-chip ${
                            customerReported
                              ? "reported"
                              : ""
                          }`}
                        >
                          {customerReported
                            ? "Cliente informou pagamento"
                            : "Aguardando cliente pagar"}
                        </span>
                      )}
                  </div>

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
                          lastNotification.errorMessage ??
                          ""
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
                    {order.fulfillment ===
                    "DELIVERY"
                      ? "Entrega"
                      : "Retirada"}
                  </b>

                  {order.fulfillment ===
                    "DELIVERY" && (
                    <p>
                      {order.street}, {order.number} —{" "}
                      {order.neighborhood}
                    </p>
                  )}
                </div>
              </div>

              <div className="status-actions">
                {flow.map((status) => {
                  if (
                    status === "PAID" &&
                    !isManualPix &&
                    order.status ===
                      "PENDING_PAYMENT"
                  ) {
                    return null;
                  }

                  const buttonLabel =
                    status === "PAID" &&
                    isManualPix
                      ? "Confirmar Pix manual"
                      : labels[status];

                  return (
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
                      {buttonLabel}
                    </button>
                  );
                })}
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

              {update.error && (
                <p className="error-text">
                  {update.error.message}
                </p>
              )}

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
