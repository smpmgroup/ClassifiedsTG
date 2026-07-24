const base = "/api";
let token: string | null = null;

export function activateSession(scope: "tenant" | "platform") {
  token = sessionStorage.getItem(`${scope}Token`);
  if (!token && scope === "tenant") {
    token = sessionStorage.getItem("token");
    if (token) sessionStorage.setItem("tenantToken", token);
  }
  return Boolean(token);
}

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
  sessionStorage.setItem("tenantToken", token!);
  return result;
}

export async function platformLogin(initData: string) {
  const result = await api<any>("/auth/platform/telegram", {
    method: "POST",
    body: JSON.stringify({ initData }),
  });
  if (result.accessToken) setPlatformToken(result.accessToken);
  return result;
}

export function setPlatformToken(value: string) {
  token = value;
  sessionStorage.setItem("platformToken", value);
}

export function clearPlatformSession() {
  token = null;
  sessionStorage.removeItem("platformToken");
}

export async function completePlatformTwoFactor(challengeToken: string, code: string) {
  const result = await api<any>("/auth/platform/two-factor", {
    method: "POST",
    body: JSON.stringify({ challengeToken, code }),
  });
  setPlatformToken(result.accessToken);
  return result;
}

export async function startPlatformWebLogin() {
  return api<any>("/auth/platform/web/start", { method: "POST", body: "{}" });
}

export async function pollPlatformWebLogin(loginToken: string) {
  return api<any>("/auth/platform/web/status", {
    method: "POST",
    body: JSON.stringify({ token: loginToken }),
  });
}

export const request = (path: string, method = "GET", body?: unknown) =>
  api<any>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
