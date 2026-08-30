import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function resolve(relative) {
  return path.join(root, relative);
}

function requireFile(relative) {
  const file = resolve(relative);

  if (!fs.existsSync(file)) {
    throw new Error(
      `Arquivo não encontrado: ${relative}. Execute este script na raiz do projeto mesa4.`,
    );
  }

  return file;
}

function read(relative) {
  return fs.readFileSync(requireFile(relative), "utf8");
}

function write(relative, content) {
  fs.writeFileSync(requireFile(relative), content, "utf8");
}

function backup(relative) {
  const file = requireFile(relative);
  const backupFile = `${file}.backup-v28`;

  if (!fs.existsSync(backupFile)) {
    fs.copyFileSync(file, backupFile);
  }
}

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function restoreEol(original, content) {
  return original.includes("\r\n")
    ? content.replace(/\n/g, "\r\n")
    : content;
}

function findBalancedTagRange(
  source,
  start,
  tagName,
) {
  if (start < 0) {
    return null;
  }

  const pattern = new RegExp(
    `<\\/?${tagName}\\b[^>]*>`,
    "g",
  );

  pattern.lastIndex = start;

  let depth = 0;
  let match;

  while ((match = pattern.exec(source))) {
    const token = match[0];

    if (token.startsWith(`</${tagName}`)) {
      depth -= 1;

      if (depth === 0) {
        return {
          start,
          end: pattern.lastIndex,
        };
      }
    } else if (!token.endsWith("/>")) {
      depth += 1;
    }
  }

  return null;
}

function findAddonSection(source) {
  const markers = [
    "Biblioteca de adicionais",
    'onSubmit={addonSubmit}',
    "addon-library-list",
    "addons.data?.map",
  ];

  for (const marker of markers) {
    const markerIndex = source.indexOf(marker);

    if (markerIndex === -1) {
      continue;
    }

    const sectionStart =
      source.lastIndexOf(
        "<section",
        markerIndex,
      );

    const range =
      findBalancedTagRange(
        source,
        sectionStart,
        "section",
      );

    if (range) {
      const block =
        source.slice(
          range.start,
          range.end,
        );

      if (
        block.includes("addons") &&
        (
          block.includes("addonSubmit") ||
          block.includes(
            "Biblioteca de adicionais",
          )
        )
      ) {
        return range;
      }
    }
  }

  return null;
}

function ensureAddonModalState(content) {
  if (
    content.includes(
      "const [addonCreateOpen, setAddonCreateOpen]",
    )
  ) {
    return content;
  }

  const functionStart =
    content.indexOf(
      "export function AdminMenuPage()",
    );

  if (functionStart === -1) {
    throw new Error(
      "Não encontrei AdminMenuPage.",
    );
  }

  const clientMarker =
    content.indexOf(
      "const client = useQueryClient();",
      functionStart,
    );

  if (clientMarker === -1) {
    throw new Error(
      "Não encontrei useQueryClient dentro de AdminMenuPage.",
    );
  }

  const lineEnd =
    content.indexOf(
      "\n",
      clientMarker,
    );

  return (
    content.slice(0, lineEnd + 1) +
    `  const [addonCreateOpen, setAddonCreateOpen] =
    useState(false);
` +
    content.slice(lineEnd + 1)
  );
}

function patchAddonSubmit(content) {
  const start =
    content.indexOf(
      "function addonSubmit(",
    );

  if (start === -1) {
    throw new Error(
      "Não encontrei addonSubmit.",
    );
  }

  let end =
    content.indexOf(
      "async function productSubmit(",
      start,
    );

  if (end === -1) {
    end =
      content.indexOf(
        "function productSubmit(",
        start,
      );
  }

  if (end === -1) {
    throw new Error(
      "Não encontrei o fim de addonSubmit.",
    );
  }

  let block =
    content.slice(start, end);

  if (
    block.includes(
      "setAddonCreateOpen(false)",
    )
  ) {
    return content;
  }

  const successPattern =
    /onSuccess:\s*\(\)\s*=>\s*formElement\.reset\(\),/m;

  if (!successPattern.test(block)) {
    throw new Error(
      "Não encontrei o onSuccess do cadastro de adicional.",
    );
  }

  block = block.replace(
    successPattern,
    `onSuccess: () => {
          formElement.reset();
          setAddonCreateOpen(false);
        },`,
  );

  return (
    content.slice(0, start) +
    block +
    content.slice(end)
  );
}

