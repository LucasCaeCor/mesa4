import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../lib/api";
import { formatMoney } from "../lib/format";
import { AdminNav } from "../components/AdminNav";
import type { OrderStatus } from "../types";

type AdminOrder = { id: string; publicId: string; customerName: string; customerPhone: string; fulfillment: string; totalCents: number; status: OrderStatus; createdAt: string; deliveryZoneName?: string; street?: string; number?: string; neighborhood?: string; items: Array<{ id: string; quantity: number; productName: string; options: Array<{ id: string; optionName: string }> }> };
type Dashboard = { openOrders: number; paidToday: number; revenueTodayCents: number };
const flow: OrderStatus[] = ["PAID", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"];
const labels: Record<OrderStatus, string> = { PENDING_PAYMENT: "Aguardando PIX", PAID: "Pago", CONFIRMED: "Confirmado", PREPARING: "Preparando", READY: "Pronto", OUT_FOR_DELIVERY: "Em entrega", DELIVERED: "Entregue", CANCELED: "Cancelado" };

export function AdminDashboardPage() {
  const navigate = useNavigate(); const queryClient = useQueryClient();
  const orders = useQuery({ queryKey: ["admin-orders"], queryFn: () => adminApi<AdminOrder[]>("/admin/orders"), refetchInterval: 10000, retry: false });
  const dashboard = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => adminApi<Dashboard>("/admin/dashboard"), refetchInterval: 15000, retry: false });
  const update = useMutation({ mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => adminApi(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }), onSuccess() { queryClient.invalidateQueries({ queryKey: ["admin-orders"] }); queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }); } });
  if (orders.error && (orders.error as any).status === 401) { sessionStorage.removeItem("mesa4.admin.token"); navigate("/admin/login"); return null; }
  return <main className="admin-page"><AdminNav /><header className="admin-header"><div><small>Painel de pedidos</small><h1>Mesa IV Burgers</h1></div><div><button className="secondary" onClick={() => queryClient.invalidateQueries()}><RefreshCw />Atualizar</button></div></header><section className="stats"><article><span>Pedidos abertos</span><strong>{dashboard.data?.openOrders ?? 0}</strong></article><article><span>Pagos hoje</span><strong>{dashboard.data?.paidToday ?? 0}</strong></article><article><span>Faturamento hoje</span><strong>{formatMoney(dashboard.data?.revenueTodayCents ?? 0)}</strong></article></section><section className="admin-orders"><div className="section-title"><h2>Pedidos recentes</h2><span>Atualização automática</span></div>{orders.data?.map((order) => <article className="admin-order" key={order.id}><div className="admin-order-head"><div><span className={`status-chip ${order.status.toLowerCase()}`}>{labels[order.status]}</span><h3>{order.publicId}</h3><p>{order.customerName} · {order.customerPhone}</p></div><div><strong>{formatMoney(order.totalCents)}</strong><small>{new Date(order.createdAt).toLocaleString("pt-BR")}</small></div></div><div className="admin-order-body"><div>{order.items.map((item) => <p key={item.id}><b>{item.quantity}x</b> {item.productName}<small>{item.options.map((option) => option.optionName).join(", ")}</small></p>)}</div><div><b>{order.fulfillment === "DELIVERY" ? "Entrega" : "Retirada"}</b>{order.fulfillment === "DELIVERY" && <p>{order.street}, {order.number} — {order.neighborhood}</p>}</div></div><div className="status-actions">{flow.map((status) => <button key={status} disabled={update.isPending || order.status === status} onClick={() => update.mutate({ id: order.id, status })}>{labels[status]}</button>)}</div></article>)}</section></main>;
}
