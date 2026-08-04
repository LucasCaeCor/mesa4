#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  resolve,
} from "node:path";

const root = process.cwd();
const staged = new Map();

function absolute(relative) {
  return resolve(root, relative);
}

function read(relative) {
  if (staged.has(relative)) {
    return staged.get(relative);
  }

  const file = absolute(relative);

  if (!existsSync(file)) {
    throw new Error(
      `Arquivo não encontrado: ${relative}`,
    );
  }

  const content = readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n");

  staged.set(relative, content);
  return content;
}

function stage(relative, content) {
  staged.set(relative, content);
}

function requireChange(
  relative,
  current,
  updated,
  description,
) {
  if (updated === current) {
    throw new Error(
      `Não consegui aplicar: ${description}\n` +
        `Arquivo: ${relative}\n` +
        "Nenhum arquivo foi gravado.",
    );
  }

  stage(relative, updated);
}

// Prisma ----------------------------------------------------------------------

{
  const relative = "backend/prisma/schema.prisma";
  const current = read(relative);

  if (!current.includes("suggestAtCheckout Boolean")) {
    const updated = current.replace(
      /(\n\s*featured\s+Boolean\s+@default\(false\)\s*\n)/,
      `$1  suggestAtCheckout Boolean              @default(false)
`,
    );

    requireChange(
      relative,
      current,
      updated,
      "campo de sugestão no produto",
    );
  }
}

// Backend ---------------------------------------------------------------------

{
  const relative =
    "backend/src/routes/admin.routes.ts";
  const current = read(relative);

  if (
    !current.includes(
      "suggestAtCheckout: z.boolean()",
    )
  ) {
    const updated = current.replace(
      /(\s*featured:\s*z\.boolean\(\)\.default\(false\),\s*\n)/,
      `$1  suggestAtCheckout: z.boolean().default(false),
`,
    );

    requireChange(
      relative,
      current,
      updated,
      "validação do campo de sugestão",
    );
  }
}

// Tipos públicos ---------------------------------------------------------------

{
  const relative = "frontend/src/types.ts";
  const current = read(relative);

  if (!current.includes("suggestAtCheckout")) {
    let updated = current.replace(
      /(featured:\s*boolean;\s*)(soldOut:)/,
      `$1suggestAtCheckout: boolean; $2`,
    );

    if (updated === current) {
      updated = current.replace(
        /(featured:\s*boolean;\s*\n)/,
        `$1  suggestAtCheckout: boolean;
`,
      );
    }

    requireChange(
      relative,
      current,
      updated,
      "tipo público de produto sugerido",
    );
  }
}

// Administração ---------------------------------------------------------------

