import { useQuery } from "@tanstack/react-query";
import {
  GlassWater,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { useCart } from "../store/cart";
import type { MenuResponse, Product } from "../types";
import { ProductModal } from "./ProductModal";

const DRINK_KEYWORDS = [
  "bebida",
  "bebidas",
  "drink",
  "drinks",
  "refri",
  "refrigerante",
  "refrigerantes",
  "coca",
  "guarana",
  "suco",
  "sucos",
  "agua",
  "água",
  "fanta",
  "sprite",
  "pepsi",
];

const EXTRA_KEYWORDS = [
  "adicional",
  "adicionais",
  "acompanhamento",
  "acompanhar",
  "acomanhamentos",
  "extra",
  "extras",
  "batata",
  "fritas",
  "onion",
  "molho",
  "molhos",
  "cheddar",
  "bacon",
  "nuggets",
  "porcao",
  "porção",
  "combo",
  "sobremesa",
];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesAny(
  value: string,
  keywords: string[],
) {
  return keywords.some((keyword) =>
    value.includes(
      normalizeText(keyword),
    ),
  );
}

function trimDescription(
  value?: string,
) {
  const text = value?.trim();

  if (!text) {
    return "Toque para adicionar ao pedido";
  }

  return text.length > 78
    ? `${text.slice(0, 75)}...`
    : text;
}

export function CartDrawer() {
  const {
    items,
    open,
    setOpen,
    removeItem,
    changeQuantity,
    addItem,
  } = useCart();

  const navigate = useNavigate();

  const [selectedUpsell, setSelectedUpsell] =
    useState<Product | null>(null);

  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: () =>
      api<MenuResponse>("/menu"),
  });

  const subtotal = items.reduce(
    (total, item) =>
      total +
      (item.basePriceCents +
        item.options.reduce(
          (sum, option) =>
            sum +
            option.priceCents *
              option.quantity,
          0,
        )) *
        item.quantity,
    0,
  );

  const catalog = useMemo(
    () =>
      (menu.data?.categories ?? []).flatMap(
        (category) =>
          category.products.map(
            (product) => ({
              product,
              categoryName:
                category.name,
            }),
          ),
      ),
    [menu.data],
  );

  const cartProductIds = useMemo(
    () =>
      new Set(
        items.map((item) => item.productId),
      ),
    [items],
  );

  const drinkSuggestions = useMemo(
    () =>
      catalog
        .filter(
          ({
            product,
            categoryName,
          }) => {
            if (
              product.soldOut ||
              cartProductIds.has(
                product.id,
              )
            ) {
              return false;
            }

            const text =
              normalizeText(
                `${categoryName} ${product.name} ${product.description ?? ""}`,
              );

            return includesAny(
              text,
              DRINK_KEYWORDS,
            );
          },
        )
        .slice(0, 4)
        .map(
          ({ product }) => product,
        ),
    [catalog, cartProductIds],
  );

  const extraSuggestions = useMemo(() => {
    const primary = catalog.filter(
      ({
        product,
        categoryName,
      }) => {
        if (
          product.soldOut ||
          cartProductIds.has(
            product.id,
          )
        ) {
          return false;
        }

        const text =
          normalizeText(
            `${categoryName} ${product.name} ${product.description ?? ""}`,
          );

        if (
          includesAny(
            text,
            DRINK_KEYWORDS,
          )
        ) {
          return false;
        }

        return (
          includesAny(
            text,
            EXTRA_KEYWORDS,
          ) ||
          product.featured ||
          product.suggestAtCheckout
        );
      },
    );

    const fallback = catalog.filter(
      ({
        product,
        categoryName,
      }) => {
        if (
          product.soldOut ||
          cartProductIds.has(
            product.id,
          )
        ) {
          return false;
        }

        const text =
          normalizeText(
            `${categoryName} ${product.name} ${product.description ?? ""}`,
          );

        return !includesAny(
          text,
          DRINK_KEYWORDS,
        );
      },
    );

    const merged = [
      ...primary,
      ...fallback,
    ];

    const seen = new Set<string>();
    const results: Product[] = [];

    for (const { product } of merged) {
      if (seen.has(product.id)) {
        continue;
      }

      seen.add(product.id);
      results.push(product);

      if (results.length >= 4) {
        break;
      }
    }

    return results;
  }, [catalog, cartProductIds]);

  function handleSuggestion(
    product: Product,
  ) {
    if (product.optionGroups.length) {
      setSelectedUpsell(product);
      return;
    }

    addItem({
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      basePriceCents:
        product.priceCents,
      quantity: 1,
      options: [],
    });
  }

  return (
    <>
      {open && (
        <div
          className="drawer-backdrop"
          onClick={() =>
            setOpen(false)
          }
        />
      )}

      <aside
        className={`cart-drawer ${open ? "open" : ""}`}
      >
        <header>
          <div>
            <ShoppingBag />
            <h2>Seu pedido</h2>
          </div>

          <button
            className="icon-button"
            onClick={() =>
              setOpen(false)
            }
          >
            <X />
          </button>
        </header>

        <div className="cart-content">
          {!items.length && (
            <div className="empty">
              <ShoppingBag size={44} />
              <h3>
                Seu carrinho está vazio
              </h3>
              <p>
                Escolha um burger para
                começar.
              </p>
            </div>
          )}

          {items.map((item) => (
            <article
              className="cart-item"
              key={item.key}
            >
              <div className="cart-item-top">
                <div>
                  <strong>
                    {item.quantity}x{" "}
                    {item.productName}
                  </strong>

                  <small>
                    {item.options
                      .map(
                        (option) =>
                          option.optionName,
                      )
                      .join(", ")}
                  </small>
                </div>

                <button
                  className="icon-button danger"
                  onClick={() =>
                    removeItem(item.key)
                  }
                >
                  <Trash2 />
                </button>
              </div>

              <div className="cart-item-bottom">
                <div className="quantity small">
                  <button
                    onClick={() =>
                      changeQuantity(
                        item.key,
                        item.quantity - 1,
                      )
                    }
                  >
                    <Minus />
                  </button>

                  <span>
                    {item.quantity}
                  </span>

                  <button
                    onClick={() =>
                      changeQuantity(
                        item.key,
                        item.quantity + 1,
                      )
                    }
                  >
                    <Plus />
                  </button>
                </div>

                <b>
                  {formatMoney(
                    (item.basePriceCents +
                      item.options.reduce(
                        (sum, option) =>
                          sum +
                          option.priceCents *
                            option.quantity,
                        0,
                      )) *
                      item.quantity,
                  )}
                </b>
              </div>
            </article>
          ))}

          {!!items.length && (
            <div className="upsell-stack">
              {!!extraSuggestions.length && (
                <section className="upsell-section">
                  <div className="upsell-header">
                    <div className="upsell-icon">
                      <Sparkles size={18} />
                    </div>

                    <div>
                      <span className="upsell-kicker">
                        Sugestão especial
                      </span>
                      <h3>
                        Turbine seu lanche
                      </h3>
                      <p>
                        Escolha um extra
                        para deixar seu
                        pedido ainda mais
                        completo.
                      </p>
                    </div>
                  </div>

                  <div className="upsell-grid">
                    {extraSuggestions.map(
                      (product) => (
                        <button
                          className="upsell-card"
                          key={product.id}
                          onClick={() =>
                            handleSuggestion(
                              product,
                            )
                          }
                        >
                          <div className="upsell-thumb">
                            {product.imageUrl ? (
                              <img
                                src={
                                  product.imageUrl
                                }
                                alt={
                                  product.name
                                }
                              />
                            ) : (
                              <span>🍟</span>
                            )}
                          </div>

                          <div className="upsell-copy">
                            <strong>
                              {product.name}
                            </strong>

                            <small>
                              {trimDescription(
                                product.description,
                              )}
                            </small>

                            <div className="upsell-meta">
                              <b>
                                {formatMoney(
                                  product.priceCents,
                                )}
                              </b>
                              <span>
                                Adicionar
                              </span>
                            </div>
                          </div>
                        </button>
                      ),
                    )}
                  </div>
                </section>
              )}

              {!!drinkSuggestions.length && (
                <section className="upsell-section">
                  <div className="upsell-header">
                    <div className="upsell-icon">
                      <GlassWater
                        size={18}
                      />
                    </div>

                    <div>
                      <span className="upsell-kicker">
                        Complemente seu
                        pedido
                      </span>
                      <h3>
                        Que tal uma
                        bebida?
                      </h3>
                      <p>
                        Aproveite para
                        adicionar uma
                        bebida gelada ao
                        seu lanche.
                      </p>
                    </div>
                  </div>

                  <div className="upsell-grid">
                    {drinkSuggestions.map(
                      (product) => (
                        <button
                          className="upsell-card"
                          key={product.id}
                          onClick={() =>
                            handleSuggestion(
                              product,
                            )
                          }
                        >
                          <div className="upsell-thumb">
                            {product.imageUrl ? (
                              <img
                                src={
                                  product.imageUrl
                                }
                                alt={
                                  product.name
                                }
                              />
                            ) : (
                              <span>🥤</span>
                            )}
                          </div>

                          <div className="upsell-copy">
                            <strong>
                              {product.name}
                            </strong>

                            <small>
                              {trimDescription(
                                product.description,
                              )}
                            </small>

                            <div className="upsell-meta">
                              <b>
                                {formatMoney(
                                  product.priceCents,
                                )}
                              </b>
                              <span>
                                Adicionar
                              </span>
                            </div>
                          </div>
                        </button>
                      ),
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {!!items.length && (
          <footer>
            <div>
              <span>Subtotal</span>
              <strong>
                {formatMoney(subtotal)}
              </strong>
            </div>

            <button
              className="primary"
              onClick={() => {
                setOpen(false);
                navigate(
                  "/checkout",
                );
              }}
            >
              Continuar pedido
            </button>
          </footer>
        )}
      </aside>

      {selectedUpsell && (
        <ProductModal
          product={selectedUpsell}
          onClose={() =>
            setSelectedUpsell(
              null,
            )
          }
        />
      )}
    </>
  );
}
