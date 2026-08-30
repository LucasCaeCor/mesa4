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
import type {
  MenuResponse,
  Product,
} from "../types";
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
  "guaraná",
  "suco",
  "sucos",
  "agua",
  "água",
  "fanta",
  "sprite",
  "pepsi",
  "soda",
];

const MEAL_KEYWORDS = [
  "lanche",
  "lanches",
  "burger",
  "burguer",
  "hamburguer",
  "hambúrguer",
  "smash",
  "sanduiche",
  "sanduíche",
  "hot dog",
  "hotdog",
  "cachorro quente",
  "combo",
];

const EXTRA_KEYWORDS = [
  "adicional",
  "adicionais",
  "extra",
  "extras",
  "acompanhamento",
  "acompanhamentos",
  "batata",
  "fritas",
  "onion",
  "nugget",
  "nuggets",
  "molho",
  "molhos",
  "cheddar",
  "bacon",
  "catupiry",
  "calabresa",
  "ovo",
  "porcao",
  "porção",
  "sobremesa",
];

const OPTION_GROUP_EXTRA_KEYWORDS = [
  "adicional",
  "adicionais",
  "extra",
  "extras",
  "acrescimo",
  "acréscimo",
  "complemento",
  "complementos",
];

const STOP_WORDS = new Set([
  "com",
  "sem",
  "para",
  "por",
  "uma",
  "um",
  "the",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "ml",
  "litro",
  "litros",
  "lata",
  "garrafa",
  "unidade",
]);

