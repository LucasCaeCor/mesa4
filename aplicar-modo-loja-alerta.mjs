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

function findBlockEnd(
  content,
  startIndex,
  endToken = "\n  });",
) {
  const endIndex = content.indexOf(
    endToken,
    startIndex,
  );

  if (endIndex < 0) {
    throw new Error(
      "Não consegui localizar o final de um bloco da dashboard.",
    );
  }

  return endIndex + endToken.length;
}

function updateDashboard() {
  const relative =
    "frontend/src/pages/AdminDashboardPage.tsx";
  let content = read(relative);

  if (
    content.includes(
      "/* MESA4_STORE_OPEN_MODE */",
    )
  ) {
    console.log(
      `↷ ${relative} já possui o modo loja`,
    );
    stage(relative, content);
    return;
  }

  const orderTypeImport =
    'import type { OrderStatus } from "../types";';
  const orderTypeIndex =
    content.indexOf(orderTypeImport);

  if (orderTypeIndex < 0) {
    throw new Error(
      "Não encontrei o import de OrderStatus na dashboard.",
    );
  }

  const importEnd =
    orderTypeIndex + orderTypeImport.length;

  content =
    content.slice(0, importEnd) +
    `
import {
  useNewOrderAlerts,
  useStoreOpenMode,
} from "../hooks/useStoreOpenMode";` +
    content.slice(importEnd);

  const queryClientLine =
    "const queryClient = useQueryClient();";

  const queryClientIndex =
    content.indexOf(queryClientLine);

  if (queryClientIndex < 0) {
    throw new Error(
      "Não encontrei o início da dashboard administrativa.",
    );
  }

  const queryClientEnd =
    queryClientIndex + queryClientLine.length;

  content =
    content.slice(0, queryClientEnd) +
    `
  /* MESA4_STORE_OPEN_MODE */
  const storeMode = useStoreOpenMode();` +
    content.slice(queryClientEnd);

  const ordersStart = content.indexOf(
    "const orders = useQuery({",
    queryClientEnd,
  );
  const dashboardStart = content.indexOf(
    "const dashboard = useQuery({",
    ordersStart,
  );

  if (ordersStart < 0 || dashboardStart < 0) {
    throw new Error(
      "Não encontrei as consultas da dashboard.",
    );
  }

  let ordersBlock = content.slice(
    ordersStart,
    dashboardStart,
  );

  if (
    !ordersBlock.includes(
      "refetchIntervalInBackground:",
    )
  ) {
    const updatedOrdersBlock =
      ordersBlock.replace(
        /(refetchInterval:\s*10000,)/,
        `$1
    refetchIntervalInBackground:
      storeMode.enabled,`,
      );

    if (updatedOrdersBlock === ordersBlock) {
      throw new Error(
        "Não encontrei o intervalo de atualização dos pedidos.",
      );
    }

    ordersBlock = updatedOrdersBlock;
  }

  content =
    content.slice(0, ordersStart) +
    ordersBlock +
    `
  const newOrderAlert = useNewOrderAlerts(
    orders.data,
    storeMode,
  );
  ` +
    content.slice(dashboardStart);

  const headerStart = content.indexOf(
    '<header className="admin-header">',
  );
  const headerEnd = content.indexOf(
    "</header>",
    headerStart,
  );

  if (headerStart < 0 || headerEnd < 0) {
    throw new Error(
      "Não encontrei o cabeçalho da dashboard.",
    );
  }

  const refreshIconIndex = content.indexOf(
    "<RefreshCw />",
    headerStart,
  );
  const refreshButtonStart =
    content.lastIndexOf(
      "<button",
      refreshIconIndex,
    );

  if (
    refreshIconIndex < 0 ||
    refreshButtonStart < headerStart ||
    refreshButtonStart > headerEnd
  ) {
    throw new Error(
      "Não encontrei o botão Atualizar da dashboard.",
    );
  }

  const controls = `          <div className="store-mode-controls">
            <button
              className={\`store-mode-button \${
                storeMode.enabled ? "active" : ""
              }\`}
              type="button"
              onClick={() => {
                if (storeMode.enabled) {
                  storeMode.deactivate();
                } else {
                  void storeMode.activate();
                }
              }}
            >
              <span className="store-mode-dot" />
              {storeMode.enabled
                ? "Loja aberta"
                : "Ativar modo loja"}
            </button>

            {storeMode.enabled && (
              <button
                className="store-sound-test"
                type="button"
                onClick={() =>
                  void storeMode.testSound()
                }
              >
                🔊 Testar som
              </button>
            )}

            {storeMode.enabled &&
              !storeMode.audioReady && (
                <small className="store-audio-warning">
                  Clique em “Testar som” para liberar
                  o áudio nesta sessão.
                </small>
              )}
          </div>

`;

  content =
    content.slice(0, refreshButtonStart) +
    controls +
    content.slice(refreshButtonStart);

  const updatedHeaderEnd = content.indexOf(
    "</header>",
    headerStart,
  );
  const updatedHeaderCloseEnd =
    updatedHeaderEnd + "</header>".length;

  const alertBanner = `

      {newOrderAlert.latestOrder && (
        <section
          className="new-order-alert"
          role="alert"
          aria-live="assertive"
        >
          <span className="new-order-alert-icon">
            🔔
          </span>

          <div className="new-order-alert-copy">
            <strong>
              {newOrderAlert.newOrderCount > 1
                ? \`\${newOrderAlert.newOrderCount} novos pedidos\`
                : "Novo pedido"}
            </strong>
            <span>
              {newOrderAlert.latestOrder.publicId} ·{" "}
              {newOrderAlert.latestOrder.customerName}
            </span>
            <small>
              {formatMoney(
                newOrderAlert.latestOrder.totalCents,
              )}
            </small>
          </div>

          <button
            type="button"
            onClick={() => {
              const orderId =
                newOrderAlert.latestOrder?.id;

              if (!orderId) {
                return;
              }

              newOrderAlert.acknowledge(orderId);

              document
                .getElementById(
                  \`admin-order-\${orderId}\`,
                )
                ?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
            }}
          >
            Ver pedido
          </button>
        </section>
      )}`;

  content =
    content.slice(0, updatedHeaderCloseEnd) +
    alertBanner +
    content.slice(updatedHeaderCloseEnd);

  const articlePattern =
    /<article\s*\n(\s*)className="admin-order"\s*\n(\s*)key=\{order\.id\}/;
  const inlineArticlePattern =
    /<article className="admin-order" key=\{order\.id\}/;

  if (articlePattern.test(content)) {
    content = content.replace(
      articlePattern,
      `<article
$1id={\`admin-order-\${order.id}\`}
$1className={\`admin-order \${
$1  newOrderAlert.highlightedOrderIds.has(
$1    order.id,
$1  )
$1    ? "new-order-highlight"
$1    : ""
$1}\`}
$1onClick={() =>
$1  newOrderAlert.acknowledge(order.id)
$1}
$2key={order.id}`,
    );
  } else if (inlineArticlePattern.test(content)) {
    content = content.replace(
      inlineArticlePattern,
      `<article
                id={\`admin-order-\${order.id}\`}
                className={\`admin-order \${
                  newOrderAlert.highlightedOrderIds.has(
                    order.id,
                  )
                    ? "new-order-highlight"
                    : ""
                }\`}
                onClick={() =>
                  newOrderAlert.acknowledge(order.id)
                }
                key={order.id}`,
    );
  } else {
    console.warn(
      "Aviso: não consegui adicionar o destaque ao cartão, mas som, notificação e banner foram instalados.",
    );
  }

  stage(relative, content);
}