const addonSection = `      <section
        className="addon-library-section addon-library-clean"
        data-addon-library-clean="v28"
      >
        <div className="addon-library-toolbar">
          <div>
            <small>
              Cadastre uma vez e reutilize nos produtos
            </small>
            <h2>Biblioteca de adicionais</h2>
            <p>
              Expanda somente o adicional que deseja gerenciar.
            </p>
          </div>

          <div className="addon-library-toolbar-actions">
            <span>
              {addons.data?.length ?? 0} cadastrados
            </span>

            <button
              type="button"
              className="primary"
              onClick={() =>
                setAddonCreateOpen(true)
              }
            >
              <Plus />
              Novo adicional
            </button>
          </div>
        </div>

        <div className="addon-accordion-list">
          {addons.isLoading && (
            <p>Carregando adicionais...</p>
          )}

          {addons.data?.length === 0 && (
            <div className="addon-library-empty">
              Nenhum adicional cadastrado.
            </div>
          )}

          {addons.data
            ?.slice()
            .sort(
              (a, b) =>
                a.position - b.position,
            )
            .map((addon) => {
              const usedByProducts =
                products.data?.filter(
                  (product) =>
                    product.optionGroups.some(
                      (group) =>
                        group.options.some(
                          (option) =>
                            option.addonLibraryId ===
                            addon.id,
                        ),
                    ),
                ).length ?? 0;

              return (
                <details
                  className={\`addon-accordion \${
                    addon.active
                      ? ""
                      : "inactive"
                  }\`}
                  key={addon.id}
                >
                  <summary className="addon-accordion-summary">
                    <span className="addon-status-dot" />

                    <div className="addon-accordion-main">
                      <strong>
                        {addon.name}
                      </strong>

                      <small>
                        posição {addon.position}
                        {" · "}
                        {usedByProducts === 1
                          ? "usado em 1 produto"
                          : \`usado em \${usedByProducts} produtos\`}
                      </small>
                    </div>

                    <b className="addon-accordion-price">
                      {formatMoney(
                        addon.priceCents,
                      )}
                    </b>

                    <span className="addon-accordion-status">
                      {addon.active
                        ? "Ativo"
                        : "Desativado"}
                    </span>

                    <span className="addon-accordion-expand">
                      Gerenciar
                    </span>
                  </summary>

                  <div className="addon-accordion-body">
                    <div className="addon-accordion-details">
                      <div>
                        <small>
                          Nome
                        </small>
                        <strong>
                          {addon.name}
                        </strong>
                      </div>

                      <div>
                        <small>
                          Preço padrão
                        </small>
                        <strong>
                          {formatMoney(
                            addon.priceCents,
                          )}
                        </strong>
                      </div>

                      <div>
                        <small>
                          Produtos vinculados
                        </small>
                        <strong>
                          {usedByProducts}
                        </strong>
                      </div>
                    </div>

                    <div className="addon-library-actions addon-accordion-actions">
                      <button
                        className="secondary"
                        type="button"
                        onClick={() =>
                          editAddon(addon)
                        }
                      >
                        <Pencil />
                        Editar
                      </button>

                      <button
                        className="secondary"
                        type="button"
                        disabled={
                          patch.isPending
                        }
                        onClick={() =>
                          patch.mutate({
                            path:
                              \`/admin/addons/\${addon.id}\`,
                            body: {
                              active:
                                !addon.active,
                            },
                          })
                        }
                      >
                        {addon.active
                          ? "Desativar"
                          : "Ativar"}
                      </button>

                      <button
                        className="secondary danger-outline"
                        type="button"
                        aria-label={\`Excluir \${addon.name}\`}
                        onClick={() =>
                          confirm(
                            "Excluir este adicional da biblioteca e removê-lo dos produtos?",
                          ) &&
                          remove.mutate(
                            \`/admin/addons/\${addon.id}\`,
                          )
                        }
                      >
                        <Trash2 />
                        Excluir
                      </button>
                    </div>
                  </div>
                </details>
              );
            })}
        </div>
      </section>`;

