import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { adminApi } from "../lib/api";

const STORAGE_KEY = "mesa4.store-open-mode";

export type StoreOrderSummary = {
  id: string;
  publicId: string;
  customerName: string;
  totalCents: number;
  createdAt: string;
};

type StoreModeController = {
  enabled: boolean;
  audioReady: boolean;
  activate: () => Promise<void>;
  deactivate: () => void;
  testSound: () => Promise<void>;
  alertForOrder: (
    order: StoreOrderSummary,
  ) => void;
};

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function createAudioContext() {
  const AudioContextClass =
    window.AudioContext ||
    (window as AudioWindow).webkitAudioContext;

  return AudioContextClass
    ? new AudioContextClass()
    : null;
}

async function playAlert(
  contextRef: MutableRefObject<AudioContext | null>,
  kind: "test" | "order",
) {
  const context =
    contextRef.current ?? createAudioContext();

  if (!context) {
    throw new Error(
      "Este navegador não oferece suporte ao alerta sonoro.",
    );
  }

  contextRef.current = context;

  if (context.state === "suspended") {
    await context.resume();
  }

  const pattern =
    kind === "test"
      ? [880, 1100]
      : [880, 1100, 880, 1320, 1100, 1320];

  const startAt = context.currentTime + 0.03;

  pattern.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const toneStart = startAt + index * 0.18;
    const toneEnd = toneStart + 0.13;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(
      frequency,
      toneStart,
    );

    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(
      kind === "order" ? 0.22 : 0.12,
      toneStart + 0.018,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      toneEnd,
    );

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(toneStart);
    oscillator.stop(toneEnd + 0.02);
  });
}

async function requestNotificationPermission() {
  if (
    !("Notification" in window) ||
    Notification.permission !== "default"
  ) {
    return;
  }

  try {
    await Notification.requestPermission();
  } catch {
    // O som e o alerta visual continuam funcionando.
  }
}

export function useStoreOpenMode(): StoreModeController {
  const [enabled, setEnabled] = useState(() => {
    try {
      return (
        window.localStorage.getItem(STORAGE_KEY) ===
        "enabled"
      );
    } catch {
      return false;
    }
  });
  const [audioReady, setAudioReady] =
    useState(false);
  const audioContextRef =
    useRef<AudioContext | null>(null);

  const saveEnabled = useCallback(
    (nextEnabled: boolean) => {
      setEnabled(nextEnabled);

      try {
        if (nextEnabled) {
          window.localStorage.setItem(
            STORAGE_KEY,
            "enabled",
          );
        } else {
          window.localStorage.removeItem(
            STORAGE_KEY,
          );
        }
      } catch {
        // O modo continua funcionando nesta sessão.
      }
    },
    [],
  );

  const testSound = useCallback(async () => {
    await requestNotificationPermission();
    await playAlert(audioContextRef, "test");
    setAudioReady(true);
  }, []);

  const activate = useCallback(async () => {
    saveEnabled(true);

    try {
      await testSound();
    } catch (error) {
      console.warn(
        "[Modo loja] Não foi possível liberar o áudio",
        error,
      );
    }
  }, [saveEnabled, testSound]);

  const deactivate = useCallback(() => {
    saveEnabled(false);
  }, [saveEnabled]);

  const alertForOrder = useCallback(
    (order: StoreOrderSummary) => {
      void playAlert(audioContextRef, "order").catch(
        (error) => {
          console.warn(
            "[Modo loja] O som está bloqueado. Clique em Testar som.",
            error,
          );
          setAudioReady(false);
        },
      );

      if (
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const notification = new Notification(
            "Novo pedido — Mesa IV Burgers",
            {
              body:
                `${order.publicId} · ${order.customerName}`,
              icon: "/favicon.ico",
              tag: `mesa4-order-${order.id}`,
              requireInteraction: true,
            },
          );

          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        } catch (error) {
          console.warn(
            "[Modo loja] Notificação indisponível",
            error,
          );
        }
      }

      if ("vibrate" in navigator) {
        navigator.vibrate([
          250,
          120,
          250,
          120,
          450,
        ]);
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const keepBackendAwake = () => {
      void adminApi("/admin/dashboard").catch(
        (error) => {
          console.warn(
            "[Modo loja] Não foi possível verificar o backend",
            error,
          );
        },
      );
    };

    keepBackendAwake();

    const interval = window.setInterval(
      keepBackendAwake,
      8 * 60 * 1000,
    );

    window.addEventListener(
      "online",
      keepBackendAwake,
    );
    window.addEventListener(
      "focus",
      keepBackendAwake,
    );

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(
        "online",
        keepBackendAwake,
      );
      window.removeEventListener(
        "focus",
        keepBackendAwake,
      );
    };
  }, [enabled]);

  useEffect(
    () => () => {
      void audioContextRef.current?.close();
    },
    [],
  );

  return {
    enabled,
    audioReady,
    activate,
    deactivate,
    testSound,
    alertForOrder,
  };
}