updateDashboard();

stage(
  "frontend/src/hooks/useStoreOpenMode.ts",
  "import {\n  type MutableRefObject,\n  useCallback,\n  useEffect,\n  useRef,\n  useState,\n} from \"react\";\nimport { adminApi } from \"../lib/api\";\n\nconst STORAGE_KEY = \"mesa4.store-open-mode\";\n\nexport type StoreOrderSummary = {\n  id: string;\n  publicId: string;\n  customerName: string;\n  totalCents: number;\n  createdAt: string;\n};\n\ntype StoreModeController = {\n  enabled: boolean;\n  audioReady: boolean;\n  activate: () => Promise<void>;\n  deactivate: () => void;\n  testSound: () => Promise<void>;\n  alertForOrder: (\n    order: StoreOrderSummary,\n  ) => void;\n};\n\ntype AudioWindow = Window &\n  typeof globalThis & {\n    webkitAudioContext?: typeof AudioContext;\n  };\n\nfunction createAudioContext() {\n  const AudioContextClass =\n    window.AudioContext ||\n    (window as AudioWindow).webkitAudioContext;\n\n  return AudioContextClass\n    ? new AudioContextClass()\n    : null;\n}\n\nasync function playAlert(\n  contextRef: MutableRefObject<AudioContext | null>,\n  kind: \"test\" | \"order\",\n) {\n  const context =\n    contextRef.current ?? createAudioContext();\n\n  if (!context) {\n    throw new Error(\n      \"Este navegador não oferece suporte ao alerta sonoro.\",\n    );\n  }\n\n  contextRef.current = context;\n\n  if (context.state === \"suspended\") {\n    await context.resume();\n  }\n\n  const pattern =\n    kind === \"test\"\n      ? [880, 1100]\n      : [880, 1100, 880, 1320, 1100, 1320];\n\n  const startAt = context.currentTime + 0.03;\n\n  pattern.forEach((frequency, index) => {\n    const oscillator = context.createOscillator();\n    const gain = context.createGain();\n    const toneStart = startAt + index * 0.18;\n    const toneEnd = toneStart + 0.13;\n\n    oscillator.type = \"square\";\n    oscillator.frequency.setValueAtTime(\n      frequency,\n      toneStart,\n    );\n\n    gain.gain.setValueAtTime(0.0001, toneStart);\n    gain.gain.exponentialRampToValueAtTime(\n      kind === \"order\" ? 0.22 : 0.12,\n      toneStart + 0.018,\n    );\n    gain.gain.exponentialRampToValueAtTime(\n      0.0001,\n      toneEnd,\n    );\n\n    oscillator.connect(gain);\n    gain.connect(context.destination);\n\n    oscillator.start(toneStart);\n    oscillator.stop(toneEnd + 0.02);\n  });\n}\n\nasync function requestNotificationPermission() {\n  if (\n    !(\"Notification\" in window) ||\n    Notification.permission !== \"default\"\n  ) {\n    return;\n  }\n\n  try {\n    await Notification.requestPermission();\n  } catch {\n    // O som e o alerta visual continuam funcionando.\n  }\n}\n\nexport function useStoreOpenMode(): StoreModeController {\n  const [enabled, setEnabled] = useState(() => {\n    try {\n      return (\n        window.localStorage.getItem(STORAGE_KEY) ===\n        \"enabled\"\n      );\n    } catch {\n      return false;\n    }\n  });\n  const [audioReady, setAudioReady] =\n    useState(false);\n  const audioContextRef =\n    useRef<AudioContext | null>(null);\n\n  const saveEnabled = useCallback(\n    (nextEnabled: boolean) => {\n      setEnabled(nextEnabled);\n\n      try {\n        if (nextEnabled) {\n          window.localStorage.setItem(\n            STORAGE_KEY,\n            \"enabled\",\n          );\n        } else {\n          window.localStorage.removeItem(\n            STORAGE_KEY,\n          );\n        }\n      } catch {\n        // O modo continua funcionando nesta sessão.\n      }\n    },\n    [],\n  );\n\n  const testSound = useCallback(async () => {\n    await requestNotificationPermission();\n    await playAlert(audioContextRef, \"test\");\n    setAudioReady(true);\n  }, []);\n\n  const activate = useCallback(async () => {\n    saveEnabled(true);\n\n    try {\n      await testSound();\n    } catch (error) {\n      console.warn(\n        \"[Modo loja] Não foi possível liberar o áudio\",\n        error,\n      );\n    }\n  }, [saveEnabled, testSound]);\n\n  const deactivate = useCallback(() => {\n    saveEnabled(false);\n  }, [saveEnabled]);\n\n  const alertForOrder = useCallback(\n    (order: StoreOrderSummary) => {\n      void playAlert(audioContextRef, \"order\").catch(\n        (error) => {\n          console.warn(\n            \"[Modo loja] O som está bloqueado. Clique em Testar som.\",\n            error,\n          );\n          setAudioReady(false);\n        },\n      );\n\n      if (\n        \"Notification\" in window &&\n        Notification.permission === \"granted\"\n      ) {\n        try {\n          const notification = new Notification(\n            \"Novo pedido — Mesa IV Burgers\",\n            {\n              body:\n                `${order.publicId} · ${order.customerName}`,\n              icon: \"/favicon.ico\",\n              tag: `mesa4-order-${order.id}`,\n              requireInteraction: true,\n            },\n          );\n\n          notification.onclick = () => {\n            window.focus();\n            notification.close();\n          };\n        } catch (error) {\n          console.warn(\n            \"[Modo loja] Notificação indisponível\",\n            error,\n          );\n        }\n      }\n\n      if (\"vibrate\" in navigator) {\n        navigator.vibrate([\n          250,\n          120,\n          250,\n          120,\n          450,\n        ]);\n      }\n    },\n    [],\n  );\n\n  useEffect(() => {\n    if (!enabled) {\n      return;\n    }\n\n    const keepBackendAwake = () => {\n      void adminApi(\"/admin/dashboard\").catch(\n        (error) => {\n          console.warn(\n            \"[Modo loja] Não foi possível verificar o backend\",\n            error,\n          );\n        },\n      );\n    };\n\n    keepBackendAwake();\n\n    const interval = window.setInterval(\n      keepBackendAwake,\n      8 * 60 * 1000,\n    );\n\n    window.addEventListener(\n      \"online\",\n      keepBackendAwake,\n    );\n    window.addEventListener(\n      \"focus\",\n      keepBackendAwake,\n    );\n\n    return () => {\n      window.clearInterval(interval);\n      window.removeEventListener(\n        \"online\",\n        keepBackendAwake,\n      );\n      window.removeEventListener(\n        \"focus\",\n        keepBackendAwake,\n      );\n    };\n  }, [enabled]);\n\n  useEffect(\n    () => () => {\n      void audioContextRef.current?.close();\n    },\n    [],\n  );\n\n  return {\n    enabled,\n    audioReady,\n    activate,\n    deactivate,\n    testSound,\n    alertForOrder,\n  };\n}\n\nexport function useNewOrderAlerts(\n  orders: StoreOrderSummary[] | undefined,\n  storeMode: StoreModeController,\n) {\n  const knownOrderIdsRef =\n    useRef<Set<string> | null>(null);\n  const originalTitleRef = useRef(\n    document.title,\n  );\n  const titleIntervalRef =\n    useRef<number | null>(null);\n  const [highlightedOrderIds, setHighlightedOrderIds] =\n    useState<Set<string>>(() => new Set());\n  const [latestOrder, setLatestOrder] =\n    useState<StoreOrderSummary | null>(null);\n  const [newOrderCount, setNewOrderCount] =\n    useState(0);\n\n  const stopTitleAlert = useCallback(() => {\n    if (titleIntervalRef.current !== null) {\n      window.clearInterval(\n        titleIntervalRef.current,\n      );\n      titleIntervalRef.current = null;\n    }\n\n    document.title = originalTitleRef.current;\n  }, []);\n\n  const startTitleAlert = useCallback(() => {\n    stopTitleAlert();\n\n    let showAlert = true;\n    document.title = \"🔔 NOVO PEDIDO!\";\n\n    titleIntervalRef.current =\n      window.setInterval(() => {\n        document.title = showAlert\n          ? originalTitleRef.current\n          : \"🔔 NOVO PEDIDO!\";\n        showAlert = !showAlert;\n      }, 750);\n  }, [stopTitleAlert]);\n\n  const acknowledge = useCallback(\n    (orderId: string) => {\n      setHighlightedOrderIds((current) => {\n        const next = new Set(current);\n        next.delete(orderId);\n        return next;\n      });\n\n      setLatestOrder((current) =>\n        current?.id === orderId ? null : current,\n      );\n      setNewOrderCount((current) =>\n        Math.max(0, current - 1),\n      );\n      stopTitleAlert();\n    },\n    [stopTitleAlert],\n  );\n\n  useEffect(() => {\n    if (!orders) {\n      return;\n    }\n\n    const currentIds = new Set(\n      orders.map((order) => order.id),\n    );\n\n    if (knownOrderIdsRef.current === null) {\n      knownOrderIdsRef.current = currentIds;\n      return;\n    }\n\n    const newOrders = orders\n      .filter(\n        (order) =>\n          !knownOrderIdsRef.current?.has(order.id),\n      )\n      .sort(\n        (first, second) =>\n          new Date(first.createdAt).getTime() -\n          new Date(second.createdAt).getTime(),\n      );\n\n    knownOrderIdsRef.current = new Set([\n      ...knownOrderIdsRef.current,\n      ...currentIds,\n    ]);\n\n    if (\n      !storeMode.enabled ||\n      newOrders.length === 0\n    ) {\n      return;\n    }\n\n    const newestOrder =\n      newOrders[newOrders.length - 1];\n\n    setHighlightedOrderIds((current) => {\n      const next = new Set(current);\n\n      newOrders.forEach((order) => {\n        next.add(order.id);\n      });\n\n      return next;\n    });\n\n    setLatestOrder(newestOrder);\n    setNewOrderCount((current) =>\n      current + newOrders.length,\n    );\n\n    storeMode.alertForOrder(newestOrder);\n    startTitleAlert();\n  }, [\n    orders,\n    startTitleAlert,\n    storeMode.alertForOrder,\n    storeMode.enabled,\n  ]);\n\n  useEffect(() => {\n    if (!storeMode.enabled) {\n      stopTitleAlert();\n      setLatestOrder(null);\n      setNewOrderCount(0);\n      setHighlightedOrderIds(new Set());\n    }\n  }, [stopTitleAlert, storeMode.enabled]);\n\n  useEffect(\n    () => () => {\n      stopTitleAlert();\n    },\n    [stopTitleAlert],\n  );\n\n  return {\n    highlightedOrderIds,\n    latestOrder,\n    newOrderCount,\n    acknowledge,\n  };\n}\n",
);

