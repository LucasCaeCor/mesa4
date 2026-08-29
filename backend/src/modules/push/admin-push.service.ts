import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import {
  getMessaging,
} from "firebase-admin/messaging";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

const APP_NAME = "mesa4-admin-push";
const CHANNEL_ID = "new_orders";

type PushData = Record<string, string>;

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

let cachedApp: App | null | undefined;

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function firebaseApp(): App | null {
  if (cachedApp !== undefined) {
    return cachedApp;
  }

  if (!env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    cachedApp = null;
    return null;
  }

  try {
    const raw = Buffer.from(
      env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      "base64",
    ).toString("utf8");

    const parsed =
      JSON.parse(raw) as ServiceAccountJson;

    if (
      !parsed.project_id ||
      !parsed.client_email ||
      !parsed.private_key
    ) {
      throw new Error(
        "Credencial Firebase incompleta",
      );
    }

    const serviceAccount: ServiceAccount = {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };

    cachedApp =
      getApps().find(
        (candidate) =>
          candidate.name === APP_NAME,
      ) ??
      initializeApp(
        {
          credential: cert(serviceAccount),
          projectId: parsed.project_id,
        },
        APP_NAME,
      );

    return cachedApp;
  } catch (error) {
    console.error(
      "Falha ao inicializar Firebase Admin",
      error,
    );

    cachedApp = null;
    return null;
  }
}

async function sendToFids(
  fids: string[],
  title: string,
  body: string,
  data: PushData,
) {
  const app = firebaseApp();

  if (!app || fids.length === 0) {
    return {
      configured: Boolean(app),
      sent: 0,
      failed: 0,
    };
  }

  let sent = 0;
  let failed = 0;
  const staleFids: string[] = [];

  for (
    let offset = 0;
    offset < fids.length;
    offset += 500
  ) {
    const batch =
      fids.slice(offset, offset + 500);

    const response =
      await getMessaging(app)
        .sendEachForMulticast({
          fids: batch,
          notification: {
            title,
            body,
          },
          data: {
            ...data,
            title,
            body,
          },
          android: {
            priority: "high",
            notification: {
              channelId: CHANNEL_ID,
              sound: "default",
              tag:
                data.orderPublicId
                  ? `order-${data.orderPublicId}`
                  : "mesa4-admin",
            },
          },
        });

    sent += response.successCount;
    failed += response.failureCount;

    response.responses.forEach(
      (item, index) => {
        if (item.success) {
          return;
        }

        const code =
          item.error?.code ?? "";

        if (
          code.includes("not-registered") ||
          code.includes("invalid-registration")
        ) {
          staleFids.push(batch[index]);
        }
      },
    );
  }

  if (staleFids.length > 0) {
    await prisma.adminPushDevice.updateMany({
      where: {
        fid: {
          in: staleFids,
        },
      },
      data: {
        active: false,
      },
    });
  }

  return {
    configured: true,
    sent,
    failed,
  };
}

export async function sendNewOrderPush(
  input: {
    publicId: string;
    customerName: string;
    totalCents: number;
  },
) {
  const devices =
    await prisma.adminPushDevice.findMany({
      where: {
        active: true,
      },
      select: {
        fid: true,
      },
    });

  return sendToFids(
    devices.map(
      (device) => device.fid,
    ),
    `Novo pedido ${input.publicId}`,
    `${input.customerName} • ${formatMoney(
      input.totalCents,
    )}`,
    {
      type: "NEW_ORDER",
      orderPublicId: input.publicId,
      path:
        `/admin?pedido=${encodeURIComponent(
          input.publicId,
        )}`,
    },
  );
}

export async function sendAdminPushTest(
  adminId: string,
) {
  const devices =
    await prisma.adminPushDevice.findMany({
      where: {
        adminId,
        active: true,
      },
      select: {
        fid: true,
      },
    });

  return sendToFids(
    devices.map(
      (device) => device.fid,
    ),
    "Mesa IV Admin",
    "As notificações de novos pedidos estão funcionando.",
    {
      type: "TEST",
      path: "/admin",
    },
  );
}
