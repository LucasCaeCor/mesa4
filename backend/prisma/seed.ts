import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@mesa4.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "troque-esta-senha";
  const name = process.env.ADMIN_NAME ?? "Administrador";

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.upsert({
    where: { email },
    update: { name, passwordHash, active: true },
    create: { name, email, passwordHash },
  });

  await prisma.storeSettings.upsert({
    where: { singletonKey: "default" },
    update: {},
    create: {
      singletonKey: "default",
      storeName: "Mesa IV Burgers",
      description: "Burgers, smash e combos preparados para matar a fome.",
      whatsappNumber: "5500000000000",
      instagramUrl: "https://www.instagram.com/mesaivburgers/",
      minimumOrderCents: 0,
      deliveryFeeCents: 0,
      defaultPrepMinutes: 40,
    },
  });

  const category = await prisma.category.upsert({
    where: { slug: "burgers" },
    update: {},
    create: { name: "Burgers", slug: "burgers", position: 1 },
  });

  const product = await prisma.product.upsert({
    where: { slug: "smash-classico" },
    update: {},
    create: {
      categoryId: category.id,
      name: "Smash Clássico",
      slug: "smash-classico",
      description: "Produto demonstrativo. Edite pelo painel antes de publicar.",
      priceCents: 2500,
      featured: true,
    },
  });

  const existingGroup = await prisma.productOptionGroup.findFirst({
    where: { productId: product.id, name: "Adicionais" },
  });

  if (!existingGroup) {
    await prisma.productOptionGroup.create({
      data: {
        productId: product.id,
        name: "Adicionais",
        required: false,
        minSelection: 0,
        maxSelection: 3,
        options: {
          create: [
            { name: "Carne extra", priceCents: 700, position: 1 },
            { name: "Queijo extra", priceCents: 300, position: 2 },
          ],
        },
      },
    });
  }

  const hours = [
    { weekday: 0, enabled: true, opensAt: "18:00", closesAt: "23:00" },
    { weekday: 1, enabled: false, opensAt: "18:00", closesAt: "23:00" },
    { weekday: 2, enabled: true, opensAt: "18:00", closesAt: "23:00" },
    { weekday: 3, enabled: true, opensAt: "18:00", closesAt: "23:00" },
    { weekday: 4, enabled: true, opensAt: "18:00", closesAt: "23:00" },
    { weekday: 5, enabled: true, opensAt: "18:00", closesAt: "23:59" },
    { weekday: 6, enabled: true, opensAt: "18:00", closesAt: "23:59" },
  ];

  for (const hour of hours) {
    const existing =
      await prisma.businessHour.findFirst({
        where: {
          weekday: hour.weekday,
          position: 0,
        },
      });

    if (!existing) {
      await prisma.businessHour.create({
        data: {
          ...hour,
          position: 0,
        },
      });
    }
  }

  console.log(`Seed concluído. Admin: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
