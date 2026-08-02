const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(message: string, public status: number, public data?: unknown) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.message ?? "Erro de comunicação", response.status, data);
  return data as T;
}

export function adminApi<T>(path: string, init?: RequestInit) {
  const token = sessionStorage.getItem("mesa4.admin.token");
  return api<T>(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token ?? ""}` } });
}