const addonModal = `      {addonCreateOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() =>
            setAddonCreateOpen(false)
          }
          data-create-modal="addon"
        >
          <form
            className="modal admin-edit-modal admin-create-modal addon-create-modal"
            onSubmit={addonSubmit}
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <button
              className="icon-button close"
              type="button"
              onClick={() =>
                setAddonCreateOpen(false)
              }
              aria-label="Fechar criação de adicional"
            >
              <X />
            </button>

            <div className="modal-body admin-edit-form">
              <small>Biblioteca de adicionais</small>
              <h2>Novo adicional</h2>

              <p className="muted">
                Cadastre o adicional uma vez e depois vincule
                aos produtos desejados.
              </p>

              <label className="field">
                <span>Nome</span>
                <input
                  name="name"
                  placeholder="Ex.: Bacon"
                  required
                  autoFocus
                />
              </label>

              <div className="field-grid">
                <label className="field">
                  <span>
                    Preço padrão em R$
                  </span>
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
                  <input
                    name="position"
                    type="number"
                    min="0"
                    defaultValue="0"
                  />
                </label>
              </div>

              {createAddon.error && (
                <p className="error-text">
                  {createAddon.error.message}
                </p>
              )}

              <div className="create-modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setAddonCreateOpen(false)
                  }
                >
                  Cancelar
                </button>

                <button
                  className="primary"
                  disabled={
                    createAddon.isPending
                  }
                >
                  <Plus />
                  {createAddon.isPending
                    ? "Criando..."
                    : "Criar adicional"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

`;

function patchPage() {
  backup(
    "frontend/src/pages/AdminMenuPage.tsx",
  );

  const original = read(
    "frontend/src/pages/AdminMenuPage.tsx",
  );

  let content = normalize(original);

  content =
    ensureAddonModalState(content);

  content =
    patchAddonSubmit(content);

  const existingRange =
    findAddonSection(content);

  if (!existingRange) {
    throw new Error(
      "Não encontrei a Biblioteca de adicionais na sua AdminMenuPage.tsx.",
    );
  }

  if (
    !content.includes(
      'data-addon-library-clean="v28"',
    )
  ) {
    content =
      content.slice(
        0,
        existingRange.start,
      ) +
      addonSection +
      content.slice(
        existingRange.end,
      );
  }

  if (
    !content.includes(
      'data-create-modal="addon"',
    )
  ) {
    const markers = [
      '{createModal === "category" && (',
      "{editingProduct && (",
      "</main>",
    ];

    let insertion = -1;

    for (const marker of markers) {
      insertion =
        content.indexOf(marker);

      if (insertion !== -1) {
        break;
      }
    }

    if (insertion === -1) {
      throw new Error(
        "Não encontrei um ponto seguro para inserir o modal de adicional.",
      );
    }

    content =
      content.slice(0, insertion) +
      addonModal +
      content.slice(insertion);
  }

  write(
    "frontend/src/pages/AdminMenuPage.tsx",
    restoreEol(
      original,
      content,
    ),
  );

  console.log(
    "✓ Cadastro de adicional movido para modal",
  );
  console.log(
    "✓ Adicionais convertidos em blocos expansíveis",
  );
}