{
  const relative = "frontend/src/styles.css";
  const marker =
    "/* Modo loja aberta e alerta de novos pedidos */";
  const current = read(relative);

  if (!current.includes(marker)) {
    stage(
      relative,
      `${current.trimEnd()}\n\n${"\n/* Modo loja aberta e alerta de novos pedidos */\n.store-mode-controls {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n.store-mode-button,\n.store-sound-test {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 9px;\n  min-height: 43px;\n  border: 1px solid var(--border);\n  border-radius: 12px;\n  color: #fff;\n  font-weight: 700;\n}\n\n.store-mode-button {\n  padding: 11px 15px;\n  background: #2a211b;\n}\n\n.store-mode-button.active {\n  border-color: rgba(88, 223, 126, 0.42);\n  background: rgba(45, 169, 82, 0.14);\n  color: #8ff0a9;\n}\n\n.store-mode-dot {\n  width: 10px;\n  height: 10px;\n  border-radius: 50%;\n  background: #8f8780;\n}\n\n.store-mode-button.active .store-mode-dot {\n  background: #53e47c;\n  box-shadow: 0 0 0 0 rgba(83, 228, 124, 0.55);\n  animation: store-mode-pulse 1.7s infinite;\n}\n\n.store-sound-test {\n  padding: 10px 13px;\n  background: var(--surface-2);\n  font-size: 12px;\n}\n\n.store-audio-warning {\n  width: 100%;\n  color: #ffd071;\n  font-size: 11px;\n  text-align: right;\n}\n\n@keyframes store-mode-pulse {\n  70% {\n    box-shadow: 0 0 0 9px rgba(83, 228, 124, 0);\n  }\n\n  100% {\n    box-shadow: 0 0 0 0 rgba(83, 228, 124, 0);\n  }\n}\n\n.new-order-alert {\n  position: fixed;\n  z-index: 350;\n  top: 18px;\n  left: 50%;\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  width: min(680px, calc(100vw - 28px));\n  padding: 16px 18px;\n  border: 2px solid #ffd65a;\n  border-radius: 16px;\n  background:\n    linear-gradient(\n      115deg,\n      rgba(255, 107, 26, 0.98),\n      rgba(193, 51, 15, 0.98)\n    );\n  color: #fff;\n  box-shadow:\n    0 18px 70px rgba(0, 0, 0, 0.52),\n    0 0 0 5px rgba(255, 207, 67, 0.12);\n  transform: translateX(-50%);\n  animation:\n    new-order-enter 220ms ease-out,\n    new-order-attention 1.05s ease-in-out 3;\n}\n\n.new-order-alert-icon {\n  display: grid;\n  width: 49px;\n  height: 49px;\n  flex: 0 0 auto;\n  place-items: center;\n  border-radius: 50%;\n  background: rgba(255, 255, 255, 0.17);\n  font-size: 25px;\n}\n\n.new-order-alert-copy {\n  display: grid;\n  min-width: 0;\n  flex: 1;\n  gap: 3px;\n}\n\n.new-order-alert-copy strong {\n  font: 700 20px Oswald;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n}\n\n.new-order-alert-copy span,\n.new-order-alert-copy small {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.new-order-alert-copy small {\n  color: rgba(255, 255, 255, 0.78);\n}\n\n.new-order-alert button {\n  flex: 0 0 auto;\n  padding: 10px 14px;\n  border: 0;\n  border-radius: 10px;\n  background: #fff;\n  color: #40160b;\n  font-weight: 800;\n}\n\n@keyframes new-order-enter {\n  from {\n    opacity: 0;\n    transform: translate(-50%, -22px) scale(0.96);\n  }\n\n  to {\n    opacity: 1;\n    transform: translate(-50%, 0) scale(1);\n  }\n}\n\n@keyframes new-order-attention {\n  0%,\n  100% {\n    filter: brightness(1);\n  }\n\n  50% {\n    filter: brightness(1.22);\n  }\n}\n\n.admin-order.new-order-highlight {\n  position: relative;\n  border-color: #ffd65a;\n  box-shadow:\n    0 0 0 2px rgba(255, 214, 90, 0.13),\n    0 15px 45px rgba(255, 107, 26, 0.12);\n  animation: highlighted-order-pulse 1.15s ease-in-out 5;\n}\n\n.admin-order.new-order-highlight::before {\n  content: \"NOVO PEDIDO\";\n  position: absolute;\n  top: -11px;\n  right: 18px;\n  padding: 5px 10px;\n  border-radius: 999px;\n  background: #ffd65a;\n  color: #23180a;\n  font-size: 10px;\n  font-weight: 900;\n  letter-spacing: 0.06em;\n}\n\n@keyframes highlighted-order-pulse {\n  0%,\n  100% {\n    transform: scale(1);\n  }\n\n  50% {\n    transform: scale(1.008);\n  }\n}\n\n@media (max-width: 800px) {\n  .admin-header {\n    gap: 14px;\n  }\n\n  .admin-header > div:last-child {\n    display: grid;\n    justify-items: stretch;\n  }\n\n  .store-mode-controls {\n    display: grid;\n    grid-template-columns: 1fr;\n  }\n\n  .store-mode-button,\n  .store-sound-test {\n    width: 100%;\n  }\n\n  .store-audio-warning {\n    text-align: left;\n  }\n\n  .new-order-alert {\n    top: 10px;\n    align-items: flex-start;\n    gap: 10px;\n    padding: 13px;\n  }\n\n  .new-order-alert-icon {\n    width: 40px;\n    height: 40px;\n    font-size: 20px;\n  }\n\n  .new-order-alert-copy strong {\n    font-size: 17px;\n  }\n\n  .new-order-alert button {\n    padding: 9px 10px;\n    font-size: 12px;\n  }\n}\n"}\n`,
    );
  }
}

const backupDirectory = absolute(
  `backup-modo-loja-${Date.now()}`,
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
Modo loja aberta instalado.

Backup criado em:
  ${backupDirectory}

Agora execute:

  cd frontend
  npm run build

Não é necessário alterar o Prisma nem o backend.
`);
