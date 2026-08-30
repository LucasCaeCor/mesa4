import {
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  "drink",
  "refri",
  "refrigerante",
  "coca",
  "guarana",
  "suco",
  "agua",
  "fanta",
  "sprite",
  "pepsi",
  "soda",
];

const MEAL_KEYWORDS = [
  "lanche",
  "burger",
  "burguer",
  "hamburguer",
  "smash",
  "sanduiche",
  "hot dog",
  "cachorro quente",
  "combo",
];

const EXTRA_KEYWORDS = [
  "adicional",
  "extra",
  "acompanhamento",
  "batata",
  "fritas",
  "onion",
  "nugget",
  "molho",
  "cheddar",
  "bacon",
  "catupiry",
  "calabresa",
  "ovo",
  "porcao",
  "sobremesa",
];

const OPTION_GROUP_EXTRA_KEYWORDS = [
  "adicional",
  "extra",
  "acrescimo",
  "complemento",
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
  const normalized =
    normalizeText(value);

  return keywords.some((keyword) =>
    normalized.includes(
      normalizeText(keyword),
    ),
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

  const [
    suggestionProduct,
    setSuggestionProduct,
  ] = useState<Product | null>(null);

  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: () =>
      api<MenuResponse>("/menu"),
  });

  const subtotal =
    items.reduce(
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
      menu.data?.categories.flatMap(
        (category) =>
          category.products.map(
            (product) => ({
              categoryName:
                category.name,
              product,
            }),
          ),
      ) ?? [],
    [menu.data],
  );

  const hasManualSuggestionConfig =
    catalog.some(
      ({ product }) =>
        product.cartSuggestionKind ===
          "DRINK" ||
        product.cartSuggestionKind ===
          "EXTRA",
    );

  const cartContext = useMemo(() => {
    let hasMeal = false;
    let hasDrink = false;
    let hasExtra = false;

    const cartTextParts: string[] = [];

    for (const item of items) {
      const catalogEntry =
        catalog.find(
          ({ product }) =>
            product.id ===
            item.productId,
        );

      const product =
        catalogEntry?.product;

      const identity = [
        catalogEntry?.categoryName ??
          "",
        product?.name ??
          item.productName,
      ].join(" ");

      const fullProductText = [
        identity,
        product?.description ?? "",
      ].join(" ");

      const optionsText =
        item.options
          .map(
            (option) =>
              `${option.groupName} ${option.optionName}`,
          )
          .join(" ");

      cartTextParts.push(
        fullProductText,
        optionsText,
      );

      if (
        includesAny(
          identity,
          MEAL_KEYWORDS,
        )
      ) {
        hasMeal = true;
      }

      if (
        product?.cartSuggestionKind ===
          "DRINK" ||
        includesAny(
          fullProductText,
          DRINK_KEYWORDS,
        ) ||
        includesAny(
          optionsText,
          DRINK_KEYWORDS,
        )
      ) {
        hasDrink = true;
      }

      if (
        product?.cartSuggestionKind ===
          "EXTRA" ||
        includesAny(
          fullProductText,
          EXTRA_KEYWORDS,
        ) ||
        includesAny(
          optionsText,
          EXTRA_KEYWORDS,
        ) ||
        item.options.some((option) =>
          includesAny(
            option.groupName,
            OPTION_GROUP_EXTRA_KEYWORDS,
          ),
        )
      ) {
        hasExtra = true;
      }
    }

    return {
      hasMeal,
      hasDrink,
      hasExtra,
      text: normalizeText(
        cartTextParts.join(" "),
      ),
    };
  }, [catalog, items]);

  function productLooksRepresented(
    product: Product,
  ) {
    const name =
      normalizeText(product.name);

    return (
      name.length >= 3 &&
      cartContext.text.includes(name)
    );
  }

  function suggestionEnabled(
    product: Product,
    kind: "DRINK" | "EXTRA",
    legacyIdentity: string,
  ) {
    if (
      product.cartSuggestionKind
    ) {
      return (
        product.suggestAtCheckout &&
        product.cartSuggestionKind ===
          kind
      );
    }

    // Compatibilidade com o sistema anterior:
    // enquanto nenhum produto tiver classificação manual,
    // mantém o comportamento contextual por palavras.
    if (!hasManualSuggestionConfig) {
      return kind === "DRINK"
        ? includesAny(
            legacyIdentity,
            DRINK_KEYWORDS,
          ) &&
            !includesAny(
              legacyIdentity,
              MEAL_KEYWORDS,
            )
        : includesAny(
            legacyIdentity,
            EXTRA_KEYWORDS,
          );
    }

    // Produtos explicitamente mantidos em "Automático (legado)"
    // continuam participando mesmo após ativar o modo manual.
    if (
      product.suggestAtCheckout
    ) {
      return kind === "DRINK"
        ? includesAny(
            legacyIdentity,
            DRINK_KEYWORDS,
          ) &&
            !includesAny(
              legacyIdentity,
              MEAL_KEYWORDS,
            )
        : includesAny(
            legacyIdentity,
            EXTRA_KEYWORDS,
          );
    }

    return false;
  }

  function sortedCandidates(
    kind: "DRINK" | "EXTRA",
  ) {
    return catalog
      .filter(
        ({
          categoryName,
          product,
        }) => {
          if (
            product.soldOut ||
            items.some(
              (item) =>
                item.productId ===
                product.id,
            ) ||
            productLooksRepresented(
              product,
            )
          ) {
            return false;
          }

          // Para classificar sugestão, usa categoria + nome.
          // A descrição do combo não transforma o combo em bebida.
          const identity = [
            categoryName,
            product.name,
          ].join(" ");

          return suggestionEnabled(
            product,
            kind,
            identity,
          );
        },
      )
      .sort((a, b) => {
        const priority =
          (b.product
            .cartSuggestionPriority ??
            0) -
          (a.product
            .cartSuggestionPriority ??
            0);

        if (priority !== 0) {
          return priority;
        }

        return a.product.name.localeCompare(
          b.product.name,
          "pt-BR",
        );
      })
      .slice(0, 4);
  }

  const suggestionMode:
    | "DRINK"
    | "EXTRA"
    | "NONE" =
    !cartContext.hasMeal
      ? "NONE"
      : !cartContext.hasDrink
        ? "DRINK"
        : !cartContext.hasExtra
          ? "EXTRA"
          : "NONE";

  const suggestions =
    suggestionMode === "NONE"
      ? []
      : sortedCandidates(
          suggestionMode,
        );

  function addSuggestion(
    product: Product,
  ) {
    if (
      product.optionGroups.length > 0
    ) {
      setSuggestionProduct(product);
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
        className={`cart-drawer ${
          open ? "open" : ""
        }`}
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
                Escolha um lanche para
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
                        (
                          sum,
                          option,
                        ) =>
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

          {items.length > 0 &&
            suggestions.length > 0 && (
              <section className="cart-contextual-upsell">
                <div className="cart-upsell-heading">
                  <small>
                    {suggestionMode ===
                    "DRINK"
                      ? "🥤 Falta uma bebida?"
                      : "✨ Quer turbinar seu pedido?"}
                  </small>
                  <h3>
                    {suggestionMode ===
                    "DRINK"
                      ? "Que tal uma bebida?"
                      : "Adicione um extra"}
                  </h3>
                </div>

                <div className="cart-upsell-grid">
                  {suggestions.map(
                    ({ product }) => (
                      <article
                        className="cart-upsell-card"
                        key={product.id}
                      >
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
                          <div className="cart-upsell-placeholder">
                            {suggestionMode ===
                            "DRINK"
                              ? "🥤"
                              : "🍟"}
                          </div>
                        )}

                        <div className="cart-upsell-copy">
                          <strong>
                            {product.name}
                          </strong>
                          {product.description && (
                            <small>
                              {
                                product.description
                              }
                            </small>
                          )}
                          <b>
                            {formatMoney(
                              product.priceCents,
                            )}
                          </b>
                        </div>

                        <button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            addSuggestion(
                              product,
                            )
                          }
                        >
                          {product.optionGroups
                            .length > 0
                            ? "Escolher"
                            : "+ Adicionar"}
                        </button>
                      </article>
                    ),
                  )}
                </div>
              </section>
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

      {suggestionProduct && (
        <ProductModal
          product={suggestionProduct}
          onClose={() =>
            setSuggestionProduct(null)
          }
        />
      )}
    </>
  );
}
