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

function updateCheckout() {
  const relative =
    "frontend/src/pages/CheckoutPage.tsx";
  let content = read(relative);
  const marker =
    "MESA4_CHECKOUT_REMOVE_ITEM";

  if (content.includes(marker)) {
    console.log(
      `↷ ${relative} já possui remoção no resumo`,
    );
    stage(relative, content);
    return;
  }

  if (!content.includes("Trash2")) {
    const iconImport =
      /import\s*\{([^}]*)\}\s*from "lucide-react";/;

    const match = content.match(iconImport);

    if (!match) {
      throw new Error(
        "Não encontrei o import de ícones no checkout. " +
          "Nenhum arquivo foi alterado.",
      );
    }

    const icons = match[1].trim();

    content = content.replace(
      iconImport,
      `import { ${icons}, Trash2 } from "lucide-react";`,
    );
  }

  const cartPattern =
    /const\s*\{([\s\S]*?)\}\s*=\s*useCart\(\);/;
  const cartMatch = content.match(cartPattern);

  if (!cartMatch) {
    throw new Error(
      "Não encontrei o estado do carrinho no checkout. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  if (
    !cartMatch[1]
      .split(",")
      .map((item) => item.trim())
      .includes("removeItem")
  ) {
    const existingItems = cartMatch[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    existingItems.push("removeItem");

    content = content.replace(
      cartPattern,
      `const {
    ${existingItems.join(",\n    ")},
  } = useCart();`,
    );
  }

  const listStart = content.indexOf(
    "          {items.map((item) => (",
  );

  if (listStart < 0) {
    throw new Error(
      "Não encontrei os itens do resumo final. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  const listEndMarker = "          ))}";
  const listEnd = content.indexOf(
    listEndMarker,
    listStart,
  );

  if (listEnd < 0) {
    throw new Error(
      "Não encontrei o final da lista do resumo. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  const newList = `          {/* ${marker} */}
          {items.map((item) => (
            <div
              className="summary-item checkout-summary-item"
              key={item.key}
            >
              <span className="checkout-summary-copy">
                {item.quantity}x {item.productName}
                <small>
                  {item.options
                    .map(
                      (option) =>
                        option.optionName,
                    )
                    .join(", ")}
                </small>
              </span>

              <div className="checkout-summary-actions">
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

                <button
                  className="checkout-remove-item"
                  type="button"
                  title="Remover item"
                  aria-label={\`Remover \${item.productName} do carrinho\`}
                  onClick={() =>
                    removeItem(item.key)
                  }
                >
                  <Trash2 />
                </button>
              </div>
            </div>
          ))}`;

  content =
    content.slice(0, listStart) +
    newList +
    content.slice(
      listEnd + listEndMarker.length,
    );

  stage(relative, content);
}

function updateSettings() {
  const relative =
    "frontend/src/pages/AdminSettingsPage.tsx";
  let content = read(relative);
  const marker =
    "MESA4_STORE_BRANDING_UPLOAD";

  if (content.includes(marker)) {
    console.log(
      `↷ ${relative} já possui upload de identidade visual`,
    );
    stage(relative, content);
    return;
  }

  const reactImport =
    /import\s*\{([\s\S]*?)\}\s*from "react";/;
  const reactMatch = content.match(reactImport);

  if (!reactMatch) {
    throw new Error(
      "Não encontrei o import do React nas configurações. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  const imports = reactMatch[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!imports.includes("ChangeEvent")) {
    imports.unshift("ChangeEvent");
  }

  if (!imports.includes("useRef")) {
    const stateIndex = imports.indexOf("useState");

    if (stateIndex >= 0) {
      imports.splice(stateIndex, 0, "useRef");
    } else {
      imports.push("useRef");
    }
  }

  content = content.replace(
    reactImport,
    `import {
  ${imports.join(",\n  ")},
} from "react";`,
  );

  const pageMarker =
    "export function AdminSettingsPage()";
  const pageIndex = content.indexOf(pageMarker);

  if (pageIndex < 0) {
    throw new Error(
      "Não encontrei o componente de configurações. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  content =
    content.slice(0, pageIndex) +
    `/* ${marker} */
${"type UploadedStoreImage = {\n  imageUrl: string;\n  imagePublicId?: string;\n};\n\ntype StoreImageFieldProps = {\n  name: string;\n  label: string;\n  help: string;\n  kind: \"logo\" | \"cover\";\n  value: string;\n  onChange: (value: string) => void;\n};\n\nfunction StoreImageField({\n  name,\n  label,\n  help,\n  kind,\n  value,\n  onChange,\n}: StoreImageFieldProps) {\n  const fileInputRef =\n    useRef<HTMLInputElement>(null);\n  const [uploading, setUploading] =\n    useState(false);\n  const [error, setError] = useState(\"\");\n\n  async function uploadImage(\n    event: ChangeEvent<HTMLInputElement>,\n  ) {\n    const file = event.target.files?.[0];\n\n    if (!file) {\n      return;\n    }\n\n    if (!file.type.startsWith(\"image/\")) {\n      setError(\"Selecione um arquivo de imagem.\");\n      event.target.value = \"\";\n      return;\n    }\n\n    if (file.size > 5 * 1024 * 1024) {\n      setError(\"A imagem deve ter no máximo 5 MB.\");\n      event.target.value = \"\";\n      return;\n    }\n\n    setUploading(true);\n    setError(\"\");\n\n    try {\n      const body = new FormData();\n      body.append(\"image\", file);\n\n      const uploaded =\n        await adminApi<UploadedStoreImage>(\n          \"/admin/uploads/images\",\n          {\n            method: \"POST\",\n            body,\n          },\n        );\n\n      onChange(uploaded.imageUrl);\n    } catch (uploadError) {\n      setError(\n        uploadError instanceof Error\n          ? uploadError.message\n          : \"Não foi possível enviar a imagem.\",\n      );\n    } finally {\n      setUploading(false);\n      event.target.value = \"\";\n    }\n  }\n\n  return (\n    <div\n      className={`store-image-field ${kind}`}\n    >\n      <div className=\"store-image-field-heading\">\n        <span>{label}</span>\n        <small>{help}</small>\n      </div>\n\n      <input\n        name={name}\n        type=\"url\"\n        value={value}\n        placeholder=\"https://...\"\n        onChange={(event) => {\n          setError(\"\");\n          onChange(event.target.value);\n        }}\n      />\n\n      <input\n        ref={fileInputRef}\n        type=\"file\"\n        accept=\"image/*\"\n        hidden\n        onChange={uploadImage}\n      />\n\n      <div className=\"store-image-field-actions\">\n        <button\n          className=\"secondary\"\n          type=\"button\"\n          disabled={uploading}\n          onClick={() =>\n            fileInputRef.current?.click()\n          }\n        >\n          {uploading\n            ? \"Enviando imagem...\"\n            : \"Escolher arquivo\"}\n        </button>\n\n        {value && (\n          <button\n            className=\"secondary danger-outline\"\n            type=\"button\"\n            disabled={uploading}\n            onClick={() => {\n              setError(\"\");\n              onChange(\"\");\n            }}\n          >\n            Remover imagem\n          </button>\n        )}\n      </div>\n\n      {value && (\n        <div\n          className={`store-image-preview ${kind}`}\n        >\n          <img\n            src={value}\n            alt={`Prévia: ${label}`}\n            onError={() =>\n              setError(\n                \"Não foi possível carregar a imagem. Confira o link ou envie outro arquivo.\",\n              )\n            }\n          />\n        </div>\n      )}\n\n      {error && (\n        <p className=\"error-text\">{error}</p>\n      )}\n    </div>\n  );\n}"}

` +
    content.slice(pageIndex);

  const pixStateEndMarker =
    '      "MERCADO_PAGO",\n    );';
  const pixStateEnd = content.indexOf(
    pixStateEndMarker,
    pageIndex,
  );

  if (pixStateEnd < 0) {
    throw new Error(
      "Não encontrei o estado do pagamento nas configurações. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  const pixStateInsert =
    pixStateEnd + pixStateEndMarker.length;

  content =
    content.slice(0, pixStateInsert) +
    `
  const [logoUrl, setLogoUrl] =
    useState("");
  const [heroImageUrl, setHeroImageUrl] =
    useState("");` +
    content.slice(pixStateInsert);

  const pixEffectEndMarker =
    "  }, [settings.data?.pixPaymentMode]);";
  const pixEffectEnd = content.indexOf(
    pixEffectEndMarker,
    pixStateInsert,
  );

  if (pixEffectEnd < 0) {
    throw new Error(
      "Não encontrei a sincronização das configurações. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  const pixEffectInsert =
    pixEffectEnd + pixEffectEndMarker.length;

  content =
    content.slice(0, pixEffectInsert) +
    `

  useEffect(() => {
    setLogoUrl(
      settings.data?.logoUrl ?? "",
    );
    setHeroImageUrl(
      settings.data?.heroImageUrl ?? "",
    );
  }, [
    settings.data?.logoUrl,
    settings.data?.heroImageUrl,
  ]);` +
    content.slice(pixEffectInsert);

  const oldSubmitImages = `      logoUrl: form.get("logoUrl") || "",
      heroImageUrl:
        form.get("heroImageUrl") || "",`;

  if (!content.includes(oldSubmitImages)) {
    throw new Error(
      "Não encontrei os campos atuais de logo e capa no envio. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  content = content.replace(
    oldSubmitImages,
    `      logoUrl: logoUrl.trim(),
      heroImageUrl: heroImageUrl.trim(),`,
  );

  const oldImageFields = `            <label className="field">
              <span>URL da logo</span>
              <input
                name="logoUrl"
                type="url"
                defaultValue={s.logoUrl}
              />
            </label>

            <label className="field">
              <span>URL da capa</span>
              <input
                name="heroImageUrl"
                type="url"
                defaultValue={s.heroImageUrl}
              />
            </label>`;

  if (!content.includes(oldImageFields)) {
    throw new Error(
      "Não encontrei os campos visuais atuais de logo e capa. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  content = content.replace(
    oldImageFields,
    `            <div className="store-branding-fields">
              <StoreImageField
                name="logoUrl"
                label="Logo da loja"
                help="Cole um link ou escolha uma imagem do computador/celular."
                kind="logo"
                value={logoUrl}
                onChange={setLogoUrl}
              />

              <StoreImageField
                name="heroImageUrl"
                label="Capa do cardápio"
                help="Cole um link ou escolha o banner do computador/celular."
                kind="cover"
                value={heroImageUrl}
                onChange={setHeroImageUrl}
              />
            </div>`,
  );

  stage(relative, content);
}

updateCheckout();
updateSettings();

{
  const relative = "frontend/src/styles.css";
  const current = read(relative);
  const marker =
    "/* Remover item no checkout e upload da logo/capa */";

  if (!current.includes(marker)) {
    stage(
      relative,
      `${current.trimEnd()}\n\n${"\n/* Remover item no checkout e upload da logo/capa */\n.checkout-summary-item {\n  align-items: center;\n  gap: 12px;\n}\n\n.checkout-summary-copy {\n  display: grid;\n  min-width: 0;\n  flex: 1;\n  gap: 3px;\n}\n\n.checkout-summary-copy > small {\n  color: var(--muted);\n  line-height: 1.4;\n}\n\n.checkout-summary-actions {\n  display: flex;\n  align-items: center;\n  flex: 0 0 auto;\n  gap: 9px;\n}\n\n.checkout-summary-actions > b {\n  white-space: nowrap;\n}\n\n.checkout-remove-item {\n  display: grid;\n  width: 36px;\n  height: 36px;\n  place-items: center;\n  padding: 0;\n  border: 1px solid rgba(255, 108, 108, 0.28);\n  border-radius: 10px;\n  background: rgba(255, 88, 88, 0.07);\n  color: #ff9b9b;\n}\n\n.checkout-remove-item:hover {\n  border-color: rgba(255, 108, 108, 0.58);\n  background: rgba(255, 88, 88, 0.14);\n  color: #ffd1d1;\n}\n\n.checkout-remove-item svg {\n  width: 17px;\n  height: 17px;\n}\n\n.store-branding-fields {\n  display: grid;\n  grid-template-columns: 1fr;\n  gap: 15px;\n  grid-column: 1 / -1;\n}\n\n.store-image-field {\n  display: grid;\n  gap: 10px;\n  min-width: 0;\n  padding: 15px;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.025);\n}\n\n.store-image-field-heading {\n  display: grid;\n  gap: 3px;\n}\n\n.store-image-field-heading > span {\n  font-weight: 700;\n}\n\n.store-image-field-heading > small {\n  color: var(--muted);\n  line-height: 1.45;\n}\n\n.store-image-field-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n.store-image-field-actions button {\n  min-height: 39px;\n}\n\n.store-image-preview {\n  overflow: hidden;\n  border: 1px solid var(--border);\n  border-radius: 12px;\n  background:\n    linear-gradient(\n      45deg,\n      rgba(255, 255, 255, 0.035) 25%,\n      transparent 25%,\n      transparent 75%,\n      rgba(255, 255, 255, 0.035) 75%\n    ),\n    linear-gradient(\n      45deg,\n      rgba(255, 255, 255, 0.035) 25%,\n      transparent 25%,\n      transparent 75%,\n      rgba(255, 255, 255, 0.035) 75%\n    ),\n    #171511;\n  background-position:\n    0 0,\n    10px 10px;\n  background-size: 20px 20px;\n}\n\n.store-image-preview img {\n  display: block;\n  width: 100%;\n}\n\n.store-image-preview.logo {\n  display: grid;\n  min-height: 150px;\n  place-items: center;\n  padding: 18px;\n}\n\n.store-image-preview.logo img {\n  max-width: 280px;\n  max-height: 130px;\n  object-fit: contain;\n}\n\n.store-image-preview.cover img {\n  aspect-ratio: 16 / 5;\n  max-height: 310px;\n  object-fit: cover;\n}\n\n@media (max-width: 620px) {\n  .checkout-summary-item {\n    align-items: flex-start;\n  }\n\n  .checkout-summary-actions {\n    display: grid;\n    justify-items: end;\n  }\n\n  .store-image-field-actions {\n    display: grid;\n    grid-template-columns: 1fr;\n  }\n\n  .store-image-field-actions button {\n    width: 100%;\n  }\n\n  .store-image-preview.cover img {\n    aspect-ratio: 16 / 7;\n  }\n}\n"}\n`,
    );
  }
}

const backupDirectory = absolute(
  `backup-checkout-branding-${Date.now()}`,
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
Remoção no checkout e upload de logo/capa aplicados.

Backup criado em:
  ${backupDirectory}

Agora execute:

  cd frontend
  npm run build

Não é necessário alterar o Prisma nem o backend.
`);
