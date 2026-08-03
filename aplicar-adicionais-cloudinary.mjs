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

function replaceRequired(
  relative,
  pattern,
  replacement,
  marker,
) {
  const current = read(relative);

  if (marker && current.includes(marker)) {
    console.log(`↷ ${relative} já atualizado`);
    return;
  }

  if (!pattern.test(current)) {
    throw new Error(
      `Não encontrei a estrutura esperada em ${relative}.\n` +
        "Nenhum arquivo foi alterado. Envie esse arquivo para revisão.",
    );
  }

  stage(
    relative,
    current.replace(pattern, replacement),
  );
}

function appendOnce(relative, marker, block) {
  const current = read(relative);

  if (current.includes(marker)) {
    console.log(`↷ ${relative} já atualizado`);
    return;
  }

  stage(
    relative,
    `${current.trimEnd()}\n\n${block.trim()}\n`,
  );
}

// Prisma ----------------------------------------------------------------------

replaceRequired(
  "backend/prisma/schema.prisma",
  /(\n\s*imageUrl\s+String\?\s*\n)/,
  `$1  imagePublicId String?
`,
  "imagePublicId String?",
);

replaceRequired(
  "backend/prisma/schema.prisma",
  /(\n\s*active\s+Boolean\s+@default\(true\)\s*\n\s*options\s+ProductOption\[\]\s*\n)/,
  `  active         Boolean         @default(true)
  libraryManaged Boolean         @default(false)
  options        ProductOption[]
`,
  "libraryManaged Boolean",
);

