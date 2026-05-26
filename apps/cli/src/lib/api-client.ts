import { ApiError, ConnectionError } from "./errors.js";

export interface ApiClientOptions {
  baseUrl: string;
  port: number;
}

async function request<T>(
  opts: ApiClientOptions,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ConnectionError(opts.port);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text);
  }

  return res.json() as Promise<T>;
}

async function requestText(
  opts: ApiClientOptions,
  method: string,
  path: string,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}${path}`, { method });
  } catch {
    throw new ConnectionError(opts.port);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text);
  }

  return res.text();
}

export function apiGet<T>(opts: ApiClientOptions, path: string): Promise<T> {
  return request(opts, "GET", path);
}

export function apiGetText(
  opts: ApiClientOptions,
  path: string,
): Promise<string> {
  return requestText(opts, "GET", path);
}

export function apiPost<T>(
  opts: ApiClientOptions,
  path: string,
  body: unknown,
): Promise<T> {
  return request(opts, "POST", path, body);
}

export function apiPut<T>(
  opts: ApiClientOptions,
  path: string,
  body: unknown,
): Promise<T> {
  return request(opts, "PUT", path, body);
}

export function apiDelete<T>(opts: ApiClientOptions, path: string): Promise<T> {
  return request(opts, "DELETE", path);
}
