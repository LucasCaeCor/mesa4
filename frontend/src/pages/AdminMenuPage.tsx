import { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { adminApi } from "../lib/api";
import { formatMoney } from "../lib/format";
import { AdminNav } from "../components/AdminNav";

type Category = { id: string; name: string; active: boolean };
type Option = { id: string; name: string; priceCents: number; active: boolean };
type Group = { id: string; name: string; required: boolean; maxSelection: number; options: Option[] };
type Product = { id: string; categoryId: string; name: string; description?: string; priceCents: number; imageUrl?: string; active: boolean; soldOut: boolean; category: Category; optionGroups: Group[] };

export function AdminMenuPage() {
  const client = useQueryClient();
  const categories = useQuery({ queryKey: ["admin-categories"], queryFn: () => adminApi<Category[]>("/admin/categories") });
  const products = useQuery({ queryKey: ["admin-products"], queryFn: () => adminApi<Product[]>("/admin/products") });
  const refresh = () => { client.invalidateQueries({ queryKey: ["admin-products"] }); client.invalidateQueries({ queryKey: ["admin-categories"] }); };
  const createCategory = useMutation({ mutationFn: (body: unknown) => adminApi("/admin/categories", { method: "POST", body: JSON.stringify(body) }), onSuccess: refresh });
  const createProduct = useMutation({ mutationFn: (body: unknown) => adminApi("/admin/products", { method: "POST", body: JSON.stringify(body) }), onSuccess: refresh });
  const patch = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => adminApi(path, { method: "PATCH", body: JSON.stringify(body) }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (path: string) => adminApi(path, { method: "DELETE" }), onSuccess: refresh });
  const create = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => adminApi(path, { method: "POST", body: JSON.stringify(body) }), onSuccess: refresh });

  function categorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    createCategory.mutate({ name: form.get("name"), active: true, position: 0 }); event.currentTarget.reset();
  }
  function productSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    createProduct.mutate({ categoryId: form.get("categoryId"), name: form.get("name"), description: form.get("description") || undefined, priceCents: Math.round(Number(form.get("price")) * 100), imageUrl: form.get("imageUrl") || "", active: true, soldOut: false, featured: false, position: 0 }); event.currentTarget.reset();
  }
  function addGroup(productId: string) {
    const name = prompt("Nome do grupo, por exemplo: Adicionais"); if (!name) return;
    const maxSelection = Number(prompt("Máximo de escolhas", "1") || 1);
    create.mutate({ path: `/admin/products/${productId}/option-groups`, body: { name, required: false, minSelection: 0, maxSelection, active: true, position: 0 } });
  }
  function addOption(groupId: string) {
    const name = prompt("Nome da opção"); if (!name) return;
    const price = Number(prompt("Preço adicional em reais", "0") || 0);
    create.mutate({ path: `/admin/option-groups/${groupId}/options`, body: { name, priceCents: Math.round(price * 100), active: true, position: 0 } });
  }

  return <main className="admin-page"><AdminNav /><header className="admin-header"><div><small>Gerenciar produtos</small><h1>Cardápio</h1></div></header>
    <section className="admin-form-grid">
      <form className="admin-form" onSubmit={categorySubmit}><h2>Nova categoria</h2><label className="field"><span>Nome</span><input name="name" required /></label><button className="primary"><Plus />Criar categoria</button></form>
      <form className="admin-form" onSubmit={productSubmit}><h2>Novo produto</h2><label className="field"><span>Categoria</span><select name="categoryId" required><option value="">Selecione</option>{categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="field"><span>Nome</span><input name="name" required /></label><label className="field"><span>Descrição</span><textarea name="description" /></label><div className="field-grid"><label className="field"><span>Preço em R$</span><input name="price" type="number" min="0" step="0.01" required /></label><label className="field"><span>URL da imagem</span><input name="imageUrl" type="url" /></label></div><button className="primary"><Plus />Criar produto</button></form>
    </section>
    <section className="admin-products"><div className="section-title"><h2>Produtos</h2><span>{products.data?.length ?? 0} cadastrados</span></div>{products.data?.map((product) => <article className="admin-product" key={product.id}><div className="admin-product-main">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <div className="admin-product-placeholder">🍔</div>}<div><small>{product.category.name}</small><h3>{product.name}</h3><p>{product.description}</p><strong>{formatMoney(product.priceCents)}</strong></div></div><div className="admin-product-actions"><button className="secondary" onClick={() => patch.mutate({ path: `/admin/products/${product.id}`, body: { soldOut: !product.soldOut } })}>{product.soldOut ? "Marcar disponível" : "Marcar esgotado"}</button><button className="secondary" onClick={() => patch.mutate({ path: `/admin/products/${product.id}`, body: { active: !product.active } })}>{product.active ? "Ocultar" : "Publicar"}</button><button className="secondary" onClick={() => addGroup(product.id)}>Adicionar grupo</button><button className="icon-button danger" onClick={() => confirm("Excluir produto?") && remove.mutate(`/admin/products/${product.id}`)}><Trash2 /></button></div>{product.optionGroups.map((group) => <div className="admin-option-group" key={group.id}><div><strong>{group.name}</strong><button onClick={() => addOption(group.id)}>+ opção</button></div>{group.options.map((option) => <span key={option.id}>{option.name} {option.priceCents > 0 && `+ ${formatMoney(option.priceCents)}`}<button onClick={() => remove.mutate(`/admin/options/${option.id}`)}>×</button></span>)}</div>)}</article>)}</section>
  </main>;
}
