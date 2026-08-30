import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relative = "frontend/src/pages/CheckoutPage.tsx";
const file = path.join(root, relative);
const backup = `${file}.backup-v29`;

if (!fs.existsSync(file)) {
  throw new Error(
    `Não encontrei ${relative}. Execute este script na raiz do mesa4.`,
  );
}

if (!fs.existsSync(backup)) {
  throw new Error(
    `Não encontrei ${relative}.backup-v29. Esse arquivo é necessário para desfazer somente a v29 quebrada.`,
  );
}

// Guarda também o estado quebrado para inspeção/retorno, se necessário.
const brokenBackup = `${file}.quebrado-v29`;

if (!fs.existsSync(brokenBackup)) {
  fs.copyFileSync(file, brokenBackup);
}

// Restaura exatamente o CheckoutPage anterior à v29.
// Isso mantém v21/v22/etc, porque o backup foi criado pela própria v29.
fs.copyFileSync(backup, file);

const original = fs.readFileSync(file, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
let content = original.replace(/\r\n/g, "\n");

function findBalancedTagRange(
  source,
  start,
  tagName,
) {
  if (start < 0) return null;

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

// 1) Importa useEffect sem alterar os outros imports.
if (!/\buseEffect\b/.test(content.slice(0, 1200))) {
  const reactImport =
    /import\s*\{([^}]*)\}\s*from\s*["']react["'];/m;

  const match = content.match(reactImport);

  if (!match) {
    throw new Error(
      'Não encontrei o import de "react" no CheckoutPage.',
    );
  }

  const names = match[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  names.push("useEffect");

  content = content.replace(
    reactImport,
    `import { ${[...new Set(names)].join(", ")} } from "react";`,
  );
}

console.log("✓ CheckoutPage restaurado do backup pré-v29");

// 2) Insere o useEffect imediatamente depois de canCalculateDelivery.
if (!content.includes("MESA4_AUTO_DELIVERY_V29_1")) {
  const start =
    content.indexOf(
      "const canCalculateDelivery",
    );

  if (start === -1) {
    throw new Error(
      "Não encontrei canCalculateDelivery no checkout restaurado.",
    );
  }

  const nextFunctionCandidates = [
    content.indexOf(
      "\n  function searchPostalCode",
      start,
    ),
    content.indexOf(
      "\n  function calculateDelivery",
      start,
    ),
    content.indexOf(
      "\n  function submit",
      start,
    ),
  ].filter((index) => index !== -1);

  if (!nextFunctionCandidates.length) {
    throw new Error(
      "Não consegui localizar o fim de canCalculateDelivery.",
    );
  }

  const insertAt = Math.min(
    ...nextFunctionCandidates,
  );

  const effect = `

  /* MESA4_AUTO_DELIVERY_V29_1 */
  useEffect(() => {
    if (
      fulfillment !== "DELIVERY" ||
      !dynamicDeliveryEnabled ||
      !canCalculateDelivery
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      deliveryQuote.mutate();
    }, 650);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    fulfillment,
    dynamicDeliveryEnabled,
    canCalculateDelivery,
    postalCode,
    street,
    number,
    neighborhood,
    city,
    stateCode,
  ]);
`;

  content =
    content.slice(0, insertAt) +
    effect +
    content.slice(insertAt);
}

console.log("✓ Frete automático ativado com debounce de 650 ms");

// 3) Remove a função manual calculateDelivery.
{
  const start =
    content.indexOf(
      "\n  function calculateDelivery",
    );

  if (start !== -1) {
    const end =
      content.indexOf(
        "\n  function submit",
        start,
      );

    if (end === -1) {
      throw new Error(
        "Encontrei calculateDelivery, mas não encontrei function submit depois dela.",
      );
    }

    content =
      content.slice(0, start) +
      "\n" +
      content.slice(end);
  }
}

// 4) Remove onBlur do número que chamava calculateDelivery.
content = content.replace(
  /\s*onBlur=\{\(\)\s*=>\s*\{\s*if\s*\(\s*dynamicDeliveryEnabled\s*&&\s*canCalculateDelivery\s*\)\s*\{\s*calculateDelivery\(\);\s*\}\s*\}\}/m,
  "",
);

// 5) Dentro da delivery-quote-box, remove SOMENTE o botão.
// Não substitui a caixa inteira, evitando quebrar JSX.
{
  const quoteStart =
    content.indexOf(
      '<div className="delivery-quote-box">',
    );

  if (quoteStart === -1) {
    throw new Error(
      'Não encontrei <div className="delivery-quote-box"> no checkout restaurado.',
    );
  }

  const quoteRange =
    findBalancedTagRange(
      content,
      quoteStart,
      "div",
    );

  if (!quoteRange) {
    throw new Error(
      "Não consegui localizar o fechamento de delivery-quote-box.",
    );
  }

  let block =
    content.slice(
      quoteRange.start,
      quoteRange.end,
    );

  const buttonStart =
    block.indexOf("<button");

  let buttonRemoved = false;

  if (buttonStart !== -1) {
    const buttonRange =
      findBalancedTagRange(
        block,
        buttonStart,
        "button",
      );

    if (
      buttonRange &&
      block
        .slice(
          buttonRange.start,
          buttonRange.end,
        )
        .includes("calculateDelivery")
    ) {
      block =
        block.slice(0, buttonRange.start) +
        block.slice(buttonRange.end);

      buttonRemoved = true;
    }
  }

  if (!buttonRemoved) {
    // Fallback para versões com formatação diferente.
    block = block.replace(
      /<button\b[\s\S]*?onClick=\{calculateDelivery\}[\s\S]*?<\/button>/m,
      "",
    );
  }

  const openTagEnd =
    block.indexOf(">") + 1;

  const status = `
                  {!canCalculateDelivery &&
                    !deliveryQuote.data && (
                      <div className="delivery-auto-status">
                        <span className="delivery-auto-dot" />
                        <span>
                          Preencha o endereço para calcular a entrega.
                        </span>
                      </div>
                    )}

                  {canCalculateDelivery &&
                    deliveryQuote.isPending && (
                      <div className="delivery-auto-status calculating">
                        <span className="delivery-auto-spinner" />
                        <span>
                          Calculando entrega automaticamente...
                        </span>
                      </div>
                    )}
`;

  block =
    block.slice(0, openTagEnd) +
    status +
    block.slice(openTagEnd);

  content =
    content.slice(0, quoteRange.start) +
    block +
    content.slice(quoteRange.end);
}

console.log("✓ Botão manual de calcular frete removido sem substituir o JSX da caixa");

// 6) Ajusta o texto do resumo da entrega sem mudar sua estrutura.
content = content.replace(
  /"Calcule o endereço"/g,
  `"Preencha o endereço"`,
);

// 7) Ajusta somente o texto do botão final.
// A condição de disabled já existente continua impedindo finalizar
// até existir deliveryQuote.data.
content = content.replace(
  /"Calcule a entrega para continuar"/g,
  `"Calculando entrega..."`,
);

// Para endereço ainda incompleto, usa texto mais claro quando a
// estrutura simples conhecida estiver presente.
content = content.replace(
  /:\s*fulfillment\s*===\s*"DELIVERY"\s*&&\s*dynamicDeliveryEnabled\s*&&\s*!deliveryQuote\.data\s*\?\s*"Calculando entrega\.\.\."\s*:/m,
  `: fulfillment === "DELIVERY" &&
                  dynamicDeliveryEnabled &&
                  !deliveryQuote.data
                ? canCalculateDelivery
                  ? "Calculando entrega..."
                  : "Preencha o endereço para continuar"
                :`,
);

fs.writeFileSync(
  file,
  content.replace(/\n/g, eol),
  "utf8",
);

// CSS: a v29 já pode ter adicionado estes estilos. Se não tiver,
// adiciona agora. Não é necessário restaurar styles.css.
const stylesRelative = "frontend/src/styles.css";
const stylesFile = path.join(root, stylesRelative);

if (fs.existsSync(stylesFile)) {
  const stylesOriginal =
    fs.readFileSync(stylesFile, "utf8");

  let styles =
    stylesOriginal.replace(/\r\n/g, "\n");

  if (!styles.includes("MESA4_AUTO_DELIVERY_V29_STYLES")) {
    styles += `

/* MESA4_AUTO_DELIVERY_V29_STYLES */
.delivery-auto-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 13px;
  margin-bottom: 10px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
}

.delivery-auto-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
}

.delivery-auto-spinner {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: currentColor;
  animation: mesa4-delivery-spin 0.75s linear infinite;
}

@keyframes mesa4-delivery-spin {
  to {
    transform: rotate(360deg);
  }
}
`;

    fs.writeFileSync(
      stylesFile,
      stylesOriginal.includes("\r\n")
        ? styles.replace(/\n/g, "\r\n")
        : styles,
      "utf8",
    );
  }
}

console.log("");
console.log("FRETE_AUTOMATICO_V29_1_CORRIGIDO");
console.log("");
console.log("Agora rode:");
console.log("  cd frontend");
console.log("  npm run build");