function normalizeText(
  value: string,
) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(
  value: string,
  keywords: string[],
) {
  const normalized =
    normalizeText(value);

  return keywords.some(
    (keyword) =>
      normalized.includes(
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

function significantWords(
  value: string,
) {
  return normalizeText(value)
    .split(" ")
    .filter(
      (word) =>
        word.length >= 3 &&
        !STOP_WORDS.has(word),
    );
}

function productLooksRepresented(
  product: Product,
  cartText: string,
) {
  const candidate =
    normalizeText(product.name);

  if (
    candidate &&
    cartText.includes(candidate)
  ) {
    return true;
  }

  const words =
    significantWords(product.name);

  if (!words.length) {
    return false;
  }

  const matched =
    words.filter((word) =>
      cartText.includes(word),
    ).length;

  return (
    words.length >= 2 &&
    matched / words.length >= 0.75
  );
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
        items.map(
          (item) => item.productId,
        ),
      ),
    [items],
  );

  const cartContext = useMemo(() => {
    let hasMeal = false;
    let hasDrink = false;
    let hasExtra = false;

    const textParts: string[] = [];

    for (const item of items) {
      const catalogItem =
        catalog.find(
          ({ product }) =>
            product.id ===
            item.productId,
        );

      const product =
        catalogItem?.product;

      const categoryName =
        catalogItem?.categoryName ?? "";

      const productIdentity =
        `${categoryName} ${product?.name ?? item.productName}`;

      const productFullText =
        `${productIdentity} ${product?.description ?? ""}`;

      textParts.push(
        productFullText,
      );

      if (
        includesAny(
          productIdentity,
          DRINK_KEYWORDS,
        )
      ) {
        hasDrink = true;
      }

      if (
        includesAny(
          productIdentity,
          MEAL_KEYWORDS,
        ) &&
        !includesAny(
          productIdentity,
          DRINK_KEYWORDS,
        )
      ) {
        hasMeal = true;
      }

      // Produto avulso de acompanhamento/adicional.
      if (
        includesAny(
          productIdentity,
          EXTRA_KEYWORDS,
        ) &&
        !includesAny(
          productIdentity,
          MEAL_KEYWORDS,
        ) &&
        !includesAny(
          productIdentity,
          DRINK_KEYWORDS,
        )
      ) {
        hasExtra = true;
      }

      // Combos podem declarar bebida/batata na descrição.
      if (
        includesAny(
          productIdentity,
          ["combo"],
        )
      ) {
        if (
          includesAny(
            product?.description ?? "",
            DRINK_KEYWORDS,
          )
        ) {
          hasDrink = true;
        }

        if (
          includesAny(
            product?.description ?? "",
            EXTRA_KEYWORDS,
          )
        ) {
          hasExtra = true;
        }
      }

      for (const option of item.options) {
        const optionText =
          `${option.groupName} ${option.optionName}`;

        textParts.push(optionText);

        if (
          includesAny(
            optionText,
            DRINK_KEYWORDS,
          )
        ) {
          hasDrink = true;
        }

        // Para não considerar ingrediente normal do lanche
        // como adicional, a opção precisa estar em um grupo
        // de adicionais/extras OU ter nome muito claro de
        // acompanhamento.
        if (
          includesAny(
            option.groupName,
            OPTION_GROUP_EXTRA_KEYWORDS,
          ) ||
          includesAny(
            option.optionName,
            [
              "batata",
              "fritas",
              "onion",
              "nugget",
              "nuggets",
              "porcao",
              "porção",
            ],
          )
        ) {
          hasExtra = true;
        }
      }
    }

    return {
      hasMeal,
      hasDrink,
      hasExtra,
      cartText: normalizeText(
        textParts.join(" "),
      ),
    };
  }, [catalog, items]);

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

            /* MESA4_DRINK_FILTER_V25_1 */
            // Para classificar uma sugestão como bebida,
            // usamos somente categoria + nome. A descrição
            // pode dizer "combo com Coca-Cola" e isso não
            // transforma o combo em uma bebida.
            const identity =
              `${categoryName} ${product.name}`;

            if (
              !includesAny(
                identity,
                DRINK_KEYWORDS,
              )
            ) {
              return false;
            }

            // Nunca deixa lanche/combo entrar na seção
            // "Que tal uma bebida?".
            if (
              includesAny(
                identity,
                MEAL_KEYWORDS,
              )
            ) {
              return false;
            }

            return !productLooksRepresented(
              product,
              cartContext.cartText,
            );
          },
        )
        .slice(0, 4)
        .map(
          ({ product }) => product,
        ),
    [
      catalog,
      cartProductIds,
      cartContext.cartText,
    ],
  );

  const extraSuggestions = useMemo(() => {
    const candidates =
      catalog.filter(
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
            `${categoryName} ${product.name} ${product.description ?? ""}`;

          if (
            includesAny(
              text,
              DRINK_KEYWORDS,
            ) ||
            includesAny(
              text,
              MEAL_KEYWORDS,
            )
          ) {
            return false;
          }

          const looksLikeExtra =
            includesAny(
              text,
              EXTRA_KEYWORDS,
            ) ||
            product.suggestAtCheckout;

          if (!looksLikeExtra) {
            return false;
          }

          return !productLooksRepresented(
            product,
            cartContext.cartText,
          );
        },
      );

    return candidates
      .slice(0, 4)
      .map(
        ({ product }) => product,
      );
  }, [
    catalog,
    cartProductIds,
    cartContext.cartText,
  ]);

  const suggestionMode =
    !items.length ||
    !cartContext.hasMeal
      ? "NONE"
      : !cartContext.hasDrink
        ? "DRINK"
        : !cartContext.hasExtra
          ? "EXTRA"
          : "NONE";

  function handleSuggestion(
    product: Product,
  ) {
    if (
      product.optionGroups.length
    ) {
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

  const visibleSuggestions =
    suggestionMode === "DRINK"
      ? drinkSuggestions
      : suggestionMode === "EXTRA"
        ? extraSuggestions
        : [];

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

          {!!items.length &&
            visibleSuggestions.length > 0 && (
              <div className="upsell-stack">
                <section
                  className="upsell-section"
                  data-contextual-upsell="true"
                >
                  <div className="upsell-header">
                    <div className="upsell-icon">
                      {suggestionMode ===
                      "DRINK" ? (
                        <GlassWater
                          size={18}
                        />
                      ) : (
                        <Sparkles
                          size={18}
                        />
                      )}
                    </div>

                    <div>
                      <span className="upsell-kicker">
                        {suggestionMode ===
                        "DRINK"
                          ? "Falta só uma bebida"
                          : "Deixe ainda melhor"}
                      </span>

                      <h3>
                        {suggestionMode ===
                        "DRINK"
                          ? "Que tal uma bebida?"
                          : "Turbine seu lanche"}
                      </h3>

                      <p>
                        {suggestionMode ===
                        "DRINK"
                          ? "Seu pedido já tem lanche. Escolha uma bebida para completar."
                          : "Seu pedido já tem lanche e bebida. Que tal adicionar um acompanhamento?"}
                      </p>
                    </div>
                  </div>

                  <div className="upsell-grid">
                    {visibleSuggestions.map(
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
                              <span>
                                {suggestionMode ===
                                "DRINK"
                                  ? "🥤"
                                  : "🍟"}
                              </span>
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
                navigate("/checkout");
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
            setSelectedUpsell(null)
          }
        />
      )}
    </>
  );
}
