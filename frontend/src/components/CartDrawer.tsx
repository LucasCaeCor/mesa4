import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { StoreResponse } from "../types";
import { formatMoney } from "../lib/format";
import { useCart } from "../store/cart";

export function CartDrawer() {
  const { items, open, setOpen, removeItem, changeQuantity } = useCart();
  const navigate = useNavigate();
  /* MESA4_CART_BUSINESS_HOURS */
  const store = useQuery({
    queryKey: ["store"],
    queryFn: () =>
      api<StoreResponse>("/store", {
        cache: "no-store",
      }),
    refetchInterval: 60_000,
  });
  const isStoreOpen =
    store.data?.availability.isOpen ?? false;
  const subtotal = items.reduce((total, item) => total + (item.basePriceCents + item.options.reduce((sum, option) => sum + option.priceCents * option.quantity, 0)) * item.quantity, 0);
  return <>
    {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
    <aside className={`cart-drawer ${open ? "open" : ""}`}>
      <header><div><ShoppingBag /><h2>Seu pedido</h2></div><button className="icon-button" onClick={() => setOpen(false)}><X /></button></header>
      <div className="cart-content">
        {!items.length && <div className="empty"><ShoppingBag size={44} /><h3>Seu carrinho está vazio</h3><p>Escolha um burger para começar.</p></div>}
        {items.map((item) => <article className="cart-item" key={item.key}>
          <div className="cart-item-top"><div><strong>{item.quantity}x {item.productName}</strong><small>{item.options.map((option) => option.optionName).join(", ")}</small></div><button className="icon-button danger" onClick={() => removeItem(item.key)}><Trash2 /></button></div>
          <div className="cart-item-bottom"><div className="quantity small"><button onClick={() => changeQuantity(item.key, item.quantity - 1)}><Minus /></button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.key, item.quantity + 1)}><Plus /></button></div><b>{formatMoney((item.basePriceCents + item.options.reduce((sum, option) => sum + option.priceCents * option.quantity, 0)) * item.quantity)}</b></div>
        </article>)}
      </div>
      {!!items.length && (
        <footer>
          <div>
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>

          {!store.isLoading && !isStoreOpen && (
            <p className="cart-store-closed">
              Loja fechada agora
            </p>
          )}

          <button
            className="primary"
            disabled={!isStoreOpen}
            onClick={() => {
              setOpen(false);
              navigate("/checkout");
            }}
          >
            {isStoreOpen
              ? "Continuar pedido"
              : "Loja fechada"}
          </button>
        </footer>
      )}
    </aside>
  </>;
}