{
  const relative =
    "frontend/src/pages/AdminMenuPage.tsx";
  let content = read(relative);

  if (
    !content.includes(
      "/* MESA4_IMAGE_URL_AND_CHECKOUT_SUGGESTION */",
    )
  ) {
    content = content.replace(
      /(imagePublicId\?:\s*string;\s*\n\s*featured:\s*boolean;)/,
      `$1
  suggestAtCheckout: boolean;`,
    );

    content = content.replace(
      /(imagePublicId\?:\s*string;\s*\n\s*active:\s*boolean;)/,
      `$1
  suggestAtCheckout: boolean;`,
    );

    content = content.replace(
      /type UploadResult = \{\s*imageUrl:\s*string;\s*imagePublicId:\s*string;\s*\};/,
      `type UploadResult = {
  imageUrl: string;
  imagePublicId?: string;
};`,
    );

    const componentStart = content.indexOf(
      "function ImageUploadField({",
    );
    const pageStart = content.indexOf(
      "export function AdminMenuPage()",
      componentStart,
    );

    if (
      componentStart < 0 ||
      pageStart < 0
    ) {
      throw new Error(
        "Não encontrei o componente atual de imagens no AdminMenuPage.tsx. Nenhum arquivo foi gravado.",
      );
    }

    content =
      content.slice(0, componentStart) +
      "function ImageUploadField({\n  value,\n  onChange,\n}: {\n  value: UploadResult | null;\n  onChange: (image: UploadResult | null) => void;\n}) {\n  const inputRef = useRef<HTMLInputElement>(null);\n  const [source, setSource] = useState<\n    \"upload\" | \"url\"\n  >(\n    value?.imageUrl && !value.imagePublicId\n      ? \"url\"\n      : \"upload\",\n  );\n  const [imageUrl, setImageUrl] = useState(\n    value?.imageUrl && !value.imagePublicId\n      ? value.imageUrl\n      : \"\",\n  );\n  const [uploading, setUploading] =\n    useState(false);\n  const [error, setError] = useState(\"\");\n\n  async function selectImage(\n    event: React.ChangeEvent<HTMLInputElement>,\n  ) {\n    const file = event.target.files?.[0];\n\n    if (!file) {\n      return;\n    }\n\n    if (!file.type.startsWith(\"image/\")) {\n      setError(\"Selecione um arquivo de imagem.\");\n      event.target.value = \"\";\n      return;\n    }\n\n    if (file.size > 5 * 1024 * 1024) {\n      setError(\"A imagem deve ter no máximo 5 MB.\");\n      event.target.value = \"\";\n      return;\n    }\n\n    setUploading(true);\n    setError(\"\");\n\n    try {\n      const body = new FormData();\n      body.append(\"image\", file);\n\n      const result = await adminApi<UploadResult>(\n        \"/admin/uploads/images\",\n        {\n          method: \"POST\",\n          body,\n        },\n      );\n\n      setSource(\"upload\");\n      setImageUrl(\"\");\n      onChange(result);\n    } catch (uploadError) {\n      setError(\n        uploadError instanceof Error\n          ? uploadError.message\n          : \"Não foi possível enviar a imagem.\",\n      );\n    } finally {\n      setUploading(false);\n      event.target.value = \"\";\n    }\n  }\n\n  function applyImageUrl() {\n    const normalized = imageUrl.trim();\n\n    if (!normalized) {\n      setError(\"Cole o link direto da imagem.\");\n      return;\n    }\n\n    try {\n      const parsed = new URL(normalized);\n\n      if (\n        parsed.protocol !== \"https:\" &&\n        parsed.protocol !== \"http:\"\n      ) {\n        throw new Error();\n      }\n    } catch {\n      setError(\n        \"Informe um link válido começando com http:// ou https://.\",\n      );\n      return;\n    }\n\n    setError(\"\");\n    onChange({\n      imageUrl: normalized,\n      imagePublicId: \"\",\n    });\n  }\n\n  function removeImage() {\n    setImageUrl(\"\");\n    setError(\"\");\n    onChange(null);\n  }\n\n  return (\n    <div className=\"admin-image-upload\">\n      <input\n        ref={inputRef}\n        type=\"file\"\n        accept=\"image/*\"\n        onChange={selectImage}\n        hidden\n      />\n\n      <div className=\"image-source-tabs\">\n        <button\n          type=\"button\"\n          className={\n            source === \"upload\" ? \"active\" : \"\"\n          }\n          onClick={() => {\n            setSource(\"upload\");\n            setError(\"\");\n          }}\n        >\n          <UploadCloud />\n          Arquivo do aparelho\n        </button>\n\n        <button\n          type=\"button\"\n          className={\n            source === \"url\" ? \"active\" : \"\"\n          }\n          onClick={() => {\n            setSource(\"url\");\n            setError(\"\");\n          }}\n        >\n          🔗 Link da imagem\n        </button>\n      </div>\n\n      {source === \"upload\" ? (\n        <button\n          className=\"admin-image-picker\"\n          type=\"button\"\n          disabled={uploading}\n          onClick={() => inputRef.current?.click()}\n        >\n          {uploading ? (\n            <LoaderCircle className=\"spin\" />\n          ) : (\n            <UploadCloud />\n          )}\n\n          <span>\n            <strong>\n              {uploading\n                ? \"Enviando imagem...\"\n                : \"Escolher foto do computador ou celular\"}\n            </strong>\n            <small>\n              JPG, PNG, WEBP ou outra imagem de até\n              5 MB\n            </small>\n          </span>\n        </button>\n      ) : (\n        <div className=\"image-url-picker\">\n          <label className=\"field\">\n            <span>Link direto da imagem</span>\n            <input\n              type=\"url\"\n              value={imageUrl}\n              placeholder=\"https://exemplo.com/foto.jpg\"\n              onChange={(event) =>\n                setImageUrl(event.target.value)\n              }\n              onKeyDown={(event) => {\n                if (event.key === \"Enter\") {\n                  event.preventDefault();\n                  applyImageUrl();\n                }\n              }}\n            />\n          </label>\n\n          <button\n            className=\"secondary\"\n            type=\"button\"\n            onClick={applyImageUrl}\n          >\n            Usar este link\n          </button>\n\n          <small>\n            Use o endereço direto do arquivo de imagem,\n            não o link de uma página.\n          </small>\n        </div>\n      )}\n\n      {value?.imageUrl && (\n        <div className=\"admin-image-preview\">\n          <img\n            src={value.imageUrl}\n            alt=\"Prévia do produto\"\n            onError={() =>\n              setError(\n                \"Não foi possível carregar a prévia. Confira se o link aponta diretamente para uma imagem.\",\n              )\n            }\n          />\n\n          <div>\n            <strong>\n              {value.imagePublicId\n                ? \"Imagem enviada ao Cloudinary\"\n                : \"Imagem adicionada por link\"}\n            </strong>\n\n            <small>\n              A imagem abaixo será usada no cardápio.\n            </small>\n\n            <div className=\"admin-image-actions\">\n              <button\n                className=\"secondary\"\n                type=\"button\"\n                disabled={uploading}\n                onClick={() => {\n                  setSource(\"upload\");\n                  inputRef.current?.click();\n                }}\n              >\n                <ImagePlus />\n                Enviar outra\n              </button>\n\n              <button\n                className=\"secondary\"\n                type=\"button\"\n                onClick={() => setSource(\"url\")}\n              >\n                🔗 Trocar por link\n              </button>\n\n              <button\n                className=\"secondary danger-outline\"\n                type=\"button\"\n                disabled={uploading}\n                onClick={removeImage}\n              >\n                <Trash2 />\n                Remover\n              </button>\n            </div>\n          </div>\n        </div>\n      )}\n\n      {error && (\n        <p className=\"error-text\">{error}</p>\n      )}\n    </div>\n  );\n}" +
      "\n\n/* MESA4_IMAGE_URL_AND_CHECKOUT_SUGGESTION */\n" +
      content.slice(pageStart);

    const suggestionPayloadPattern =
      /(featured:\s*\n\s*form\.get\("featured"\)\s*===\s*"on",)/g;

    const matches = [
      ...content.matchAll(
        suggestionPayloadPattern,
      ),
    ];

    if (matches.length < 2) {
      throw new Error(
        "Não encontrei os dois formulários de produto para salvar a sugestão. Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      suggestionPayloadPattern,
      `$1
          suggestAtCheckout:
            form.get("suggestAtCheckout") === "on",`,
    );

    const createFeatured = `          <label className="admin-check">
            <input
              name="featured"
              type="checkbox"
            />
            Produto em destaque
          </label>`;

    if (!content.includes(createFeatured)) {
      throw new Error(
        "Não encontrei a opção de destaque na criação de produto. Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      createFeatured,
      `${createFeatured}

          <label className="admin-check">
            <input
              name="suggestAtCheckout"
              type="checkbox"
            />
            Sugerir no carrinho
            <small>
              Marque nas bebidas que devem aparecer no fechamento do pedido.
            </small>
          </label>`,
    );

    const editFeatured = `                <label className="admin-check">
                  <input
                    name="featured"
                    type="checkbox"
                    defaultChecked={
                      editingProduct.featured
                    }
                  />
                  Destaque
                </label>`;

    if (!content.includes(editFeatured)) {
      throw new Error(
        "Não encontrei a opção de destaque na edição de produto. Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      editFeatured,
      `${editFeatured}

                <label className="admin-check">
                  <input
                    name="suggestAtCheckout"
                    type="checkbox"
                    defaultChecked={
                      editingProduct.suggestAtCheckout
                    }
                  />
                  Sugerir no carrinho
                </label>`,
    );

    const productPriceBlock = `                <strong>
                  {formatMoney(product.priceCents)}
                </strong>`;

    if (content.includes(productPriceBlock)) {
      content = content.replace(
        productPriceBlock,
        `${productPriceBlock}
                {product.suggestAtCheckout && (
                  <span className="product-suggestion-badge">
                    Sugestão no carrinho
                  </span>
                )}`,
      );
    }

    stage(relative, content);
  }
}

// Checkout --------------------------------------------------------------------

{
  const relative =
    "frontend/src/pages/CheckoutPage.tsx";
  let content = read(relative);

  if (
    !content.includes(
      "/* MESA4_CHECKOUT_SUGGESTIONS */",
    )
  ) {
    content = content.replace(
      /import type \{\s*StoreResponse\s*\} from "\.\.\/types";/,
      `import type {
  MenuResponse,
  Product,
  StoreResponse,
} from "../types";
import { ProductModal } from "../components/ProductModal";`,
    );

    const cartPattern =
      /const \{\s*items,\s*clear\s*\} = useCart\(\);/;

    if (!cartPattern.test(content)) {
      throw new Error(
        "Não encontrei o carrinho no CheckoutPage.tsx. Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      cartPattern,
      `const {
    items,
    clear,
    addItem,
    setOpen,
  } = useCart();`,
    );

    const fulfillmentMarker =
      "  const [fulfillment, setFulfillment]";

    const fulfillmentIndex =
      content.indexOf(fulfillmentMarker);

    if (fulfillmentIndex < 0) {
      throw new Error(
        "Não encontrei o estado de entrega no checkout. Nenhum arquivo foi gravado.",
      );
    }

    const suggestionLogic = `  /* MESA4_CHECKOUT_SUGGESTIONS */
  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: () => api<MenuResponse>("/menu"),
  });
  const [
    suggestionProduct,
    setSuggestionProduct,
  ] = useState<Product | null>(null);

  const suggestedProducts = useMemo(() => {
    const products =
      menu.data?.categories.flatMap(
        (category) => category.products,
      ) ?? [];
    const productsInCart = new Set(
      items.map((item) => item.productId),
    );

    return products
      .filter(
        (product) =>
          product.suggestAtCheckout &&
          !product.soldOut &&
          !productsInCart.has(product.id),
      )
      .slice(0, 4);
  }, [items, menu.data]);

  function addSuggestedProduct(
    product: Product,
  ) {
    if (product.optionGroups.length > 0) {
      setSuggestionProduct(product);
      return;
    }

    addItem({
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      basePriceCents: product.priceCents,
      quantity: 1,
      options: [],
    });

    setOpen(false);
  }

`;

    content =
      content.slice(0, fulfillmentIndex) +
      suggestionLogic +
      content.slice(fulfillmentIndex);

    const summaryMarker = `          ))}
          <hr />`;

    if (!content.includes(summaryMarker)) {
      throw new Error(
        "Não encontrei a lista do resumo do pedido. Nenhum arquivo foi gravado.",
      );
    }

    const suggestionUi = `          ))}

          {suggestedProducts.length > 0 && (
            <section className="checkout-suggestions">
              <div className="checkout-suggestions-heading">
                <small>Que tal uma bebida?</small>
                <h3>Complete seu pedido</h3>
              </div>

              <div className="checkout-suggestion-list">
                {suggestedProducts.map((product) => (
                  <article
                    className="checkout-suggestion-item"
                    key={product.id}
                  >
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                      />
                    ) : (
                      <div className="checkout-suggestion-placeholder">
                        🥤
                      </div>
                    )}

                    <div className="checkout-suggestion-info">
                      <strong>{product.name}</strong>
                      <span>
                        {formatMoney(product.priceCents)}
                      </span>
                    </div>

                    <button
                      className="secondary"
                      type="button"
                      onClick={() =>
                        addSuggestedProduct(product)
                      }
                    >
                      {product.optionGroups.length > 0
                        ? "Escolher"
                        : "+ Adicionar"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          <hr />`;

    content = content.replace(
      summaryMarker,
      suggestionUi,
    );

    const mainCloseMarker = `      </form>
    </main>`;

    if (!content.includes(mainCloseMarker)) {
      throw new Error(
        "Não encontrei o final do checkout. Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      mainCloseMarker,
      `      </form>

      {suggestionProduct && (
        <ProductModal
          product={suggestionProduct}
          onClose={() => {
            setSuggestionProduct(null);
            window.setTimeout(
              () => setOpen(false),
              0,
            );
          }}
        />
      )}
    </main>`,
    );

    stage(relative, content);
  }
}

// CSS -------------------------------------------------------------------------

{
  const relative = "frontend/src/styles.css";
  const current = read(relative);
  const marker =
    "/* Imagem por arquivo/link e sugestões no checkout */";

  if (!current.includes(marker)) {
    stage(
      relative,
      `${current.trimEnd()}\n\n${"\n/* Imagem por arquivo/link e sugestões no checkout */\n.image-source-tabs {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 8px;\n}\n\n.image-source-tabs button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  min-height: 42px;\n  padding: 9px 12px;\n  border: 1px solid var(--border);\n  border-radius: 11px;\n  background: #191713;\n  color: var(--muted);\n  font-weight: 700;\n}\n\n.image-source-tabs button.active {\n  border-color: var(--orange);\n  background: rgba(255, 107, 26, 0.09);\n  color: #fff;\n}\n\n.image-source-tabs svg {\n  width: 18px;\n  height: 18px;\n}\n\n.image-url-picker {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  align-items: end;\n  gap: 10px;\n  padding: 14px;\n  border: 1px dashed #655b50;\n  border-radius: 14px;\n  background: #141310;\n}\n\n.image-url-picker .field {\n  margin: 0;\n}\n\n.image-url-picker > small {\n  grid-column: 1 / -1;\n  color: var(--muted);\n  line-height: 1.45;\n}\n\n.product-suggestion-badge {\n  display: inline-flex;\n  width: fit-content;\n  margin-top: 7px;\n  padding: 4px 8px;\n  border: 1px solid rgba(75, 170, 255, 0.24);\n  border-radius: 999px;\n  background: rgba(75, 170, 255, 0.08);\n  color: #9ed0ff;\n  font-size: 11px;\n  font-weight: 700;\n}\n\n.checkout-suggestions {\n  display: grid;\n  gap: 11px;\n  margin: 17px 0;\n  padding: 14px;\n  border: 1px solid rgba(255, 166, 44, 0.24);\n  border-radius: 15px;\n  background:\n    linear-gradient(\n      145deg,\n      rgba(255, 107, 26, 0.08),\n      rgba(255, 196, 61, 0.025)\n    );\n}\n\n.checkout-suggestions-heading {\n  display: grid;\n  gap: 2px;\n}\n\n.checkout-suggestions-heading small {\n  color: var(--orange);\n  font-weight: 800;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n}\n\n.checkout-suggestions-heading h3 {\n  margin: 0;\n  font-size: 18px;\n}\n\n.checkout-suggestion-list {\n  display: grid;\n  gap: 8px;\n}\n\n.checkout-suggestion-item {\n  display: grid;\n  grid-template-columns: 54px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 10px;\n  padding: 9px;\n  border: 1px solid rgba(255, 255, 255, 0.07);\n  border-radius: 12px;\n  background: rgba(0, 0, 0, 0.16);\n}\n\n.checkout-suggestion-item img,\n.checkout-suggestion-placeholder {\n  width: 54px;\n  height: 54px;\n  border-radius: 9px;\n  object-fit: cover;\n}\n\n.checkout-suggestion-placeholder {\n  display: grid;\n  place-items: center;\n  background: #25211c;\n  font-size: 24px;\n}\n\n.checkout-suggestion-info {\n  display: grid;\n  min-width: 0;\n  gap: 3px;\n}\n\n.checkout-suggestion-info strong {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.checkout-suggestion-info span {\n  color: var(--yellow);\n  font-size: 13px;\n  font-weight: 800;\n}\n\n.checkout-suggestion-item button {\n  padding: 8px 10px;\n  white-space: nowrap;\n}\n\n@media (max-width: 620px) {\n  .image-source-tabs {\n    grid-template-columns: 1fr;\n  }\n\n  .image-url-picker {\n    grid-template-columns: 1fr;\n  }\n\n  .image-url-picker > small {\n    grid-column: auto;\n  }\n\n  .checkout-suggestion-item {\n    grid-template-columns: 48px minmax(0, 1fr);\n  }\n\n  .checkout-suggestion-item img,\n  .checkout-suggestion-placeholder {\n    width: 48px;\n    height: 48px;\n  }\n\n  .checkout-suggestion-item button {\n    grid-column: 1 / -1;\n    width: 100%;\n  }\n}\n"}\n`,
    );
  }
}

// Backup e gravação ------------------------------------------------------------

const backupDirectory = absolute(
  `backup-imagem-bebidas-${Date.now()}`,
);

mkdirSync(backupDirectory, {
  recursive: true,
});

for (const relative of staged.keys()) {
  const source = absolute(relative);

  if (!existsSync(source)) {
    continue;
  }

  const destination = resolve(
    backupDirectory,
    relative,
  );

  mkdirSync(dirname(destination), {
    recursive: true,
  });

  cpSync(source, destination);
}

for (const [relative, content] of staged) {
  const file = absolute(relative);

  mkdirSync(dirname(file), {
    recursive: true,
  });

  writeFileSync(file, content, "utf8");
  console.log(`✓ ${relative}`);
}

console.log(`
Atualização aplicada.

Backup criado em:
  ${backupDirectory}

Agora execute:

  cd backend
  npm run prisma:generate
  npm run prisma:push
  npm run build

  cd ../frontend
  npm run build
`);