replaceRequired(
  "backend/prisma/schema.prisma",
  /(model ProductOption\s*\{[\s\S]*?\n\s*active\s+Boolean\s+@default\(true\)\s*\n)/,
  `$1  addonLibraryId String?             @db.ObjectId
  addonLibrary   AddonLibraryItem?  @relation(fields: [addonLibraryId], references: [id])
`,
  "addonLibraryId String?",
);

replaceRequired(
  "backend/prisma/schema.prisma",
  /(\nmodel DeliveryZone\s*\{)/,
  `
model AddonLibraryItem {
  id          String          @id @default(auto()) @map("_id") @db.ObjectId
  name        String
  slug        String          @unique
  priceCents  Int
  position    Int             @default(0)
  active      Boolean         @default(true)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  options     ProductOption[]
}

$1`,
  "model AddonLibraryItem",
);

// Dependências ----------------------------------------------------------------

{
  const relative = "backend/package.json";
  const packageJson = JSON.parse(read(relative));

  packageJson.dependencies ??= {};
  packageJson.dependencies["@fastify/multipart"] =
    "^10.1.0";
  packageJson.dependencies.cloudinary = "^2.10.0";

  stage(
    relative,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
}

// Variáveis -------------------------------------------------------------------

replaceRequired(
  "backend/src/config/env.ts",
  /(\s*OPENROUTESERVICE_API_KEY:[^\n]+\n)/,
  `$1  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
`,
  "CLOUDINARY_CLOUD_NAME:",
);

appendOnce(
  "backend/.env.example",
  "CLOUDINARY_CLOUD_NAME=",
  `
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
`,
);

replaceRequired(
  "render.yaml",
  /(\s+- key: OPENROUTESERVICE_API_KEY\s*\n\s+sync: false\s*\n)/,
  `$1
      - key: CLOUDINARY_CLOUD_NAME
        sync: false

      - key: CLOUDINARY_API_KEY
        sync: false

      - key: CLOUDINARY_API_SECRET
        sync: false
`,
  "CLOUDINARY_CLOUD_NAME",
);

// Multipart -------------------------------------------------------------------

replaceRequired(
  "backend/src/app.ts",
  /(import Fastify from "fastify";\s*\n)/,
  `$1import multipart from "@fastify/multipart";
`,
  '@fastify/multipart',
);

replaceRequired(
  "backend/src/app.ts",
  /bodyLimit:\s*1024\s*\*\s*1024,/,
  `bodyLimit: 6 * 1024 * 1024,`,
  "bodyLimit: 6 * 1024 * 1024",
);

replaceRequired(
  "backend/src/app.ts",
  /(\s*await registerSecurity\(app\);\s*\n)/,
  `$1  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 5 * 1024 * 1024,
    },
  });
`,
  "fileSize: 5 * 1024 * 1024",
);

// Serviço Cloudinary -----------------------------------------------------------

stage(
  "backend/src/lib/cloudinary.ts",
  "import { v2 as cloudinary } from \"cloudinary\";\nimport { env } from \"../config/env.js\";\nimport { HttpError } from \"./http-error.js\";\n\nlet configured = false;\n\nfunction configureCloudinary() {\n  if (\n    !env.CLOUDINARY_CLOUD_NAME ||\n    !env.CLOUDINARY_API_KEY ||\n    !env.CLOUDINARY_API_SECRET\n  ) {\n    throw new HttpError(\n      503,\n      \"O upload de imagens ainda não foi configurado\",\n      \"CLOUDINARY_NOT_CONFIGURED\",\n    );\n  }\n\n  if (!configured) {\n    cloudinary.config({\n      cloud_name: env.CLOUDINARY_CLOUD_NAME,\n      api_key: env.CLOUDINARY_API_KEY,\n      api_secret: env.CLOUDINARY_API_SECRET,\n      secure: true,\n    });\n\n    configured = true;\n  }\n}\n\nexport type UploadedImage = {\n  imageUrl: string;\n  imagePublicId: string;\n  width?: number;\n  height?: number;\n  format?: string;\n  bytes?: number;\n};\n\nexport async function uploadProductImage(\n  buffer: Buffer,\n): Promise<UploadedImage> {\n  configureCloudinary();\n\n  return new Promise((resolve, reject) => {\n    const stream = cloudinary.uploader.upload_stream(\n      {\n        folder: \"mesa4/products\",\n        resource_type: \"image\",\n        unique_filename: true,\n        overwrite: false,\n      },\n      (error, result) => {\n        if (error || !result) {\n          reject(\n            new HttpError(\n              502,\n              \"Não foi possível enviar a imagem ao Cloudinary\",\n              \"CLOUDINARY_UPLOAD_FAILED\",\n            ),\n          );\n          return;\n        }\n\n        resolve({\n          imageUrl: result.secure_url,\n          imagePublicId: result.public_id,\n          width: result.width,\n          height: result.height,\n          format: result.format,\n          bytes: result.bytes,\n        });\n      },\n    );\n\n    stream.end(buffer);\n  });\n}\n\nexport async function deleteCloudinaryImage(\n  publicId: string,\n) {\n  configureCloudinary();\n  await cloudinary.uploader.destroy(publicId, {\n    resource_type: \"image\",\n    invalidate: true,\n  });\n}\n",
);

// Rotas administrativas --------------------------------------------------------

{
  const relative =
    "backend/src/routes/admin.routes.ts";
  let content = read(relative);

  if (
    !content.includes(
      'from "../lib/cloudinary.js"',
    )
  ) {
    content = content.replace(
      /import \{ slugify \} from "\.\.\/lib\/slug\.js";/,
      `import { slugify } from "../lib/slug.js";
import {
  deleteCloudinaryImage,
  uploadProductImage,
} from "../lib/cloudinary.js";`,
    );
  }

  if (!content.includes("const addonSchema")) {
    const productSchemaEnd =
      content.indexOf("const zoneSchema");

    if (productSchemaEnd < 0) {
      throw new Error(
        "Não encontrei o final do schema de produto.",
      );
    }

    const addonSchemas = `const addonSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().optional(),
  priceCents: z.coerce.number().int().min(0),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

const productAddonsSchema = z.object({
  addonIds: z.array(z.string().min(1)).max(50).default([]),
  maxSelection: z.coerce.number().int().min(1).max(50).default(10),
});

`;

    content =
      content.slice(0, productSchemaEnd) +
      addonSchemas +
      content.slice(productSchemaEnd);
  }

  content = content.replace(
    /imageUrl:\s*z\.string\(\)\.url\(\)\.optional\(\)\.or\(z\.literal\(""\)\),/,
    `imageUrl: z.string().url().optional().or(z.literal("")),
  imagePublicId: z.string().trim().max(200).optional().or(z.literal("")),`,
  );

  if (
    !content.includes(
      'app.post("/admin/uploads/images"',
    )
  ) {
    const categoryRouteIndex = content.indexOf(
      'app.get("/admin/categories"',
    );

    if (categoryRouteIndex < 0) {
      throw new Error(
        "Não encontrei as rotas de categorias.",
      );
    }

    const newRoutes = `app.post(
    "/admin/uploads/images",
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const file = await request.file();

      if (!file) {
        throw new HttpError(
          422,
          "Selecione uma imagem",
          "IMAGE_REQUIRED",
        );
      }

      if (!file.mimetype.startsWith("image/")) {
        throw new HttpError(
          422,
          "O arquivo selecionado não é uma imagem",
          "INVALID_IMAGE_TYPE",
        );
      }

      const buffer = await file.toBuffer();

      if (buffer.length > 5 * 1024 * 1024) {
        throw new HttpError(
          422,
          "A imagem deve ter no máximo 5 MB",
          "IMAGE_TOO_LARGE",
        );
      }

      const uploaded =
        await uploadProductImage(buffer);

      await audit(
        request,
        "UPLOAD",
        "PRODUCT_IMAGE",
        uploaded.imagePublicId,
        {
          bytes: uploaded.bytes,
          width: uploaded.width,
          height: uploaded.height,
          format: uploaded.format,
        },
      );

      return reply.code(201).send(uploaded);
    },
  );

  app.get(
    "/admin/addons",
    { preHandler: app.authenticateAdmin },
    async () =>
      prisma.addonLibraryItem.findMany({
        orderBy: [
          { position: "asc" },
          { name: "asc" },
        ],
      }),
  );

  app.post(
    "/admin/addons",
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const input = addonSchema.parse(request.body);
      const addon =
        await prisma.addonLibraryItem.create({
          data: {
            ...input,
            slug: slugify(
              input.slug || input.name,
            ),
          },
        });

      await audit(
        request,
        "CREATE",
        "ADDON_LIBRARY",
        addon.id,
        input,
      );

      return reply.code(201).send(addon);
    },
  );

  app.patch(
    "/admin/addons/:id",
    { preHandler: app.authenticateAdmin },
    async (request) => {
      const { id } = z
        .object({ id: z.string() })
        .parse(request.params);
      const input =
        addonSchema.partial().parse(request.body);

      const addon =
        await prisma.addonLibraryItem.update({
          where: { id },
          data: {
            ...input,
            ...(input.slug || input.name
              ? {
                  slug: slugify(
                    input.slug ||
                      input.name ||
                      "",
                  ),
                }
              : {}),
          },
        });

      await prisma.productOption.updateMany({
        where: { addonLibraryId: id },
        data: {
          name: addon.name,
          priceCents: addon.priceCents,
          position: addon.position,
          active: addon.active,
        },
      });

      await audit(
        request,
        "UPDATE",
        "ADDON_LIBRARY",
        id,
        input,
      );

      return addon;
    },
  );

  app.delete(
    "/admin/addons/:id",
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const { id } = z
        .object({ id: z.string() })
        .parse(request.params);

      await prisma.productOption.deleteMany({
        where: { addonLibraryId: id },
      });

      await prisma.addonLibraryItem.delete({
        where: { id },
      });

      await audit(
        request,
        "DELETE",
        "ADDON_LIBRARY",
        id,
      );

      return reply.code(204).send();
    },
  );

  `;

    content =
      content.slice(0, categoryRouteIndex) +
      newRoutes +
      content.slice(categoryRouteIndex);
  }

  if (
    !content.includes(
      '"/admin/products/:productId/addons"',
    )
  ) {
    const groupsRouteIndex = content.indexOf(
      'app.post("/admin/products/:productId/option-groups"',
    );

    if (groupsRouteIndex < 0) {
      throw new Error(
        "Não encontrei as rotas de grupos de opções.",
      );
    }

    const linkRoute = `app.put(
    "/admin/products/:productId/addons",
    { preHandler: app.authenticateAdmin },
    async (request) => {
      const { productId } = z
        .object({ productId: z.string() })
        .parse(request.params);
      const input =
        productAddonsSchema.parse(request.body);

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new HttpError(
          404,
          "Produto não encontrado",
          "PRODUCT_NOT_FOUND",
        );
      }

      const addons =
        input.addonIds.length > 0
          ? await prisma.addonLibraryItem.findMany({
              where: {
                id: { in: input.addonIds },
              },
            })
          : [];

      if (addons.length !== input.addonIds.length) {
        throw new HttpError(
          422,
          "Um dos adicionais selecionados não existe",
          "ADDON_NOT_FOUND",
        );
      }

      let group =
        await prisma.productOptionGroup.findFirst({
          where: {
            productId,
            libraryManaged: true,
          },
        });

      if (!group && input.addonIds.length > 0) {
        group =
          await prisma.productOptionGroup.create({
            data: {
              productId,
              name: "Adicionais",
              required: false,
              minSelection: 0,
              maxSelection:
                input.maxSelection,
              position: 100,
              active: true,
              libraryManaged: true,
            },
          });
      }

      if (group) {
        await prisma.productOptionGroup.update({
          where: { id: group.id },
          data: {
            maxSelection:
              input.maxSelection,
            active: true,
          },
        });

        const currentOptions =
          await prisma.productOption.findMany({
            where: {
              groupId: group.id,
              addonLibraryId: {
                not: null,
              },
            },
          });

        const selectedSet = new Set(
          input.addonIds,
        );

        const optionsToDelete =
          currentOptions.filter(
            (option) =>
              !option.addonLibraryId ||
              !selectedSet.has(
                option.addonLibraryId,
              ),
          );

        if (optionsToDelete.length > 0) {
          await prisma.productOption.deleteMany({
            where: {
              id: {
                in: optionsToDelete.map(
                  (option) => option.id,
                ),
              },
            },
          });
        }

        for (const addon of addons) {
          const existing =
            currentOptions.find(
              (option) =>
                option.addonLibraryId === addon.id,
            );

          if (existing) {
            await prisma.productOption.update({
              where: { id: existing.id },
              data: {
                name: addon.name,
                priceCents:
                  addon.priceCents,
                position: addon.position,
                active: addon.active,
              },
            });
          } else {
            await prisma.productOption.create({
              data: {
                groupId: group.id,
                addonLibraryId: addon.id,
                name: addon.name,
                priceCents:
                  addon.priceCents,
                position: addon.position,
                active: addon.active,
              },
            });
          }
        }
      }

      await audit(
        request,
        "SYNC_ADDONS",
        "PRODUCT",
        productId,
        input,
      );

      return prisma.product.findUnique({
        where: { id: productId },
        include: {
          category: true,
          optionGroups: {
            include: {
              options: true,
            },
          },
        },
      });
    },
  );

  `;

    content =
      content.slice(0, groupsRouteIndex) +
      linkRoute +
      content.slice(groupsRouteIndex);
  }

  // Salva os novos campos de imagem.
  content = content.replace(
    /data:\s*\{\s*\.\.\.input,\s*imageUrl:\s*input\.imageUrl\s*\|\|\s*undefined,\s*slug:/,
    `data: {
      ...input,
      imageUrl: input.imageUrl || undefined,
      imagePublicId:
        input.imagePublicId || undefined,
      slug:`,
  );

  content = content.replace(
    /\.\.\.\(input\.imageUrl !== undefined \? \{ imageUrl: input\.imageUrl \|\| null \} : \{\}\),/,
    `...(input.imageUrl !== undefined
      ? { imageUrl: input.imageUrl || null }
      : {}),
    ...(input.imagePublicId !== undefined
      ? {
          imagePublicId:
            input.imagePublicId || null,
        }
      : {}),`,
  );

  stage(relative, content);
}

// Frontend --------------------------------------------------------------------

stage(
  "frontend/src/pages/AdminMenuPage.tsx",
  "import {\n  FormEvent,\n  useRef,\n  useState,\n} from \"react\";\nimport {\n  useMutation,\n  useQuery,\n  useQueryClient,\n} from \"@tanstack/react-query\";\nimport {\n  ImagePlus,\n  LoaderCircle,\n  Pencil,\n  Plus,\n  Trash2,\n  UploadCloud,\n  X,\n} from \"lucide-react\";\nimport { AdminNav } from \"../components/AdminNav\";\nimport { adminApi } from \"../lib/api\";\nimport { formatMoney } from \"../lib/format\";\n\ntype Category = {\n  id: string;\n  name: string;\n  active: boolean;\n  position: number;\n};\n\ntype Addon = {\n  id: string;\n  name: string;\n  slug: string;\n  priceCents: number;\n  position: number;\n  active: boolean;\n};\n\ntype Option = {\n  id: string;\n  name: string;\n  priceCents: number;\n  active: boolean;\n  addonLibraryId?: string;\n};\n\ntype Group = {\n  id: string;\n  name: string;\n  required: boolean;\n  minSelection: number;\n  maxSelection: number;\n  position: number;\n  active: boolean;\n  libraryManaged?: boolean;\n  options: Option[];\n};\n\ntype Product = {\n  id: string;\n  categoryId: string;\n  name: string;\n  description?: string;\n  priceCents: number;\n  imageUrl?: string;\n  imagePublicId?: string;\n  featured: boolean;\n  active: boolean;\n  soldOut: boolean;\n  position: number;\n  category: Category;\n  optionGroups: Group[];\n};\n\ntype UploadResult = {\n  imageUrl: string;\n  imagePublicId: string;\n};\n\ntype ProductPayload = {\n  categoryId: FormDataEntryValue | null;\n  name: FormDataEntryValue | null;\n  description?: FormDataEntryValue;\n  priceCents: number;\n  imageUrl: string;\n  imagePublicId?: string;\n  active: boolean;\n  soldOut: boolean;\n  featured: boolean;\n  position: number;\n};\n\ntype ProductMutationInput = {\n  product: ProductPayload;\n  addonIds: string[];\n  maxSelection: number;\n};\n\ntype EditProductMutationInput =\n  ProductMutationInput & {\n    id: string;\n  };\n\ntype PatchInput = {\n  path: string;\n  body: unknown;\n};\n\nfunction selectedAddonIds(product: Product) {\n  return product.optionGroups\n    .filter((group) => group.libraryManaged)\n    .flatMap((group) =>\n      group.options\n        .map((option) => option.addonLibraryId)\n        .filter((id): id is string => Boolean(id)),\n    );\n}\n\nfunction addonGroup(product: Product) {\n  return product.optionGroups.find(\n    (group) => group.libraryManaged,\n  );\n}\n\nfunction ImageUploadField({\n  value,\n  onChange,\n}: {\n  value: UploadResult | null;\n  onChange: (image: UploadResult | null) => void;\n}) {\n  const inputRef = useRef<HTMLInputElement>(null);\n  const [uploading, setUploading] =\n    useState(false);\n  const [error, setError] = useState(\"\");\n\n  async function selectImage(\n    event: React.ChangeEvent<HTMLInputElement>,\n  ) {\n    const file = event.target.files?.[0];\n\n    if (!file) {\n      return;\n    }\n\n    if (!file.type.startsWith(\"image/\")) {\n      setError(\"Selecione um arquivo de imagem.\");\n      event.target.value = \"\";\n      return;\n    }\n\n    if (file.size > 5 * 1024 * 1024) {\n      setError(\"A imagem deve ter no máximo 5 MB.\");\n      event.target.value = \"\";\n      return;\n    }\n\n    setUploading(true);\n    setError(\"\");\n\n    try {\n      const body = new FormData();\n      body.append(\"image\", file);\n\n      const result = await adminApi<UploadResult>(\n        \"/admin/uploads/images\",\n        {\n          method: \"POST\",\n          body,\n        },\n      );\n\n      onChange(result);\n    } catch (uploadError) {\n      setError(\n        uploadError instanceof Error\n          ? uploadError.message\n          : \"Não foi possível enviar a imagem.\",\n      );\n    } finally {\n      setUploading(false);\n      event.target.value = \"\";\n    }\n  }\n\n  return (\n    <div className=\"admin-image-upload\">\n      <input\n        ref={inputRef}\n        type=\"file\"\n        accept=\"image/*\"\n        onChange={selectImage}\n        hidden\n      />\n\n      {value?.imageUrl ? (\n        <div className=\"admin-image-preview\">\n          <img\n            src={value.imageUrl}\n            alt=\"Prévia do produto\"\n          />\n\n          <div>\n            <strong>Imagem enviada</strong>\n            <small>\n              Você pode escolher outra foto para\n              substituir.\n            </small>\n\n            <div className=\"admin-image-actions\">\n              <button\n                className=\"secondary\"\n                type=\"button\"\n                disabled={uploading}\n                onClick={() =>\n                  inputRef.current?.click()\n                }\n              >\n                <ImagePlus />\n                Trocar foto\n              </button>\n\n              <button\n                className=\"secondary danger-outline\"\n                type=\"button\"\n                disabled={uploading}\n                onClick={() => onChange(null)}\n              >\n                <Trash2 />\n                Remover\n              </button>\n            </div>\n          </div>\n        </div>\n      ) : (\n        <button\n          className=\"admin-image-picker\"\n          type=\"button\"\n          disabled={uploading}\n          onClick={() => inputRef.current?.click()}\n        >\n          {uploading ? (\n            <LoaderCircle className=\"spin\" />\n          ) : (\n            <UploadCloud />\n          )}\n\n          <span>\n            <strong>\n              {uploading\n                ? \"Enviando imagem...\"\n                : \"Escolher foto da galeria\"}\n            </strong>\n            <small>\n              JPG, PNG, WEBP ou outra imagem de até\n              5 MB\n            </small>\n          </span>\n        </button>\n      )}\n\n      {error && (\n        <p className=\"error-text\">{error}</p>\n      )}\n    </div>\n  );\n}\n\nexport function AdminMenuPage() {\n  const client = useQueryClient();\n  const [\n    editingProduct,\n    setEditingProduct,\n  ] = useState<Product | null>(null);\n  const [\n    createImage,\n    setCreateImage,\n  ] = useState<UploadResult | null>(null);\n  const [\n    editImage,\n    setEditImage,\n  ] = useState<UploadResult | null>(null);\n\n  const categories = useQuery({\n    queryKey: [\"admin-categories\"],\n    queryFn: () =>\n      adminApi<Category[]>(\"/admin/categories\"),\n  });\n\n  const products = useQuery({\n    queryKey: [\"admin-products\"],\n    queryFn: () =>\n      adminApi<Product[]>(\"/admin/products\"),\n  });\n\n  const addons = useQuery({\n    queryKey: [\"admin-addons\"],\n    queryFn: () =>\n      adminApi<Addon[]>(\"/admin/addons\"),\n  });\n\n  function refresh() {\n    client.invalidateQueries({\n      queryKey: [\"admin-products\"],\n    });\n    client.invalidateQueries({\n      queryKey: [\"admin-categories\"],\n    });\n    client.invalidateQueries({\n      queryKey: [\"admin-addons\"],\n    });\n    client.invalidateQueries({\n      queryKey: [\"menu\"],\n    });\n  }\n\n  const createCategory = useMutation({\n    mutationFn: (body: unknown) =>\n      adminApi(\"/admin/categories\", {\n        method: \"POST\",\n        body: JSON.stringify(body),\n      }),\n    onSuccess: refresh,\n  });\n\n  const createAddon = useMutation({\n    mutationFn: (body: unknown) =>\n      adminApi(\"/admin/addons\", {\n        method: \"POST\",\n        body: JSON.stringify(body),\n      }),\n    onSuccess: refresh,\n  });\n\n  const patch = useMutation({\n    mutationFn: ({ path, body }: PatchInput) =>\n      adminApi(path, {\n        method: \"PATCH\",\n        body: JSON.stringify(body),\n      }),\n    onSuccess: refresh,\n  });\n\n  const remove = useMutation({\n    mutationFn: (path: string) =>\n      adminApi(path, {\n        method: \"DELETE\",\n      }),\n    onSuccess: refresh,\n  });\n\n  const create = useMutation({\n    mutationFn: ({ path, body }: PatchInput) =>\n      adminApi(path, {\n        method: \"POST\",\n        body: JSON.stringify(body),\n      }),\n    onSuccess: refresh,\n  });\n\n  const createProduct = useMutation({\n    mutationFn: async ({\n      product,\n      addonIds,\n      maxSelection,\n    }: ProductMutationInput) => {\n      const created = await adminApi<Product>(\n        \"/admin/products\",\n        {\n          method: \"POST\",\n          body: JSON.stringify(product),\n        },\n      );\n\n      await adminApi(\n        `/admin/products/${created.id}/addons`,\n        {\n          method: \"PUT\",\n          body: JSON.stringify({\n            addonIds,\n            maxSelection,\n          }),\n        },\n      );\n\n      return created;\n    },\n    onSuccess: refresh,\n  });\n\n  const editProduct = useMutation({\n    mutationFn: async ({\n      id,\n      product,\n      addonIds,\n      maxSelection,\n    }: EditProductMutationInput) => {\n      await adminApi(`/admin/products/${id}`, {\n        method: \"PATCH\",\n        body: JSON.stringify(product),\n      });\n\n      await adminApi(\n        `/admin/products/${id}/addons`,\n        {\n          method: \"PUT\",\n          body: JSON.stringify({\n            addonIds,\n            maxSelection,\n          }),\n        },\n      );\n    },\n    onSuccess: () => {\n      setEditingProduct(null);\n      setEditImage(null);\n      refresh();\n    },\n  });\n\n  function categorySubmit(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n    const formElement = event.currentTarget;\n    const form = new FormData(formElement);\n\n    createCategory.mutate(\n      {\n        name: form.get(\"name\"),\n        active: true,\n        position:\n          Number(form.get(\"position\")) || 0,\n      },\n      {\n        onSuccess: () => formElement.reset(),\n      },\n    );\n  }\n\n  function addonSubmit(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n    const formElement = event.currentTarget;\n    const form = new FormData(formElement);\n\n    createAddon.mutate(\n      {\n        name: form.get(\"name\"),\n        priceCents: Math.round(\n          Number(form.get(\"price\")) * 100,\n        ),\n        position:\n          Number(form.get(\"position\")) || 0,\n        active: true,\n      },\n      {\n        onSuccess: () => formElement.reset(),\n      },\n    );\n  }\n\n  async function productSubmit(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n    const formElement = event.currentTarget;\n    const form = new FormData(formElement);\n\n    try {\n      await createProduct.mutateAsync({\n        product: {\n          categoryId: form.get(\"categoryId\"),\n          name: form.get(\"name\"),\n          description:\n            form.get(\"description\") || undefined,\n          priceCents: Math.round(\n            Number(form.get(\"price\")) * 100,\n          ),\n          imageUrl: createImage?.imageUrl ?? \"\",\n          imagePublicId:\n            createImage?.imagePublicId,\n          active: true,\n          soldOut: false,\n          featured:\n            form.get(\"featured\") === \"on\",\n          position:\n            Number(form.get(\"position\")) || 0,\n        },\n        addonIds: form\n          .getAll(\"addonIds\")\n          .map(String),\n        maxSelection: Math.max(\n          1,\n          Number(\n            form.get(\"addonMaxSelection\"),\n          ) || 10,\n        ),\n      });\n\n      formElement.reset();\n      setCreateImage(null);\n    } catch {\n      // O erro da mutation aparece no formulário.\n    }\n  }\n\n  async function editSubmit(\n    event: FormEvent<HTMLFormElement>,\n  ) {\n    event.preventDefault();\n\n    if (!editingProduct) {\n      return;\n    }\n\n    const form = new FormData(\n      event.currentTarget,\n    );\n\n    try {\n      await editProduct.mutateAsync({\n        id: editingProduct.id,\n        product: {\n          categoryId: form.get(\"categoryId\"),\n          name: form.get(\"name\"),\n          description:\n            form.get(\"description\") || undefined,\n          priceCents: Math.round(\n            Number(form.get(\"price\")) * 100,\n          ),\n          imageUrl: editImage?.imageUrl ?? \"\",\n          imagePublicId:\n            editImage?.imagePublicId,\n          position:\n            Number(form.get(\"position\")) || 0,\n          featured:\n            form.get(\"featured\") === \"on\",\n          active:\n            form.get(\"active\") === \"on\",\n          soldOut:\n            form.get(\"soldOut\") === \"on\",\n        },\n        addonIds: form\n          .getAll(\"addonIds\")\n          .map(String),\n        maxSelection: Math.max(\n          1,\n          Number(\n            form.get(\"addonMaxSelection\"),\n          ) || 10,\n        ),\n      });\n    } catch {\n      // O erro da mutation aparece no modal.\n    }\n  }\n\n  function openEdit(product: Product) {\n    setEditingProduct(product);\n    setEditImage(\n      product.imageUrl\n        ? {\n            imageUrl: product.imageUrl,\n            imagePublicId:\n              product.imagePublicId ?? \"\",\n          }\n        : null,\n    );\n  }\n\n  function editAddon(addon: Addon) {\n    const name = prompt(\n      \"Nome do adicional\",\n      addon.name,\n    );\n\n    if (!name) {\n      return;\n    }\n\n    const price = Number(\n      prompt(\n        \"Preço padrão em reais\",\n        String(addon.priceCents / 100),\n      ) ?? addon.priceCents / 100,\n    );\n\n    const position = Number(\n      prompt(\n        \"Posição\",\n        String(addon.position),\n      ) ?? addon.position,\n    );\n\n    patch.mutate({\n      path: `/admin/addons/${addon.id}`,\n      body: {\n        name,\n        priceCents: Math.round(price * 100),\n        position,\n      },\n    });\n  }\n\n  function addGroup(productId: string) {\n    const name = prompt(\n      \"Nome do grupo, por exemplo: Escolha o pão\",\n    );\n\n    if (!name) {\n      return;\n    }\n\n    const maxSelection = Number(\n      prompt(\"Máximo de escolhas\", \"1\") || 1,\n    );\n\n    create.mutate({\n      path:\n        `/admin/products/${productId}` +\n        \"/option-groups\",\n      body: {\n        name,\n        required: false,\n        minSelection: 0,\n        maxSelection,\n        active: true,\n        position: 0,\n      },\n    });\n  }\n\n  function addOption(groupId: string) {\n    const name = prompt(\"Nome da opção\");\n\n    if (!name) {\n      return;\n    }\n\n    const price = Number(\n      prompt(\n        \"Preço adicional em reais\",\n        \"0\",\n      ) || 0,\n    );\n\n    create.mutate({\n      path:\n        `/admin/option-groups/${groupId}` +\n        \"/options\",\n      body: {\n        name,\n        priceCents: Math.round(price * 100),\n        active: true,\n        position: 0,\n      },\n    });\n  }\n\n  const activeAddons =\n    addons.data?.filter((addon) => addon.active) ??\n    [];\n\n  return (\n    <main className=\"admin-page\">\n      <AdminNav />\n\n      <header className=\"admin-header\">\n        <div>\n          <small>Gerenciar produtos</small>\n          <h1>Cardápio</h1>\n        </div>\n      </header>\n\n      <section className=\"addon-library-section\">\n        <div className=\"section-title\">\n          <div>\n            <small>Cadastre uma vez e reutilize</small>\n            <h2>Biblioteca de adicionais</h2>\n          </div>\n\n          <span>\n            {addons.data?.length ?? 0} cadastrados\n          </span>\n        </div>\n\n        <div className=\"addon-library-layout\">\n          <form\n            className=\"admin-form\"\n            onSubmit={addonSubmit}\n          >\n            <h2>Novo adicional</h2>\n\n            <label className=\"field\">\n              <span>Nome</span>\n              <input\n                name=\"name\"\n                placeholder=\"Ex.: Bacon\"\n                required\n              />\n            </label>\n\n            <div className=\"field-grid\">\n              <label className=\"field\">\n                <span>Preço padrão em R$</span>\n                <input\n                  name=\"price\"\n                  type=\"number\"\n                  min=\"0\"\n                  step=\"0.01\"\n                  required\n                />\n              </label>\n\n              <label className=\"field\">\n                <span>Posição</span>\n                <input\n                  name=\"position\"\n                  type=\"number\"\n                  min=\"0\"\n                  defaultValue=\"0\"\n                />\n              </label>\n            </div>\n\n            {createAddon.error && (\n              <p className=\"error-text\">\n                {createAddon.error.message}\n              </p>\n            )}\n\n            <button\n              className=\"primary\"\n              disabled={createAddon.isPending}\n            >\n              <Plus />\n              Criar adicional\n            </button>\n          </form>\n\n          <div className=\"addon-library-list\">\n            {addons.isLoading && (\n              <p>Carregando adicionais...</p>\n            )}\n\n            {addons.data?.length === 0 && (\n              <div className=\"addon-library-empty\">\n                Nenhum adicional cadastrado.\n              </div>\n            )}\n\n            {addons.data?.map((addon) => (\n              <article\n                className={`addon-library-item ${\n                  addon.active ? \"\" : \"inactive\"\n                }`}\n                key={addon.id}\n              >\n                <div>\n                  <strong>{addon.name}</strong>\n                  <small>\n                    posição {addon.position}\n                  </small>\n                </div>\n\n                <b>\n                  {formatMoney(addon.priceCents)}\n                </b>\n\n                <div className=\"addon-library-actions\">\n                  <button\n                    className=\"secondary\"\n                    type=\"button\"\n                    onClick={() => editAddon(addon)}\n                  >\n                    <Pencil />\n                    Editar\n                  </button>\n\n                  <button\n                    className=\"secondary\"\n                    type=\"button\"\n                    onClick={() =>\n                      patch.mutate({\n                        path:\n                          `/admin/addons/${addon.id}`,\n                        body: {\n                          active: !addon.active,\n                        },\n                      })\n                    }\n                  >\n                    {addon.active\n                      ? \"Desativar\"\n                      : \"Ativar\"}\n                  </button>\n\n                  <button\n                    className=\"icon-button danger\"\n                    type=\"button\"\n                    aria-label={`Excluir ${addon.name}`}\n                    onClick={() =>\n                      confirm(\n                        \"Excluir este adicional da biblioteca e removê-lo dos produtos?\",\n                      ) &&\n                      remove.mutate(\n                        `/admin/addons/${addon.id}`,\n                      )\n                    }\n                  >\n                    <Trash2 />\n                  </button>\n                </div>\n              </article>\n            ))}\n          </div>\n        </div>\n      </section>\n\n      <section className=\"admin-form-grid\">\n        <form\n          className=\"admin-form\"\n          onSubmit={categorySubmit}\n        >\n          <h2>Nova categoria</h2>\n\n          <label className=\"field\">\n            <span>Nome</span>\n            <input name=\"name\" required />\n          </label>\n\n          <label className=\"field\">\n            <span>Posição</span>\n            <input\n              name=\"position\"\n              type=\"number\"\n              min=\"0\"\n              defaultValue=\"0\"\n            />\n          </label>\n\n          <button\n            className=\"primary\"\n            disabled={createCategory.isPending}\n          >\n            <Plus />\n            Criar categoria\n          </button>\n        </form>\n\n        <form\n          className=\"admin-form\"\n          onSubmit={productSubmit}\n        >\n          <h2>Novo produto</h2>\n\n          <label className=\"field\">\n            <span>Categoria</span>\n            <select\n              name=\"categoryId\"\n              required\n            >\n              <option value=\"\">\n                Selecione\n              </option>\n\n              {categories.data?.map(\n                (category) => (\n                  <option\n                    key={category.id}\n                    value={category.id}\n                  >\n                    {category.name}\n                  </option>\n                ),\n              )}\n            </select>\n          </label>\n\n          <label className=\"field\">\n            <span>Nome</span>\n            <input name=\"name\" required />\n          </label>\n\n          <label className=\"field\">\n            <span>Descrição</span>\n            <textarea name=\"description\" />\n          </label>\n\n          <div className=\"field-grid\">\n            <label className=\"field\">\n              <span>Preço em R$</span>\n              <input\n                name=\"price\"\n                type=\"number\"\n                min=\"0\"\n                step=\"0.01\"\n                required\n              />\n            </label>\n\n            <label className=\"field\">\n              <span>Posição</span>\n              <input\n                name=\"position\"\n                type=\"number\"\n                min=\"0\"\n                defaultValue=\"0\"\n              />\n            </label>\n          </div>\n\n          <label className=\"field\">\n            <span>Foto do produto</span>\n            <ImageUploadField\n              value={createImage}\n              onChange={setCreateImage}\n            />\n          </label>\n\n          <fieldset className=\"product-addon-picker\">\n            <legend>\n              Adicionais deste produto\n            </legend>\n\n            {activeAddons.length === 0 ? (\n              <p>\n                Cadastre adicionais na biblioteca\n                acima para poder selecioná-los.\n              </p>\n            ) : (\n              <div className=\"product-addon-grid\">\n                {activeAddons.map((addon) => (\n                  <label key={addon.id}>\n                    <input\n                      type=\"checkbox\"\n                      name=\"addonIds\"\n                      value={addon.id}\n                    />\n\n                    <span>\n                      <strong>{addon.name}</strong>\n                      <small>\n                        {formatMoney(\n                          addon.priceCents,\n                        )}\n                      </small>\n                    </span>\n                  </label>\n                ))}\n              </div>\n            )}\n\n            <label className=\"field addon-max-field\">\n              <span>\n                Máximo de adicionais por lanche\n              </span>\n              <input\n                name=\"addonMaxSelection\"\n                type=\"number\"\n                min=\"1\"\n                max=\"50\"\n                defaultValue=\"10\"\n              />\n            </label>\n          </fieldset>\n\n          <label className=\"admin-check\">\n            <input\n              name=\"featured\"\n              type=\"checkbox\"\n            />\n            Produto em destaque\n          </label>\n\n          {createProduct.error && (\n            <p className=\"error-text\">\n              {createProduct.error.message}\n            </p>\n          )}\n\n          <button\n            className=\"primary\"\n            disabled={\n              createProduct.isPending\n            }\n          >\n            <Plus />\n            {createProduct.isPending\n              ? \"Criando...\"\n              : \"Criar produto\"}\n          </button>\n        </form>\n      </section>\n\n      <section className=\"admin-products\">\n        <div className=\"section-title\">\n          <h2>Produtos</h2>\n          <span>\n            {products.data?.length ?? 0} cadastrados\n          </span>\n        </div>\n\n        {products.data?.map((product) => (\n          <article\n            className=\"admin-product\"\n            key={product.id}\n          >\n            <div className=\"admin-product-main\">\n              {product.imageUrl ? (\n                <img\n                  src={product.imageUrl}\n                  alt=\"\"\n                />\n              ) : (\n                <div className=\"admin-product-placeholder\">\n                  🍔\n                </div>\n              )}\n\n              <div>\n                <small>\n                  {product.category.name} · posição{\" \"}\n                  {product.position}\n                </small>\n                <h3>{product.name}</h3>\n                <p>{product.description}</p>\n                <strong>\n                  {formatMoney(product.priceCents)}\n                </strong>\n              </div>\n            </div>\n\n            <div className=\"admin-product-actions\">\n              <button\n                type=\"button\"\n                className=\"secondary\"\n                onClick={() => openEdit(product)}\n              >\n                <Pencil />\n                Editar\n              </button>\n\n              <button\n                type=\"button\"\n                className=\"secondary\"\n                onClick={() =>\n                  patch.mutate({\n                    path:\n                      `/admin/products/${product.id}`,\n                    body: {\n                      soldOut: !product.soldOut,\n                    },\n                  })\n                }\n              >\n                {product.soldOut\n                  ? \"Marcar disponível\"\n                  : \"Marcar esgotado\"}\n              </button>\n\n              <button\n                type=\"button\"\n                className=\"secondary\"\n                onClick={() =>\n                  patch.mutate({\n                    path:\n                      `/admin/products/${product.id}`,\n                    body: {\n                      active: !product.active,\n                    },\n                  })\n                }\n              >\n                {product.active\n                  ? \"Ocultar\"\n                  : \"Publicar\"}\n              </button>\n\n              <button\n                type=\"button\"\n                className=\"secondary\"\n                onClick={() =>\n                  addGroup(product.id)\n                }\n              >\n                Adicionar grupo\n              </button>\n\n              <button\n                type=\"button\"\n                className=\"icon-button danger\"\n                onClick={() =>\n                  confirm(\"Excluir produto?\") &&\n                  remove.mutate(\n                    `/admin/products/${product.id}`,\n                  )\n                }\n                aria-label={`Excluir ${product.name}`}\n              >\n                <Trash2 />\n              </button>\n            </div>\n\n            {product.optionGroups.map((group) => (\n              <div\n                className=\"admin-option-group\"\n                key={group.id}\n              >\n                <div>\n                  <div>\n                    <strong>{group.name}</strong>\n                    {group.libraryManaged && (\n                      <small>\n                        Sincronizado com a biblioteca de\n                        adicionais\n                      </small>\n                    )}\n                  </div>\n\n                  {!group.libraryManaged && (\n                    <button\n                      type=\"button\"\n                      onClick={() =>\n                        addOption(group.id)\n                      }\n                    >\n                      + opção\n                    </button>\n                  )}\n                </div>\n\n                {group.options.map((option) => (\n                  <span key={option.id}>\n                    {option.name}{\" \"}\n                    {option.priceCents > 0 &&\n                      `+ ${formatMoney(\n                        option.priceCents,\n                      )}`}\n\n                    {!group.libraryManaged && (\n                      <button\n                        type=\"button\"\n                        onClick={() =>\n                          remove.mutate(\n                            `/admin/options/${option.id}`,\n                          )\n                        }\n                        aria-label={`Excluir ${option.name}`}\n                      >\n                        ×\n                      </button>\n                    )}\n                  </span>\n                ))}\n              </div>\n            ))}\n          </article>\n        ))}\n      </section>\n\n      {editingProduct && (\n        <div\n          className=\"modal-backdrop\"\n          onMouseDown={() => {\n            setEditingProduct(null);\n            setEditImage(null);\n          }}\n        >\n          <form\n            className=\"modal admin-edit-modal\"\n            onSubmit={editSubmit}\n            onMouseDown={(event) =>\n              event.stopPropagation()\n            }\n          >\n            <button\n              className=\"icon-button close\"\n              type=\"button\"\n              onClick={() => {\n                setEditingProduct(null);\n                setEditImage(null);\n              }}\n              aria-label=\"Fechar edição\"\n            >\n              <X />\n            </button>\n\n            <div className=\"modal-body admin-edit-form\">\n              <small>Editar produto</small>\n              <h2>{editingProduct.name}</h2>\n\n              <label className=\"field\">\n                <span>Categoria</span>\n                <select\n                  name=\"categoryId\"\n                  defaultValue={\n                    editingProduct.categoryId\n                  }\n                  required\n                >\n                  {categories.data?.map(\n                    (category) => (\n                      <option\n                        key={category.id}\n                        value={category.id}\n                      >\n                        {category.name}\n                      </option>\n                    ),\n                  )}\n                </select>\n              </label>\n\n              <label className=\"field\">\n                <span>Nome</span>\n                <input\n                  name=\"name\"\n                  defaultValue={\n                    editingProduct.name\n                  }\n                  required\n                />\n              </label>\n\n              <label className=\"field\">\n                <span>Descrição</span>\n                <textarea\n                  name=\"description\"\n                  defaultValue={\n                    editingProduct.description\n                  }\n                />\n              </label>\n\n              <div className=\"field-grid\">\n                <label className=\"field\">\n                  <span>Preço em R$</span>\n                  <input\n                    name=\"price\"\n                    type=\"number\"\n                    min=\"0\"\n                    step=\"0.01\"\n                    defaultValue={\n                      editingProduct.priceCents /\n                      100\n                    }\n                    required\n                  />\n                </label>\n\n                <label className=\"field\">\n                  <span>\n                    Posição no cardápio\n                  </span>\n                  <input\n                    name=\"position\"\n                    type=\"number\"\n                    min=\"0\"\n                    defaultValue={\n                      editingProduct.position\n                    }\n                  />\n                </label>\n              </div>\n\n              <label className=\"field\">\n                <span>Foto do produto</span>\n                <ImageUploadField\n                  value={editImage}\n                  onChange={setEditImage}\n                />\n              </label>\n\n              <fieldset className=\"product-addon-picker\">\n                <legend>\n                  Adicionais deste produto\n                </legend>\n\n                <div className=\"product-addon-grid\">\n                  {addons.data?.map((addon) => (\n                    <label key={addon.id}>\n                      <input\n                        type=\"checkbox\"\n                        name=\"addonIds\"\n                        value={addon.id}\n                        defaultChecked={selectedAddonIds(\n                          editingProduct,\n                        ).includes(addon.id)}\n                      />\n\n                      <span>\n                        <strong>\n                          {addon.name}\n                        </strong>\n                        <small>\n                          {formatMoney(\n                            addon.priceCents,\n                          )}\n                          {!addon.active &&\n                            \" · desativado\"}\n                        </small>\n                      </span>\n                    </label>\n                  ))}\n                </div>\n\n                <label className=\"field addon-max-field\">\n                  <span>\n                    Máximo de adicionais por lanche\n                  </span>\n                  <input\n                    name=\"addonMaxSelection\"\n                    type=\"number\"\n                    min=\"1\"\n                    max=\"50\"\n                    defaultValue={\n                      addonGroup(editingProduct)\n                        ?.maxSelection ?? 10\n                    }\n                  />\n                </label>\n              </fieldset>\n\n              <div className=\"edit-check-grid\">\n                <label className=\"admin-check\">\n                  <input\n                    name=\"featured\"\n                    type=\"checkbox\"\n                    defaultChecked={\n                      editingProduct.featured\n                    }\n                  />\n                  Destaque\n                </label>\n\n                <label className=\"admin-check\">\n                  <input\n                    name=\"active\"\n                    type=\"checkbox\"\n                    defaultChecked={\n                      editingProduct.active\n                    }\n                  />\n                  Publicado\n                </label>\n\n                <label className=\"admin-check\">\n                  <input\n                    name=\"soldOut\"\n                    type=\"checkbox\"\n                    defaultChecked={\n                      editingProduct.soldOut\n                    }\n                  />\n                  Esgotado\n                </label>\n              </div>\n\n              {editProduct.error && (\n                <p className=\"error-text\">\n                  {editProduct.error.message}\n                </p>\n              )}\n\n              <button\n                className=\"primary\"\n                disabled={editProduct.isPending}\n              >\n                {editProduct.isPending\n                  ? \"Salvando...\"\n                  : \"Salvar alterações\"}\n              </button>\n            </div>\n          </form>\n        </div>\n      )}\n    </main>\n  );\n}\n",
);

appendOnce(
  "frontend/src/styles.css",
  "/* Biblioteca global de adicionais e upload Cloudinary */",
  "\n/* Biblioteca global de adicionais e upload Cloudinary */\n.addon-library-section {\n  margin: 28px 0 34px;\n}\n\n.addon-library-section .section-title {\n  align-items: flex-end;\n}\n\n.addon-library-section .section-title small {\n  color: var(--muted);\n}\n\n.addon-library-section .section-title h2 {\n  margin-top: 4px;\n}\n\n.addon-library-layout {\n  display: grid;\n  grid-template-columns: minmax(280px, 0.75fr) minmax(0, 1.5fr);\n  gap: 18px;\n  align-items: start;\n}\n\n.addon-library-list {\n  display: grid;\n  gap: 10px;\n}\n\n.addon-library-empty {\n  padding: 28px;\n  border: 1px dashed var(--border);\n  border-radius: 14px;\n  color: var(--muted);\n  text-align: center;\n}\n\n.addon-library-item {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto auto;\n  align-items: center;\n  gap: 16px;\n  padding: 14px 16px;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: var(--surface);\n}\n\n.addon-library-item.inactive {\n  opacity: 0.58;\n}\n\n.addon-library-item > div:first-child {\n  display: grid;\n  gap: 3px;\n}\n\n.addon-library-item small {\n  color: var(--muted);\n}\n\n.addon-library-item > b {\n  color: var(--yellow);\n  white-space: nowrap;\n}\n\n.addon-library-actions,\n.admin-image-actions {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 7px;\n}\n\n.addon-library-actions .secondary,\n.admin-image-actions .secondary {\n  padding: 9px 11px;\n  font-size: 12px;\n}\n\n.addon-library-actions svg,\n.admin-image-actions svg {\n  width: 16px;\n  height: 16px;\n}\n\n.admin-image-upload {\n  display: grid;\n  gap: 9px;\n}\n\n.admin-image-picker {\n  display: flex;\n  align-items: center;\n  justify-content: flex-start;\n  gap: 14px;\n  width: 100%;\n  min-height: 108px;\n  padding: 18px;\n  border: 1px dashed #655b50;\n  border-radius: 14px;\n  background: #141310;\n  color: #fff;\n  text-align: left;\n}\n\n.admin-image-picker:hover:not(:disabled) {\n  border-color: var(--orange);\n  background: rgba(255, 107, 26, 0.05);\n}\n\n.admin-image-picker > svg {\n  width: 34px;\n  height: 34px;\n  flex: 0 0 auto;\n  color: var(--orange);\n}\n\n.admin-image-picker span {\n  display: grid;\n  gap: 4px;\n}\n\n.admin-image-picker small,\n.admin-image-preview small {\n  color: var(--muted);\n  font-weight: 400;\n  line-height: 1.4;\n}\n\n.admin-image-preview {\n  display: grid;\n  grid-template-columns: 130px minmax(0, 1fr);\n  align-items: center;\n  gap: 16px;\n  padding: 12px;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: #141310;\n}\n\n.admin-image-preview img {\n  width: 130px;\n  height: 100px;\n  object-fit: cover;\n  border-radius: 10px;\n}\n\n.admin-image-preview > div {\n  display: grid;\n  gap: 5px;\n}\n\n.admin-image-actions {\n  margin-top: 8px;\n}\n\n.danger-outline {\n  color: #ff9999;\n  border-color: rgba(255, 125, 125, 0.28);\n}\n\n.spin {\n  animation: admin-spin 0.85s linear infinite;\n}\n\n@keyframes admin-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n.product-addon-picker {\n  margin: 17px 0;\n  padding: 16px;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: #161411;\n}\n\n.product-addon-picker legend {\n  padding: 0 7px;\n  font: 600 18px Oswald;\n  text-transform: uppercase;\n}\n\n.product-addon-picker > p {\n  color: var(--muted);\n  line-height: 1.5;\n}\n\n.product-addon-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 9px;\n}\n\n.product-addon-grid > label {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-width: 0;\n  padding: 11px 12px;\n  border: 1px solid var(--border);\n  border-radius: 11px;\n  background: #211e1a;\n  cursor: pointer;\n}\n\n.product-addon-grid > label:has(input:checked) {\n  border-color: var(--orange);\n  background: rgba(255, 107, 26, 0.08);\n}\n\n.product-addon-grid input {\n  width: 17px;\n  height: 17px;\n  flex: 0 0 auto;\n  accent-color: var(--orange);\n}\n\n.product-addon-grid span {\n  display: grid;\n  min-width: 0;\n  gap: 2px;\n}\n\n.product-addon-grid strong {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.product-addon-grid small {\n  color: var(--muted);\n}\n\n.addon-max-field {\n  max-width: 310px;\n  margin-top: 14px;\n}\n\n@media (max-width: 900px) {\n  .addon-library-layout {\n    grid-template-columns: 1fr;\n  }\n\n  .addon-library-item {\n    grid-template-columns: minmax(0, 1fr) auto;\n  }\n\n  .addon-library-actions {\n    grid-column: 1 / -1;\n  }\n}\n\n@media (max-width: 620px) {\n  .addon-library-item {\n    grid-template-columns: 1fr;\n  }\n\n  .addon-library-actions {\n    grid-column: auto;\n  }\n\n  .addon-library-actions .secondary {\n    flex: 1 1 120px;\n  }\n\n  .admin-image-preview {\n    grid-template-columns: 1fr;\n  }\n\n  .admin-image-preview img {\n    width: 100%;\n    height: 180px;\n  }\n\n  .product-addon-grid {\n    grid-template-columns: 1fr;\n  }\n}\n",
);

// Backup e gravação ------------------------------------------------------------

const backupDirectory = absolute(
  `backup-addons-cloudinary-${Date.now()}`,
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
Biblioteca de adicionais e Cloudinary aplicados.

Backup criado em:
  ${backupDirectory}

Agora execute:

  cd backend
  npm install
  npm run prisma:generate
  npm run prisma:push
  npm run build

  cd ../frontend
  npm run build
`);
