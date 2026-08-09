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

  const content =
    readFileSync(file, "utf8")
      .replace(/\r\n/g, "\n");

  staged.set(relative, content);
  return content;
}

function stage(relative, content) {
  staged.set(relative, content);
}

// Login administrativo formatado para
// password managers do navegador.
stage(
  "frontend/src/pages/AdminLoginPage.tsx",
  "import {\n  FormEvent,\n  useState,\n} from \"react\";\nimport { useMutation } from \"@tanstack/react-query\";\nimport { useNavigate } from \"react-router-dom\";\nimport { api } from \"../lib/api\";\n\ntype LoginResult = {\n  token: string;\n  admin: {\n    name: string;\n  };\n};\n\ntype LoginInput = {\n  email: string;\n  password: string;\n  rememberEmail: boolean;\n};\n\nconst ADMIN_EMAIL_KEY =\n  \"mesa4.admin.email\";\n\nexport function AdminLoginPage() {\n  const navigate = useNavigate();\n  const [rememberEmail, setRememberEmail] =\n    useState(\n      () =>\n        localStorage.getItem(\n          ADMIN_EMAIL_KEY,\n        ) !== null,\n    );\n  const [initialEmail] = useState(\n    () =>\n      localStorage.getItem(\n        ADMIN_EMAIL_KEY,\n      ) ?? \"\",\n  );\n\n  const mutation = useMutation({\n    mutationFn: (\n      input: LoginInput,\n    ) =>\n      api<LoginResult>(\n        \"/admin/auth/login\",\n        {\n          method: \"POST\",\n          body: JSON.stringify({\n            email: input.email,\n            password: input.password,\n          }),\n        },\n      ),\n    onSuccess(\n      data,\n      variables,\n    ) {\n      sessionStorage.setItem(\n        \"mesa4.admin.token\",\n        data.token,\n      );\n\n      if (variables.rememberEmail) {\n        localStorage.setItem(\n          ADMIN_EMAIL_KEY,\n          variables.email,\n        );\n      } else {\n        localStorage.removeItem(\n          ADMIN_EMAIL_KEY,\n        );\n      }\n\n      navigate(\"/admin\");\n    },\n  });\n\n  function submit(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n\n    const form =\n      new FormData(event.currentTarget);\n\n    mutation.mutate({\n      email: String(\n        form.get(\"email\") ?? \"\",\n      ),\n      password: String(\n        form.get(\"password\") ?? \"\",\n      ),\n      rememberEmail,\n    });\n  }\n\n  return (\n    <main className=\"admin-login\">\n      <form\n        onSubmit={submit}\n        autoComplete=\"on\"\n      >\n        <div className=\"admin-logo\">\n          M4\n        </div>\n\n        <small>\n          Área administrativa\n        </small>\n\n        <h1>Mesa IV</h1>\n\n        <label className=\"field\">\n          <span>E-mail</span>\n          <input\n            name=\"email\"\n            type=\"email\"\n            defaultValue={initialEmail}\n            autoComplete=\"username\"\n            autoCapitalize=\"none\"\n            spellCheck={false}\n            required\n          />\n        </label>\n\n        <label className=\"field\">\n          <span>Senha</span>\n          <input\n            name=\"password\"\n            type=\"password\"\n            minLength={8}\n            autoComplete=\"current-password\"\n            required\n          />\n        </label>\n\n        <label className=\"admin-remember-login\">\n          <input\n            type=\"checkbox\"\n            checked={rememberEmail}\n            onChange={(event) =>\n              setRememberEmail(\n                event.target.checked,\n              )\n            }\n          />\n          <span>\n            Lembrar e-mail neste\n            dispositivo\n          </span>\n        </label>\n\n        <small className=\"admin-password-manager-help\">\n          O navegador pode salvar e\n          preencher sua senha. A senha\n          não é armazenada pelo Mesa IV.\n        </small>\n\n        {mutation.error && (\n          <p className=\"error-text\">\n            {mutation.error.message}\n          </p>\n        )}\n\n        <button\n          className=\"primary\"\n          disabled={mutation.isPending}\n        >\n          {mutation.isPending\n            ? \"Entrando...\"\n            : \"Entrar\"}\n        </button>\n      </form>\n    </main>\n  );\n}\n",
);

// Banner com uma imagem real em contain
// no mobile.
{
  const relative =
    "frontend/src/pages/MenuPage.tsx";
  let content = read(relative);
  const marker =
    "hero-banner-fit";

  if (!content.includes(marker)) {
    const headerPattern =
      /    <header className="hero"[^\n]*>\n/;

    if (!headerPattern.test(content)) {
      throw new Error(
        "Não encontrei o <header> do banner em MenuPage.tsx. " +
          "Nenhum arquivo foi gravado.",
      );
    }

    content = content.replace(
      headerPattern,
      `    <header
      className={\`hero \${
        settings?.heroImageUrl
          ? "hero-with-banner"
          : ""
      }\`}
      style={
        settings?.heroImageUrl
          ? {
              backgroundImage:
                \`url(\${settings.heroImageUrl})\`,
            }
          : undefined
      }
    >
      {settings?.heroImageUrl && (
        <img
          className="hero-banner-fit"
          src={settings.heroImageUrl}
          alt=""
          aria-hidden="true"
        />
      )}
`,
    );

    stage(relative, content);
  }
}

