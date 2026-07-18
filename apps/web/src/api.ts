const base = "/api";
let token = sessionStorage.getItem("token");

function authenticatedHeaders(initial?: HeadersInit) {
  const headers = new Headers(initial);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = authenticatedHeaders(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("content-type", "application/json");
  const response = await fetch(base + path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(body.error?.message || "Request failed"),
      { code: body.error?.code, status: response.status, body },
    );
  return body;
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await fetch(base + path, {
    headers: authenticatedHeaders(),
  });
  if (!response.ok) throw new Error("Изображение недоступно");
  return response.blob();
}

export async function login(initData: string, community?: string) {
  const result = await api<any>("/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData, community }),
  });
  token = result.accessToken;
  sessionStorage.setItem("token", token!);
  return result;
}

export const request = (path: string, method = "GET", body?: unknown) =>
  api<any>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
