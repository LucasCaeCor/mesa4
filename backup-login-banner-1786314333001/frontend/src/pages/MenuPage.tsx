import { useQuery } from "@tanstack/react-query";
import { Clock3, Instagram, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { MenuResponse, Product, StoreResponse } from "../types";
import { ProductModal } from "../components/ProductModal";
import { useCart } from "../store/cart";

export function MenuPage() {
  const [selected, setSelected] = useState<Product | null>(null);
  const menu = useQuery({ queryKey: ["menu"], queryFn: () => api<MenuResponse>("/menu") });
  const store = useQuery({
    queryKey: ["store"],
    queryFn: () =>
      api<StoreResponse>("/store", {
        cache: "no-store",
      }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const items = useCart((state) => state.items);
  const setOpen = useCart((state) => state.setOpen);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const settings = store.data?.settings;
  /* MESA4_MENU_BUSINESS_HOURS */
  const isStoreOpen =
    store.data?.availability.isOpen ?? false;

  return <main>
    <header className="hero" style={settings?.heroImageUrl ? { backgroundImage: `url(${settings.heroImageUrl})` } : undefined}>
      <nav><div className="brand">{settings?.logoUrl ? <img src={settings.logoUrl} alt="" /> : <span>M4</span>}<strong>{settings?.storeName ?? "Mesa IV Burgers"}</strong></div><div className="nav-actions">{settings?.instagramUrl && <a className="icon-button" href={settings.instagramUrl} target="_blank" rel="noreferrer"><Instagram /></a>}<button className="cart-button" onClick={() => setOpen(true)}><ShoppingBag /><span>{totalQuantity || "Carrinho"}</span></button></div></nav>
      <div className="hero-content"><span className={`store-status ${isStoreOpen ? "open" : "closed"}`}>{isStoreOpen ? "Aceitando pedidos" : "Fechado agora"}</span><h1>Ainda tem<br /><em>LUGAR NA MESA.</em></h1><p>{settings?.description}</p><div className="hero-info"><Clock3 /> Preparo estimado: {settings?.defaultPrepMinutes ?? 40} min</div></div>
    </header>
    <section className="menu-container">
      {menu.isLoading && <p>Carregando cardápio...</p>}
      {menu.data?.categories.map((category) => <section className="category-section" key={category.id}><div className="section-title"><h2>{category.name}</h2><span>{category.products.length} opções</span></div><div className="product-grid">{category.products.map((product) => <button className={`product-card ${product.soldOut ? "sold-out" : ""}`} key={product.id} onClick={() => !product.soldOut && setSelected(product)}><div className="product-copy">{product.featured && <span className="badge">Mais pedido</span>}<h3>{product.name}</h3><p>{product.description}</p><strong>{formatMoney(product.priceCents)}</strong></div><div className="product-image">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <span>🍔</span>}{product.soldOut && <b>Esgotado</b>}</div></button>)}</div></section>)}
    </section>
    {selected && <ProductModal product={selected} onClose={() => setSelected(null)} />}
  </main>;
}
