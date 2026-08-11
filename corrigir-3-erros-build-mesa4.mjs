#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function file(rel) {
  return path.join(ROOT, rel);
}

function read(rel) {
  const p = file(rel);
  if (!fs.existsSync(p)) {
    throw new Error(`Arquivo não encontrado: ${rel}`);
  }
  return fs.readFileSync(p, "utf8");
}

function save(rel, before, after) {
  if (before === after) {
    console.log(`- ${rel}: nenhuma alteração necessária`);
    return;
  }

  const p = file(rel);
  fs.writeFileSync(`${p}.bak-${stamp}`, before, "utf8");
  fs.writeFileSync(p, after, "utf8");
  console.log(`✓ ${rel}`);
}

console.log("\nCorrigindo os 3 erros de build...\n");

// 1) catalog-security.routes.ts
// A proteção separada do cardápio foi removida por decisão de arquitetura.
// Mantemos um plugin vazio para não quebrar eventuais imports/registrations antigos.
{
  const rel = "backend/src/routes/catalog-security.routes.ts";
  const before = read(rel);

  const after = `import type { FastifyInstance } from "fastify";

/**
 * Rota legada mantida temporariamente apenas por compatibilidade.
 *
 * A proteção separada do cardápio foi removida.
 * O Authenticator agora protege o login administrativo,
 * e a confirmação adicional permanece somente na área PIX.
 */
export async function catalogSecurityRoutes(
  _app: FastifyInstance,
) {
  // Intencionalmente vazio.
}
`;

  save(rel, before, after);
}

// 2) pix-security.routes.ts
// Remove somente o desbloqueio administrativo antigo.
// Toda a segurança PIX existente permanece.
{
  const rel = "backend/src/routes/pix-security.routes.ts";
  const before = read(rel);
  let after = before;

  after = after.replace(
    /import\s*\{\s*createAdminStepUpAuthorization\s*,?\s*\}\s*from\s*["']\.\.\/modules\/security\/admin-stepup-security\.service\.js["'];?\s*/g,
    ""
  );

  const routeNeedle = '  app.post(\n    "/admin/security/admin/unlock"';
  const routeStart = after.indexOf(routeNeedle);

  if (routeStart >= 0) {
    // O instalador anterior adicionou essa rota como a última rota da função.
    const functionEnd = after.lastIndexOf("\n}");

    if (functionEnd <= routeStart) {
      throw new Error(
        "Encontrei /admin/security/admin/unlock, mas não consegui delimitar o final da função."
      );
    }

    after =
      after.slice(0, routeStart) +
      after.slice(functionEnd);
  }

  if (
    after.includes("createAdminStepUpAuthorization") ||
    after.includes("admin-stepup-security.service.js") ||
    after.includes("/admin/security/admin/unlock")
  ) {
    throw new Error(
      "Ainda existe referência à proteção administrativa antiga em pix-security.routes.ts."
    );
  }

  save(rel, before, after);
}

// 3) order.service.ts
// O `order` é uma variável `let` porque pode ser atualizado depois.
// Guardamos o id em const após o null-check para manter o narrowing seguro.
{
  const rel = "backend/src/modules/orders/order.service.ts";
  const before = read(rel);
  let after = before;

  const functionStart = after.indexOf(
    "export async function getOrderForCustomer("
  );

  if (functionStart < 0) {
    throw new Error(
      "Não encontrei getOrderForCustomer em order.service.ts."
    );
  }

  const prefix = after.slice(0, functionStart);
  let fn = after.slice(functionStart);

  if (!fn.includes("const orderId = order.id;")) {
    const paymentMarker = "  let payment = order.payments[0];";

    if (!fn.includes(paymentMarker)) {
      throw new Error(
        "Não encontrei o ponto esperado após a validação do pedido."
      );
    }

    fn = fn.replace(
      paymentMarker,
      `  const orderId = order.id;\n\n${paymentMarker}`
    );
  }

  // Só altera referências dentro de getOrderForCustomer.
  fn = fn.replace(/\border\.id\b/g, "orderId");

  // A substituição acima também transformaria a própria declaração
  // em `const orderId = orderId`; corrigimos explicitamente.
  fn = fn.replace(
    "const orderId = orderId;",
    "const orderId = order.id;"
  );

  after = prefix + fn;

  save(rel, before, after);
}

console.log(`
Pronto.

Agora rode:

  cd backend
  npm run build

Se passar, rode também:

  cd ../frontend
  npm run build
`);
