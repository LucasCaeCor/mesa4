const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3333";

const ADMIN_STEP_UP_TOKEN_KEY =
  "mesa4.admin.stepup.token";
const ADMIN_STEP_UP_EXPIRES_KEY =
  "mesa4.admin.stepup.expiresAt";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
  }
}

export function setAdminStepUpAuthorization(
  token: string,
  expiresAt: string,
) {
  sessionStorage.setItem(
    ADMIN_STEP_UP_TOKEN_KEY,
    token,
  );
  sessionStorage.setItem(
    ADMIN_STEP_UP_EXPIRES_KEY,
    expiresAt,
  );
}

export function clearAdminStepUpAuthorization() {
  sessionStorage.removeItem(
    ADMIN_STEP_UP_TOKEN_KEY,
  );
  sessionStorage.removeItem(
    ADMIN_STEP_UP_EXPIRES_KEY,
  );
}

function getAdminStepUpAuthorization() {
  const token = sessionStorage.getItem(
    ADMIN_STEP_UP_TOKEN_KEY,
  );
  const expiresAt = sessionStorage.getItem(
    ADMIN_STEP_UP_EXPIRES_KEY,
  );

  if (!token) {
    return null;
  }

  if (
    expiresAt &&
    new Date(expiresAt).getTime() <= Date.now()
  ) {
    clearAdminStepUpAuthorization();
    return null;
  }

  return token;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  // Só envia Content-Type quando realmente existe um body.
  // FormData configura seu próprio Content-Type automaticamente.
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

  const method =
    (init.method ?? "GET").toUpperCase();

  if (
    method !== "GET" &&
    method !== "HEAD"
  ) {
    const stepUpToken =
      getAdminStepUpAuthorization();

    if (stepUpToken) {
      headers.set(
        "X-Admin-Authorization",
        stepUpToken,
      );
    }
  }

  return api<T>(path, {
    ...init,
    headers,
  });
}