function patchStyles() {
  const relative =
    "frontend/src/styles.css";

  backup(relative);

  const original = read(relative);
  let content = normalize(original);

  if (
    !content.includes(
      "MESA4_ADDON_LIBRARY_CLEAN_V28",
    )
  ) {
    content += `

/* MESA4_ADDON_LIBRARY_CLEAN_V28 */
.addon-library-clean {
  display: grid;
  gap: 16px;
}

.addon-library-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(255, 255, 255, 0.035);
}

.addon-library-toolbar h2 {
  margin: 3px 0 0;
}

.addon-library-toolbar p {
  margin: 6px 0 0;
  color: rgba(255, 255, 255, 0.62);
}

.addon-library-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.addon-library-toolbar-actions > span {
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
}

.addon-accordion-list {
  display: grid;
  gap: 10px;
}

.addon-accordion {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(255, 255, 255, 0.03);
}

.addon-accordion.inactive {
  opacity: 0.7;
}

.addon-accordion-summary {
  list-style: none;
  display: grid;
  grid-template-columns:
    auto minmax(170px, 1fr) auto auto auto auto;
  align-items: center;
  gap: 13px;
  padding: 15px 16px;
  cursor: pointer;
  user-select: none;
}

.addon-accordion-summary::-webkit-details-marker {
  display: none;
}

.addon-accordion-summary::after {
  content: "⌄";
  font-size: 19px;
  line-height: 1;
  opacity: 0.62;
  transition: transform 0.18s ease;
}

.addon-accordion[open]
  .addon-accordion-summary::after {
  transform: rotate(180deg);
}

.addon-status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #72d69a;
  box-shadow: 0 0 0 4px rgba(114, 214, 154, 0.1);
}

.addon-accordion.inactive
  .addon-status-dot {
  background: rgba(255, 255, 255, 0.34);
  box-shadow: none;
}

.addon-accordion-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.addon-accordion-main small {
  color: rgba(255, 255, 255, 0.55);
}

.addon-accordion-price {
  white-space: nowrap;
}

.addon-accordion-status {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(114, 214, 154, 0.1);
  color: #92e2b1;
  font-size: 11px;
  font-weight: 700;
}

.addon-accordion.inactive
  .addon-accordion-status {
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.55);
}

.addon-accordion-expand {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.55);
}

.addon-accordion[open]
  .addon-accordion-expand {
  visibility: hidden;
}

.addon-accordion-body {
  display: grid;
  gap: 14px;
  padding: 14px 16px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.12);
}

.addon-accordion-details {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.addon-accordion-details > div {
  display: grid;
  gap: 3px;
  padding: 11px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
}

.addon-accordion-details small {
  color: rgba(255, 255, 255, 0.52);
}

.addon-accordion-actions {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
}

.addon-create-modal {
  width: min(620px, calc(100vw - 28px));
}

@media (max-width: 760px) {
  .addon-library-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .addon-library-toolbar-actions {
    justify-content: space-between;
  }

  .addon-accordion-summary {
    grid-template-columns:
      auto minmax(0, 1fr) auto;
  }

  .addon-accordion-status,
  .addon-accordion-expand {
    display: none;
  }

  .addon-accordion-details {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .addon-library-toolbar-actions {
    display: grid;
  }

  .addon-library-toolbar-actions > button {
    width: 100%;
  }

  .addon-accordion-price {
    font-size: 13px;
  }

  .addon-accordion-actions {
    display: grid;
  }

  .addon-accordion-actions > button {
    width: 100%;
  }
}
`;
  }

  write(
    relative,
    restoreEol(
      original,
      content,
    ),
  );

  console.log(
    "✓ Estilos da biblioteca limpa adicionados",
  );
}

patchPage();
patchStyles();

console.log("");
console.log(
  "BIBLIOTECA_ADICIONAIS_LIMPA_V28_APLICADA",
);
console.log("");
console.log("Agora rode:");
console.log("  cd frontend");
console.log("  npm run build");
