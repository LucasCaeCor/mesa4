import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { adminApi } from "../lib/api";
import { formatMoney } from "../lib/format";
import { AdminNav } from "../components/AdminNav";

type Category = {
  id: string;
  name: string;
  active: boolean;
  position: number;
};

type Option = {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
};

type Group = {
  id: string;
  name: string;
  required: boolean;
  maxSelection: number;
  options: Option[];
};

type Product = {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  priceCents: number;
  imageUrl?: string;
  featured: boolean;
  active: boolean;
  soldOut: boolean;
  position: number;
  category: Category;
  optionGroups: Group[];
};

type PatchInput = {
  path: string;
  body: unknown;
};

export function AdminMenuPage() {
  const client = useQueryClient();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const categories = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => adminApi<Category[]>("/admin/categories"),
  });
  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => adminApi<Product[]>("/admin/products"),
  });

  const refresh = () => {
    client.invalidateQueries({ queryKey: ["admin-products"] });
    client.invalidateQueries({ queryKey: ["admin-categories"] });
    client.invalidateQueries({ queryKey: ["menu"] });
  };

  const createCategory = useMutation({
    mutationFn: (body: unknown) =>
      adminApi("/admin/categories", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  const createProduct = useMutation({
    mutationFn: (body: unknown) =>
      adminApi("/admin/products", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  const patch = useMutation({
    mutationFn: ({ path, body }: PatchInput) =>
      adminApi(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  const editProduct = useMutation({
    mutationFn: ({ path, body }: PatchInput) =>
      adminApi(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setEditingProduct(null);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (path: string) => adminApi(path, { method: "DELETE" }),
    onSuccess: refresh,
  });

  const create = useMutation({
    mutationFn: ({ path, body }: PatchInput) =>
      adminApi(path, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  function categorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createCategory.mutate({
      name: form.get("name"),
      active: true,
      position: Number(form.get("position")) || 0,
    });
    event.currentTarget.reset();
  }

  function productSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createProduct.mutate({
      categoryId: form.get("categoryId"),
      name: form.get("name"),
      description: form.get("description") || undefined,
      priceCents: Math.round(Number(form.get("price")) * 100),
      imageUrl: form.get("imageUrl") || "",
      active: true,
      soldOut: false,
      featured: form.get("featured") === "on",
      position: Number(form.get("position")) || 0,
    });
    event.currentTarget.reset();
  }

  function editSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProduct) return;

    const form = new FormData(event.currentTarget);
    editProduct.mutate({
      path: `/admin/products/${editingProduct.id}`,
      body: {
        categoryId: form.get("categoryId"),
        name: form.get("name"),
        description: String(form.get("description") ?? ""),
        priceCents: Math.round(Number(form.get("price")) * 100),
        imageUrl: form.get("imageUrl") || "",
        position: Number(form.get("position")) || 0,
        featured: form.get("featured") === "on",
        active: form.get("active") === "on",
        soldOut: form.get("soldOut") === "on",
      },
    });
  }

  function addGroup(productId: string) {
    const name = prompt("Nome do grupo, por exemplo: Adicionais");
    if (!name) return;
    const maxSelection = Number(prompt("Máximo de escolhas", "1") || 1);
    create.mutate({
      path: `/admin/products/${productId}/option-groups`,
      body: {
        name,
        required: false,
        minSelection: 0,
        maxSelection,
        active: true,
        position: 0,
      },
    });
  }

  function addOption(groupId: string) {
    const name = prompt("Nome da opção");
    if (!name) return;
    const price = Number(prompt("Preço adicional em reais", "0") || 0);
    create.mutate({
      path: `/admin/option-groups/${groupId}/options`,
      body: {
        name,
        priceCents: Math.round(price * 100),
        active: true,
        position: 0,
      },
    });
  }

  return (
    <main className="admin-page">
      <AdminNav />
      <header className="admin-header">
        <div>
          <small>Gerenciar produtos</small>
          <h1>Cardápio</h1>
        </div>
      </header>

      <section className="admin-form-grid">
        <form className="admin-form" onSubmit={categorySubmit}>
          <h2>Nova categoria</h2>
          <label className="field">
            <span>Nome</span>
            <input name="name" required />
          </label>
          <label className="field">
            <span>Posição</span>
            <input name="position" type="number" min="0" defaultValue="0" />
          </label>
          <button className="primary" disabled={createCategory.isPending}>
            <Plus /> Criar categoria
          </button>
        </form>

        <form className="admin-form" onSubmit={productSubmit}>
          <h2>Novo produto</h2>
          <label className="field">
            <span>Categoria</span>
            <select name="categoryId" required>
              <option value="">Selecione</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Nome</span>
            <input name="name" required />
          </label>
          <label className="field">
            <span>Descrição</span>
            <textarea name="description" />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Preço em R$</span>
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label className="field">
              <span>Posição</span>
              <input name="position" type="number" min="0" defaultValue="0" />
            </label>
            <label className="field full">
              <span>URL da imagem</span>
              <input name="imageUrl" type="url" />
            </label>
          </div>
          <label className="admin-check">
            <input name="featured" type="checkbox" /> Produto em destaque
          </label>
          <button className="primary" disabled={createProduct.isPending}>
            <Plus /> Criar produto
          </button>
        </form>
      </section>

      <section className="admin-products">
        <div className="section-title">
          <h2>Produtos</h2>
          <span>{products.data?.length ?? 0} cadastrados</span>
        </div>

        {products.data?.map((product) => (
          <article className="admin-product" key={product.id}>
            <div className="admin-product-main">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt="" />
              ) : (
                <div className="admin-product-placeholder">🍔</div>
              )}
              <div>
                <small>
                  {product.category.name} · posição {product.position}
                </small>
                <h3>{product.name}</h3>
                <p>{product.description}</p>
                <strong>{formatMoney(product.priceCents)}</strong>
              </div>
            </div>

            <div className="admin-product-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditingProduct(product)}
              >
                <Pencil /> Editar
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  patch.mutate({
                    path: `/admin/products/${product.id}`,
                    body: { soldOut: !product.soldOut },
                  })
                }
              >
                {product.soldOut ? "Marcar disponível" : "Marcar esgotado"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  patch.mutate({
                    path: `/admin/products/${product.id}`,
                    body: { active: !product.active },
                  })
                }
              >
                {product.active ? "Ocultar" : "Publicar"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => addGroup(product.id)}
              >
                Adicionar grupo
              </button>
              <button
                type="button"
                className="icon-button danger"
                onClick={() =>
                  confirm("Excluir produto?") &&
                  remove.mutate(`/admin/products/${product.id}`)
                }
                aria-label={`Excluir ${product.name}`}
              >
                <Trash2 />
              </button>
            </div>

            {product.optionGroups.map((group) => (
              <div className="admin-option-group" key={group.id}>
                <div>
                  <strong>{group.name}</strong>
                  <button type="button" onClick={() => addOption(group.id)}>
                    + opção
                  </button>
                </div>
                {group.options.map((option) => (
                  <span key={option.id}>
                    {option.name}{" "}
                    {option.priceCents > 0 &&
                      `+ ${formatMoney(option.priceCents)}`}
                    <button
                      type="button"
                      onClick={() =>
                        remove.mutate(`/admin/options/${option.id}`)
                      }
                      aria-label={`Excluir ${option.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ))}
          </article>
        ))}
      </section>

      {editingProduct && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setEditingProduct(null)}
        >
          <form
            className="modal admin-edit-modal"
            onSubmit={editSubmit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button close"
              type="button"
              onClick={() => setEditingProduct(null)}
              aria-label="Fechar edição"
            >
              <X />
            </button>
            <div className="modal-body admin-edit-form">
              <small>Editar produto</small>
              <h2>{editingProduct.name}</h2>

              <label className="field">
                <span>Categoria</span>
                <select
                  name="categoryId"
                  defaultValue={editingProduct.categoryId}
                  required
                >
                  {categories.data?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Nome</span>
                <input
                  name="name"
                  defaultValue={editingProduct.name}
                  required
                />
              </label>
              <label className="field">
                <span>Descrição</span>
                <textarea
                  name="description"
                  defaultValue={editingProduct.description}
                />
              </label>
              <div className="field-grid">
                <label className="field">
                  <span>Preço em R$</span>
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={editingProduct.priceCents / 100}
                    required
                  />
                </label>
                <label className="field">
                  <span>Posição no cardápio</span>
                  <input
                    name="position"
                    type="number"
                    min="0"
                    defaultValue={editingProduct.position}
                  />
                </label>
                <label className="field full">
                  <span>URL da imagem</span>
                  <input
                    name="imageUrl"
                    type="url"
                    defaultValue={editingProduct.imageUrl}
                  />
                </label>
              </div>

              <div className="edit-check-grid">
                <label className="admin-check">
                  <input
                    name="featured"
                    type="checkbox"
                    defaultChecked={editingProduct.featured}
                  />{" "}
                  Destaque
                </label>
                <label className="admin-check">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={editingProduct.active}
                  />{" "}
                  Publicado
                </label>
                <label className="admin-check">
                  <input
                    name="soldOut"
                    type="checkbox"
                    defaultChecked={editingProduct.soldOut}
                  />{" "}
                  Esgotado
                </label>
              </div>

              {editProduct.error && (
                <p className="error-text">{editProduct.error.message}</p>
              )}
              <button className="primary" disabled={editProduct.isPending}>
                {editProduct.isPending ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
