import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relative = "frontend/src/pages/CheckoutPage.tsx";

function resolve(relativePath) {
  return path.join(root, relativePath);
}

function requireFile(relativePath) {
  const file = resolve(relativePath);

  if (!fs.existsSync(file)) {
    throw new Error(
      `Arquivo não encontrado: ${relativePath}. Execute este script na raiz do projeto mesa4.`,
    );
  }

  return file;
}

const file = requireFile(relative);
const original = fs.readFileSync(file, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
let content = original.replace(/\r\n/g, "\n");

const backup = `${file}.backup-v29`;
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
}

// 1) Garante useEffect.
if (!/\buseEffect\b/.test(content.slice(0, 800))) {
  const reactImport =
    /import\s*\{([^}]*)\}\s*from\s*["']react["'];/m;

  const match = content.match(reactImport);

  if (!match) {
    throw new Error(
      'Não encontrei o import de React em CheckoutPage.tsx.',
    );
  }

  const names = match[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  if (!names.includes("useEffect")) {
    names.push("useEffect");
  }

  content = content.replace(
    reactImport,
    `import { ${names.join(", ")} } from "react";`,
  );

  console.log("✓ useEffect importado");
}

// 2) Remove função manual calculateDelivery, se existir.
content = content.replace(
  /\n\s*function calculateDelivery\(\)\s*\{\s*if\s*\(canCalculateDelivery\)\s*\{\s*deliveryQuote\.mutate\(\);\s*\}\s*\}\s*/m,
  "\n",
);

// 3) Adiciona cálculo automático depois de canCalculateDelivery.
if (!content.includes("MESA4_AUTO_DELIVERY_V29")) {
  const canCalcPattern =
    /const\s+canCalculateDelivery\s*=\s*[\s\S]*?stateCode\.trim\(\)\.length\s*===\s*2\s*;/m;

  const match = content.match(canCalcPattern);

  if (!match || match.index === undefined) {
    throw new Error(
      "Não encontrei canCalculateDelivery no CheckoutPage.tsx.",
    );
  }

  const insertAt = match.index + match[0].length;

  const effect = `

  /* MESA4_AUTO_DELIVERY_V29 */
  useEffect(() => {
    if (
      fulfillment !== "DELIVERY" ||
      !dynamicDeliveryEnabled
    ) {
      return;
    }

    if (!canCalculateDelivery) {
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
  ]);`;

  content =
    content.slice(0, insertAt) +
    effect +
    content.slice(insertAt);

  console.log("✓ Cálculo automático com debounce de 650 ms");
}

// 4) Remove cálculo manual no onBlur do número.
content = content.replace(
  /\s*onBlur=\{\(\)\s*=>\s*\{\s*if\s*\(dynamicDeliveryEnabled\s*&&\s*canCalculateDelivery\)\s*\{\s*calculateDelivery\(\);\s*\}\s*\}\}/m,
  "",
);

// 5) Substitui a caixa com botão por feedback automático.
// Aceita variações de espaçamento/format.
const quoteBoxPattern =
  /\{dynamicDeliveryEnabled\s*&&\s*\(\s*<div className="delivery-quote-box">[\s\S]*?<\/div>\s*\)\}/m;

const quoteBoxReplacement = `{dynamicDeliveryEnabled && (
                <div
                  className="delivery-quote-box auto-delivery-quote"
                  data-auto-delivery-v29="true"
                >
                  {!canCalculateDelivery && !deliveryQuote.data && (
                    <div className="delivery-auto-status">
                      <span className="delivery-auto-dot" />
                      <span>
                        Preencha o endereço para calcular a entrega.
                      </span>
                    </div>
                  )}

                  {canCalculateDelivery && deliveryQuote.isPending && (
                    <div className="delivery-auto-status calculating">
                      <span className="delivery-auto-spinner" />
                      <span>Calculando entrega automaticamente...</span>
                    </div>
                  )}

                  {deliveryQuote.data && (
                    <div className="delivery-quote-result">
                      <strong>
                        Entrega:{" "}
                        {formatMoney(
                          deliveryQuote.data.deliveryFeeCents,
                        )}
                      </strong>

                      {deliveryQuote.data.mode === "DISTANCE" && (
                        <span>
                          {deliveryQuote.data.distanceKm?.toFixed(1)} km
                          {deliveryQuote.data.durationMinutes
                            ? \` · cerca de \${deliveryQuote.data.durationMinutes} min de trajeto\`
                            : ""}
                        </span>
                      )}
                    </div>
                  )}

                  {deliveryQuote.error && (
                    <div className="delivery-auto-error">
                      <p className="error-text">
                        {deliveryQuote.error.message}
                      </p>
                      <small>
                        Confira CEP, rua, número, bairro, cidade e estado.
                        Ao corrigir o endereço, o cálculo será tentado novamente.
                      </small>
                    </div>
                  )}
                </div>
              )}`;

if (quoteBoxPattern.test(content)) {
  content = content.replace(
    quoteBoxPattern,
    quoteBoxReplacement,
  );
  console.log("✓ Botão manual de calcular frete removido");
} else if (!content.includes('data-auto-delivery-v29="true"')) {
  // Fallback: procura somente o botão manual e o remove.
  const buttonPattern =
    /<button[\s\S]*?onClick=\{calculateDelivery\}[\s\S]*?<\/button>/m;

  if (buttonPattern.test(content)) {
    content = content.replace(buttonPattern, "");

    console.log(
      "✓ Botão manual removido (estrutura local diferente)",
    );
  } else {
    throw new Error(
      'Não encontrei a área do botão "Calcular valor da entrega".',
    );
  }
}

// 6) Atualiza o texto da entrega no resumo.
content = content.replace(
  /\?\s*"Calcule o endereço"\s*:\s*formatMoney\(deliveryFee\)/m,
  `? deliveryQuote.isPending
                    ? "Calculando..."
                    : canCalculateDelivery
                      ? "Calculando..."
                      : "Preencha o endereço"
                  : formatMoney(deliveryFee)`,
);

// Pode haver versão alterada do texto.
content = content.replace(
  /"Calcule a entrega para continuar"/g,
  `"Calculando entrega..."`,
);

// 7) Caso o botão final ainda use condição e texto antigo, melhora a mensagem
// para endereço incompleto vs cálculo em andamento.
const finalButtonTernary =
  /fulfillment\s*===\s*"DELIVERY"\s*&&\s*dynamicDeliveryEnabled\s*&&\s*!deliveryQuote\.data\s*\?\s*"Calculando entrega\.\.\."/m;

if (finalButtonTernary.test(content)) {
  content = content.replace(
    finalButtonTernary,
    `fulfillment === "DELIVERY" &&
                  dynamicDeliveryEnabled &&
                  !deliveryQuote.data
                ? canCalculateDelivery
                  ? "Calculando entrega..."
                  : "Preencha o endereço para continuar"`,
  );
}

// 8) Salva.
fs.writeFileSync(
  file,
  content.replace(/\n/g, eol),
  "utf8",
);

// 9) CSS.
const stylesRelative = "frontend/src/styles.css";
const stylesFile = requireFile(stylesRelative);
const stylesOriginal = fs.readFileSync(stylesFile, "utf8");
let styles = stylesOriginal.replace(/\r\n/g, "\n");
const stylesBackup = `${stylesFile}.backup-v29`;

if (!fs.existsSync(stylesBackup)) {
  fs.copyFileSync(stylesFile, stylesBackup);
}

if (!styles.includes("MESA4_AUTO_DELIVERY_V29_STYLES")) {
  styles += `

/* MESA4_AUTO_DELIVERY_V29_STYLES */
.auto-delivery-quote {
  display: grid;
  gap: 10px;
}

.delivery-auto-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 13px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
}

.delivery-auto-status.calculating {
  color: rgba(255, 255, 255, 0.9);
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

.delivery-auto-error {
  display: grid;
  gap: 3px;
}

.delivery-auto-error .error-text {
  margin: 0;
}

.delivery-auto-error small {
  color: rgba(255, 255, 255, 0.58);
  line-height: 1.4;
}

@keyframes mesa4-delivery-spin {
  to {
    transform: rotate(360deg);
  }
}
`;
}

fs.writeFileSync(
  stylesFile,
  stylesOriginal.includes("\r\n")
    ? styles.replace(/\n/g, "\r\n")
    : styles,
  "utf8",
);

console.log("✓ Feedback visual automático adicionado");
console.log("");
console.log("FRETE_AUTOMATICO_V29_APLICADO");
console.log("");
console.log("Agora rode:");
console.log("  cd frontend");
console.log("  npm run build");