export function useNewOrderAlerts(
  orders: StoreOrderSummary[] | undefined,
  storeMode: StoreModeController,
) {
  const knownOrderIdsRef =
    useRef<Set<string> | null>(null);
  const originalTitleRef = useRef(
    document.title,
  );
  const titleIntervalRef =
    useRef<number | null>(null);
  const [highlightedOrderIds, setHighlightedOrderIds] =
    useState<Set<string>>(() => new Set());
  const [latestOrder, setLatestOrder] =
    useState<StoreOrderSummary | null>(null);
  const [newOrderCount, setNewOrderCount] =
    useState(0);

  const stopTitleAlert = useCallback(() => {
    if (titleIntervalRef.current !== null) {
      window.clearInterval(
        titleIntervalRef.current,
      );
      titleIntervalRef.current = null;
    }

    document.title = originalTitleRef.current;
  }, []);

  const startTitleAlert = useCallback(() => {
    stopTitleAlert();

    let showAlert = true;
    document.title = "🔔 NOVO PEDIDO!";

    titleIntervalRef.current =
      window.setInterval(() => {
        document.title = showAlert
          ? originalTitleRef.current
          : "🔔 NOVO PEDIDO!";
        showAlert = !showAlert;
      }, 750);
  }, [stopTitleAlert]);

  const acknowledge = useCallback(
    (orderId: string) => {
      setHighlightedOrderIds((current) => {
        const next = new Set(current);
        next.delete(orderId);
        return next;
      });

      setLatestOrder((current) =>
        current?.id === orderId ? null : current,
      );
      setNewOrderCount((current) =>
        Math.max(0, current - 1),
      );
      stopTitleAlert();
    },
    [stopTitleAlert],
  );

  useEffect(() => {
    if (!orders) {
      return;
    }

    const currentIds = new Set(
      orders.map((order) => order.id),
    );

    if (knownOrderIdsRef.current === null) {
      knownOrderIdsRef.current = currentIds;
      return;
    }

    const newOrders = orders
      .filter(
        (order) =>
          !knownOrderIdsRef.current?.has(order.id),
      )
      .sort(
        (first, second) =>
          new Date(first.createdAt).getTime() -
          new Date(second.createdAt).getTime(),
      );

    knownOrderIdsRef.current = new Set([
      ...knownOrderIdsRef.current,
      ...currentIds,
    ]);

    if (
      !storeMode.enabled ||
      newOrders.length === 0
    ) {
      return;
    }

    const newestOrder =
      newOrders[newOrders.length - 1];

    setHighlightedOrderIds((current) => {
      const next = new Set(current);

      newOrders.forEach((order) => {
        next.add(order.id);
      });

      return next;
    });

    setLatestOrder(newestOrder);
    setNewOrderCount((current) =>
      current + newOrders.length,
    );

    storeMode.alertForOrder(newestOrder);
    startTitleAlert();
  }, [
    orders,
    startTitleAlert,
    storeMode.alertForOrder,
    storeMode.enabled,
  ]);

  useEffect(() => {
    if (!storeMode.enabled) {
      stopTitleAlert();
      setLatestOrder(null);
      setNewOrderCount(0);
      setHighlightedOrderIds(new Set());
    }
  }, [stopTitleAlert, storeMode.enabled]);

  useEffect(
    () => () => {
      stopTitleAlert();
    },
    [stopTitleAlert],
  );

  return {
    highlightedOrderIds,
    latestOrder,
    newOrderCount,
    acknowledge,
  };
}