// CSS.
{
  const relative =
    "frontend/src/styles.css";
  const content = read(relative);
  const marker =
    "MESA4_ADMIN_PASSWORD_MANAGER_AND_FULL_MOBILE_BANNER_V2";

  if (!content.includes(marker)) {
    stage(
      relative,
      `${content.trimEnd()}

${"\n/* MESA4_ADMIN_PASSWORD_MANAGER_AND_FULL_MOBILE_BANNER_V2 */\n\n.admin-remember-login {\n  display: flex;\n  align-items: center;\n  gap: 9px;\n  margin: 10px 0 2px;\n  color: #d7cfc4;\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.admin-remember-login input {\n  width: 17px;\n  height: 17px;\n  margin: 0;\n  accent-color: var(--orange);\n}\n\n.admin-password-manager-help {\n  display: block;\n  margin: 8px 0 14px !important;\n  color: var(--muted);\n  font-size: 11px;\n  line-height: 1.45;\n}\n\n/*\n  A imagem real fica por cima do mesmo\n  banner usado como background. No\n  desktop usamos cover; no mobile,\n  contain garante que a foto inteira\n  fique visível.\n*/\n.hero {\n  overflow: hidden;\n}\n\n.hero-banner-fit {\n  position: absolute;\n  inset: 0;\n  z-index: 0;\n  display: block;\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  object-position: center;\n  pointer-events: none;\n  user-select: none;\n}\n\n.hero.hero-with-banner::before {\n  z-index: 1;\n}\n\n.hero.hero-with-banner nav,\n.hero.hero-with-banner .hero-content {\n  position: relative;\n  z-index: 2;\n}\n\n@media (max-width: 640px) {\n  .hero.hero-with-banner {\n    /*\n      Altura responsiva baseada na\n      largura do aparelho. Evita os\n      valores fixos que deixavam o\n      enquadramento diferente entre\n      celulares.\n    */\n    min-height: clamp(\n      300px,\n      82vw,\n      430px\n    );\n    background-size: cover;\n    background-position: center;\n    background-repeat: no-repeat;\n  }\n\n  .hero.hero-with-banner\n    .hero-banner-fit {\n    object-fit: contain;\n    object-position: center;\n  }\n\n  /*\n    Escurece principalmente a parte\n    inferior, deixando o restante da\n    foto muito mais aparente.\n  */\n  .hero.hero-with-banner::before {\n    background:\n      linear-gradient(\n        180deg,\n        rgba(17, 16, 14, 0.10) 0%,\n        rgba(17, 16, 14, 0.16) 32%,\n        rgba(17, 16, 14, 0.42) 64%,\n        rgba(17, 16, 14, 0.82) 100%\n      );\n  }\n\n  .hero.hero-with-banner nav {\n    height: 62px;\n    padding: 0 13px;\n  }\n\n  .hero.hero-with-banner\n    .hero-content {\n    position: absolute;\n    inset: 62px 0 0;\n    display: flex;\n    min-height: 0;\n    flex-direction: column;\n    align-items: flex-start;\n    justify-content: flex-end;\n    padding: 18px 15px 20px;\n  }\n\n  .hero.hero-with-banner\n    .store-status {\n    padding: 5px 9px;\n    font-size: 10px;\n  }\n\n  .hero.hero-with-banner h1 {\n    max-width: 260px;\n    margin: 8px 0 5px;\n    font-size: clamp(\n      27px,\n      8vw,\n      35px\n    );\n    line-height: 0.92;\n    letter-spacing: -0.02em;\n  }\n\n  .hero.hero-with-banner\n    .hero-content > p {\n    display: -webkit-box;\n    max-width: min(\n      300px,\n      calc(100vw - 30px)\n    );\n    margin: 0;\n    overflow: hidden;\n    font-size: 11.5px;\n    line-height: 1.35;\n    -webkit-box-orient: vertical;\n    -webkit-line-clamp: 1;\n  }\n\n  .hero.hero-with-banner\n    .hero-info {\n    gap: 6px;\n    margin-top: 8px;\n    font-size: 10.5px;\n  }\n\n  .hero.hero-with-banner\n    .hero-info svg {\n    width: 14px;\n    height: 14px;\n  }\n}\n\n@media (max-width: 380px) {\n  .hero.hero-with-banner {\n    min-height: clamp(\n      285px,\n      84vw,\n      330px\n    );\n  }\n\n  .hero.hero-with-banner\n    .hero-content {\n    min-height: 0;\n    padding: 14px 12px 17px;\n  }\n\n  .hero.hero-with-banner h1 {\n    max-width: 225px;\n    font-size: clamp(\n      24px,\n      7.6vw,\n      29px\n    );\n  }\n\n  .hero.hero-with-banner\n    .hero-content > p {\n    font-size: 10.5px;\n  }\n}\n"}
`,
    );
  }
}

// Só faz backup/escrita depois que
// todas as verificações passaram.
const backupDirectory = absolute(
  `backup-login-banner-${Date.now()}`,
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

for (
  const [relative, content]
  of staged.entries()
) {
  const file = absolute(relative);

  mkdirSync(dirname(file), {
    recursive: true,
  });

  writeFileSync(
    file,
    content,
    "utf8",
  );

  console.log(`✓ ${relative}`);
}

console.log(`
Login e banner mobile atualizados.

O Mesa IV não grava a senha em
localStorage. O campo foi preparado
para o gerenciador de senhas do
Chrome/Edge salvar e preencher a senha.

O e-mail pode ser lembrado localmente.

No mobile, o banner usa object-fit:
contain, então a imagem inteira fica
visível em diferentes larguras de
aparelho.

Backup:
  ${backupDirectory}

Agora:

  cd frontend
  npm run build
`);
