const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3333";

/* MESA4_ANDROID_PUSH_BRIDGE_V17_1 */
type MesaIvAndroidBridge = {
  syncAdminSession?: (
    token: string,
    apiUrl: string,
  ) => void;
  clearAdminSession?: () => void;
};

function getAndroidBridge() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (
    window as Window & {
      MesaIVAndroid?: MesaIvAndroidBridge;
      __MESA4_API_URL__?: string;
    }
  ).MesaIVAndroid;
}

if (typeof window !== "undefined") {
  (
    window as Window & {
      __MESA4_API_URL__?: string;
    }
  ).__MESA4_API_URL__ = API_URL;
}

export function syncAndroidAdminSession(
  token: string,
) {
  getAndroidBridge()?.syncAdminSession?.(
    token,
    API_URL,
  );
}

export function clearAndroidAdminSession() {
  getAndroidBridge()?.clearAdminSession?.();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (
    init.body !== undefined &&
    init.body !== null &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...init,
      headers,
    },
  );

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      data?.message ?? "Erro de comunicação",
      response.status,
      data,
    );
  }

  return data as T;
}

export function adminApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = sessionStorage.getItem(
    "mesa4.admin.token",
  );
  const headers = new Headers(init.headers);

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`,
    );
  }

  return api<T>(path, {
    ...init,
    headers,
  });
}
