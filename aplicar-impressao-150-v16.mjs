import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relative =
  "frontend/src/pages/AdminPrintOrdersPage.tsx";
const file = path.join(root, relative);

if (!fs.existsSync(file)) {
  throw new Error(
    `Não encontrei ${relative}. Execute este script na raiz do projeto mesa4.`,
  );
}

const original = fs.readFileSync(file, "utf8");
const backup = `${file}.backup-v16`;

if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
}

const eol = original.includes("\r\n")
  ? "\r\n"
  : "\n";

let content = original.replace(/\r\n/g, "\n");

const marker =
  "MESA4_PRINT_SCALE_150_V16";

if (content.includes(marker)) {
  console.log(
    "↷ A impressão já está ampliada em 50%.",
  );
} else {
  const replacements = [
    [
      "font-size: 12px;",
      `font-size: 18px; /* ${marker} */`,
    ],
    [
      "h1 { font-size: 20px; text-align: center; }",
      "h1 { font-size: 30px; text-align: center; }",
    ],
    [
      "h2 { font-size: 14px; margin-bottom: 5px; }",
      "h2 { font-size: 21px; margin-bottom: 7.5px; }",
    ],
    [
      "margin: 10px 0;",
      "margin: 15px 0;",
    ],
    [
      "gap: 10px;",
      "gap: 15px;",
    ],
    [
      "margin: 3px 0;",
      "margin: 4.5px 0;",
    ],
    [
      "gap: 2px;",
      "gap: 3px;",
    ],
    [
      "margin-bottom: 9px;",
      "margin-bottom: 13.5px;",
    ],
    [
      "padding: 7px;",
      "padding: 10.5px;",
    ],
    [
      "margin-top: 8px;",
      "margin-top: 12px;",
    ],
    [
      "font-size: 16px;",
      "font-size: 24px;",
    ],
  ];

  let changed = 0;

  for (const [from, to] of replacements) {
    if (content.includes(from)) {
      content = content.replace(from, to);
      changed += 1;
    }
  }

  if (!content.includes(marker)) {
    throw new Error(
      "Não encontrei o CSS de impressão esperado em AdminPrintOrdersPage.tsx. O arquivo pode ter sido alterado manualmente.",
    );
  }

  console.log(
    `✓ Impressão ampliada em 50% (${changed} ajustes aplicados).`,
  );
}

fs.writeFileSync(
  file,
  content.replace(/\n/g, eol),
  "utf8",
);

console.log("");
console.log(
  "IMPRESSAO_150_V16_APLICADA",
);
console.log("");
console.log(
  `✓ Backup: ${relative}.backup-v16`,
);
console.log("");
console.log("Agora rode:");
console.log("  cd frontend");
console.log("  npm run build");
