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

function updateAdminMenu() {
  const relative =
    "frontend/src/pages/AdminMenuPage.tsx";
  let content = read(relative);
  const marker =
    "/* MESA4_CATEGORY_MANAGEMENT */";

  if (content.includes(marker)) {
    console.log(
      `↷ ${relative} já possui gerenciamento de categorias`,
    );
    stage(relative, content);
    return;
  }

  const addonSubmitMarker =
    "  function addonSubmit(";
  const addonSubmitIndex =
    content.indexOf(addonSubmitMarker);

  if (addonSubmitIndex < 0) {
    throw new Error(
      "Não encontrei a área de formulários do cardápio. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  const categoryFunctions = `  ${marker}
  function editCategory(category: Category) {
    const name = window
      .prompt(
        "Nome da categoria",
        category.name,
      )
      ?.trim();

    if (!name) {
      return;
    }

    const positionInput = window.prompt(
      "Posição da categoria",
      String(category.position),
    );

    if (positionInput === null) {
      return;
    }

    const position = Number(positionInput);

    if (
      !Number.isInteger(position) ||
      position < 0
    ) {
      window.alert(
        "Informe uma posição inteira igual ou maior que zero.",
      );
      return;
    }

    patch.mutate({
      path: \`/admin/categories/\${category.id}\`,
      body: {
        name,
        position,
      },
    });
  }

  function toggleCategory(category: Category) {
    if (
      category.active &&
      !window.confirm(
        \`Desativar a categoria "\${category.name}"?\\n\\n\` +
          "Os produtos vinculados deixarão de aparecer " +
          "no cardápio do cliente, mas não serão excluídos.",
      )
    ) {
      return;
    }

    patch.mutate({
      path: \`/admin/categories/\${category.id}\`,
      body: {
        active: !category.active,
      },
    });
  }

`;

  content =
    content.slice(0, addonSubmitIndex) +
    categoryFunctions +
    content.slice(addonSubmitIndex);

  const formsSectionMarker =
    '      <section className="admin-form-grid">';
  const formsSectionIndex =
    content.indexOf(formsSectionMarker);

  if (formsSectionIndex < 0) {
    throw new Error(
      "Não encontrei a seção de criação de categorias. " +
        "Nenhum arquivo foi alterado.",
    );
  }

  const categorySection = `      <section className="category-management-section">
        <div className="section-title">
          <div>
            <small>
              Edite ou controle a visibilidade
            </small>
            <h2>Categorias cadastradas</h2>
          </div>

          <span>
            {categories.data?.length ?? 0} categorias
          </span>
        </div>

        <div className="category-management-list">
          {categories.isLoading && (
            <p>Carregando categorias...</p>
          )}

          {categories.data?.length === 0 && (
            <div className="category-management-empty">
              Nenhuma categoria cadastrada.
            </div>
          )}

          {categories.data?.map((category) => {
            const productCount =
              products.data?.filter(
                (product) =>
                  product.categoryId === category.id,
              ).length ?? 0;

            return (
              <article
                className={\`category-management-item \${
                  category.active ? "" : "inactive"
                }\`}
                key={category.id}
              >
                <span className="category-status-dot" />

                <div className="category-management-info">
                  <strong>{category.name}</strong>
                  <small>
                    {productCount === 1
                      ? "1 produto"
                      : \`\${productCount} produtos\`}
                    {" · "}
                    posição {category.position}
                  </small>
                </div>

                <span className="category-visibility-chip">
                  {category.active
                    ? "Visível no cardápio"
                    : "Desativada"}
                </span>

                <div className="category-management-actions">
                  <button
                    className="secondary"
                    type="button"
                    disabled={patch.isPending}
                    onClick={() =>
                      editCategory(category)
                    }
                  >
                    <Pencil />
                    Editar
                  </button>

                  <button
                    className="secondary"
                    type="button"
                    disabled={patch.isPending}
                    onClick={() =>
                      toggleCategory(category)
                    }
                  >
                    {category.active
                      ? "Desativar"
                      : "Ativar"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

`;

  content =
    content.slice(0, formsSectionIndex) +
    categorySection +
    content.slice(formsSectionIndex);

  // Identifica categorias desativadas também nos seletores de produto.
  content = content.replace(
    /\{category\.name\}\s*\n\s*<\/option>/g,
    `{category.name}
                    {!category.active &&
                      " (desativada)"}
                  </option>`,
  );

  stage(relative, content);
}

updateAdminMenu();

{
  const relative = "frontend/src/styles.css";
  const current = read(relative);
  const marker =
    "/* Gerenciamento de categorias */";

  if (!current.includes(marker)) {
    stage(
      relative,
      `${current.trimEnd()}\n\n${"\n/* Gerenciamento de categorias */\n.category-management-section {\n  display: grid;\n  gap: 14px;\n  margin: 28px 0;\n}\n\n.category-management-section .section-title {\n  align-items: flex-end;\n}\n\n.category-management-section .section-title small {\n  color: var(--muted);\n}\n\n.category-management-section .section-title h2 {\n  margin-top: 4px;\n}\n\n.category-management-list {\n  display: grid;\n  gap: 10px;\n}\n\n.category-management-empty {\n  padding: 24px;\n  border: 1px dashed var(--border);\n  border-radius: 14px;\n  color: var(--muted);\n  text-align: center;\n}\n\n.category-management-item {\n  display: grid;\n  grid-template-columns: 12px minmax(0, 1fr) auto auto;\n  align-items: center;\n  gap: 14px;\n  padding: 14px 16px;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: var(--surface);\n}\n\n.category-management-item.inactive {\n  opacity: 0.68;\n  background: rgba(255, 255, 255, 0.025);\n}\n\n.category-status-dot {\n  width: 10px;\n  height: 10px;\n  border-radius: 50%;\n  background: #54dd7d;\n  box-shadow: 0 0 0 4px rgba(84, 221, 125, 0.09);\n}\n\n.category-management-item.inactive .category-status-dot {\n  background: #8f8780;\n  box-shadow: none;\n}\n\n.category-management-info {\n  display: grid;\n  min-width: 0;\n  gap: 3px;\n}\n\n.category-management-info strong {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.category-management-info small {\n  color: var(--muted);\n}\n\n.category-visibility-chip {\n  padding: 5px 9px;\n  border: 1px solid rgba(84, 221, 125, 0.22);\n  border-radius: 999px;\n  background: rgba(84, 221, 125, 0.07);\n  color: #8ff0a9;\n  font-size: 11px;\n  font-weight: 800;\n  white-space: nowrap;\n}\n\n.category-management-item.inactive\n  .category-visibility-chip {\n  border-color: rgba(255, 255, 255, 0.12);\n  background: rgba(255, 255, 255, 0.045);\n  color: var(--muted);\n}\n\n.category-management-actions {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 7px;\n}\n\n.category-management-actions button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  min-height: 38px;\n  padding: 8px 11px;\n}\n\n.category-management-actions svg {\n  width: 16px;\n  height: 16px;\n}\n\n@media (max-width: 760px) {\n  .category-management-item {\n    grid-template-columns: 12px minmax(0, 1fr) auto;\n  }\n\n  .category-management-actions {\n    grid-column: 2 / -1;\n  }\n}\n\n@media (max-width: 520px) {\n  .category-management-item {\n    grid-template-columns: 12px minmax(0, 1fr);\n  }\n\n  .category-visibility-chip {\n    grid-column: 2;\n    width: fit-content;\n  }\n\n  .category-management-actions {\n    grid-column: 1 / -1;\n  }\n\n  .category-management-actions button {\n    flex: 1 1 120px;\n  }\n}\n"}\n`,
    );
  }
}

const backupDirectory = absolute(
  `backup-categorias-${Date.now()}`,
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
Gerenciamento de categorias aplicado.

Backup criado em:
  ${backupDirectory}

Agora execute:

  cd frontend
  npm run build

Não é necessário alterar o Prisma nem o backend.
`);
