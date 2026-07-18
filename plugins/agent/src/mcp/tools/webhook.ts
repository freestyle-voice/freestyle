export async function callWebhook(args: {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<{ status: number; statusText: string; body: string }> {
  const method = (args.method ?? "POST").toUpperCase();
  const headers: Record<string, string> = { ...args.headers };

  let bodyStr: string | undefined;
  if (args.body !== undefined && method !== "GET" && method !== "HEAD") {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    bodyStr =
      typeof args.body === "string" ? args.body : JSON.stringify(args.body);
  }

  try {
    const res = await fetch(args.url, {
      method,
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(30_000),
    });

    const contentType = res.headers.get("content-type") ?? "";
    let body: string;
    if (contentType.includes("application/json")) {
      body = JSON.stringify(await res.json(), null, 2);
    } else {
      body = await res.text();
    }

    // Truncate very large responses
    if (body.length > 10_000) {
      body = `${body.slice(0, 10_000)}\n... (truncated)`;
    }

    return { status: res.status, statusText: res.statusText, body };
  } catch (err) {
    return {
      status: 0,
      statusText: "Error",
      body: err instanceof Error ? err.message : String(err),
    };
  }
}
