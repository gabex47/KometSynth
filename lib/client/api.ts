export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { ...(!isFormData ? { "Content-Type": "application/json" } : {}), ...init.headers }
      : init?.headers,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json() as { error?: string }
    : {};
  if (!response.ok) {
    throw new ApiRequestError(data.error || "The request could not be completed.", response.status);
  }
  return data as T;
}
