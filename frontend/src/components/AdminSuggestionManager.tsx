import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { adminApi } from "../lib/api";

type SuggestionMode =
  | "NONE"
  | "AUTO"
  | "DRINK"
  | "EXTRA";

type AdminSuggestionProduct = {
  id: string;
  name: string;
  imageUrl?: string | null;
  active: boolean;
  soldOut: boolean;
  suggestAtCheckout: boolean;
  cartSuggestionKind?:
    | "DRINK"
    | "EXTRA"
    | null;
  cartSuggestionPriority?: number | null;
  category: {
    id: string;
    name: string;
  };
};

type Draft = {
  mode: SuggestionMode;
  priority: number;
};

function modeFromProduct(
  product: AdminSuggestionProduct,
): SuggestionMode {
  if (!product.suggestAtCheckout) {
    return "NONE";
  }

  if (
    product.cartSuggestionKind ===
    "DRINK"
  ) {
    return "DRINK";
  }

  if (
    product.cartSuggestionKind ===
    "EXTRA"
  ) {
    return "EXTRA";
  }

  return "AUTO";
}

export function AdminSuggestionManager() {
  const client = useQueryClient();
  const [drafts, setDrafts] =
    useState<Record<string, Draft>>({});
  const [savedId, setSavedId] =
    useState<string | null>(null);

  const products = useQuery({
    queryKey: [
      "admin-cart-suggestion-products",
    ],
    queryFn: () =>
      adminApi<AdminSuggestionProduct[]>(
        "/admin/products",
      ),
  });

  useEffect(() => {
    if (!products.data) {
      return;
    }

    const next: Record<string, Draft> = {};

    for (const product of products.data) {
      next[product.id] = {
        mode: modeFromProduct(product),
        priority:
          product.cartSuggestionPriority ??
          0,
      };
    }

    setDrafts(next);
  }, [products.data]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      AdminSuggestionProduct[]
    >();

    for (const product of
      products.data ?? []) {
      const category =
        product.category?.name ??
        "Sem categoria";

      const list =
        map.get(category) ?? [];

      list.push(product);
      map.set(category, list);
    }

    return [...map.entries()]
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) =>
          a.name.localeCompare(
            b.name,
            "pt-BR",
          ),
        ),
      }))
      .sort((a, b) =>
        a.category.localeCompare(
          b.category,
          "pt-BR",
        ),
      );
  }, [products.data]);

  const save = useMutation({
    mutationFn: ({
      productId,
      draft,
    }: {
      productId: string;
      draft: Draft;
    }) =>
      adminApi(
        `/admin/products/${productId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            suggestAtCheckout:
              draft.mode !== "NONE",
            cartSuggestionKind:
              draft.mode === "DRINK" ||
              draft.mode === "EXTRA"
                ? draft.mode
                : null,
            cartSuggestionPriority:
              Math.max(
                0,
                Math.min(
                  999,
                  Math.trunc(
                    draft.priority || 0,
                  ),
                ),
              ),
          }),
        },
      ),
    onSuccess: async (
      _data,
      variables,
    ) => {
      setSavedId(variables.productId);

      await Promise.all([
        client.invalidateQueries({
          queryKey: [
            "admin-cart-suggestion-products",
          ],
        }),
        client.invalidateQueries({
          queryKey: ["menu"],
        }),
      ]);

      window.setTimeout(() => {
        setSavedId((current) =>
          current === variables.productId
            ? null
            : current,
        );
      }, 1600);
    },
  });

  return (
    <section className="admin-form settings-form suggestion-manager">
      <div className="settings-section-heading">
        <div>
          <small>
            Controle manual
          </small>
          <h2>
            Sugestões do carrinho
          </h2>
          <p>
            A lógica continua contextual:
            primeiro bebida e depois extra.
            Aqui você escolhe quais produtos
            podem aparecer e a prioridade.
          </p>
        </div>
      </div>

      <div className="suggestion-legend">
        <span>
          <b>Bebida</b>: aparece quando
          falta bebida.
        </span>
        <span>
          <b>Extra</b>: aparece depois,
          quando falta complemento.
        </span>
        <span>
          <b>Prioridade</b>: número maior
          aparece primeiro.
        </span>
      </div>

      {products.isLoading && (
        <p>Carregando produtos...</p>
      )}

      {products.error && (
        <p className="error-text">
          {products.error.message}
        </p>
      )}

      <div className="suggestion-category-list">
        {groups.map(
          ({ category, items }) => {
            const configured =
              items.filter(
                (product) =>
                  drafts[product.id]
                    ?.mode !== "NONE",
              ).length;

            return (
              <details
                className="suggestion-category"
                key={category}
              >
                <summary>
                  <div>
                    <strong>
                      {category}
                    </strong>
                    <small>
                      {items.length} produtos
                      {" · "}
                      {configured} configurados
                    </small>
                  </div>
                  <span>
                    Gerenciar
                  </span>
                </summary>

                <div className="suggestion-product-list">
                  {items.map((product) => {
                    const draft =
                      drafts[product.id] ?? {
                        mode:
                          modeFromProduct(
                            product,
                          ),
                        priority:
                          product.cartSuggestionPriority ??
                          0,
                      };

                    return (
                      <article
                        className="suggestion-admin-row"
                        key={product.id}
                      >
                        <div className="suggestion-admin-product">
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
                            <div className="suggestion-admin-placeholder">
                              🍔
                            </div>
                          )}

                          <div>
                            <strong>
                              {product.name}
                            </strong>
                            <small>
                              {!product.active
                                ? "Produto oculto"
                                : product.soldOut
                                  ? "Produto esgotado"
                                  : "Disponível"}
                            </small>
                          </div>
                        </div>

                        <label>
                          <span>
                            Sugestão
                          </span>
                          <select
                            value={
                              draft.mode
                            }
                            onChange={(
                              event,
                            ) =>
                              setDrafts(
                                (current) => ({
                                  ...current,
                                  [product.id]:
                                    {
                                      ...draft,
                                      mode:
                                        event
                                          .target
                                          .value as SuggestionMode,
                                    },
                                }),
                              )
                            }
                          >
                            <option value="NONE">
                              Não sugerir
                            </option>
                            <option value="DRINK">
                              Bebida
                            </option>
                            <option value="EXTRA">
                              Extra
                            </option>
                            <option value="AUTO">
                              Automático (legado)
                            </option>
                          </select>
                        </label>

                        <label className="suggestion-priority-field">
                          <span>
                            Prioridade
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="999"
                            value={
                              draft.priority
                            }
                            onChange={(
                              event,
                            ) =>
                              setDrafts(
                                (current) => ({
                                  ...current,
                                  [product.id]:
                                    {
                                      ...draft,
                                      priority:
                                        Number(
                                          event
                                            .target
                                            .value,
                                        ),
                                    },
                                }),
                              )
                            }
                          />
                        </label>

                        <button
                          type="button"
                          className="secondary"
                          disabled={
                            save.isPending
                          }
                          onClick={() =>
                            save.mutate({
                              productId:
                                product.id,
                              draft,
                            })
                          }
                        >
                          {savedId ===
                          product.id
                            ? "✓ Salvo"
                            : "Salvar"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </details>
            );
          },
        )}
      </div>

      {save.error && (
        <p className="error-text">
          {save.error.message}
        </p>
      )}
    </section>
  );
}
