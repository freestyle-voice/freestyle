/** Keep failed HTTP responses out of successful query data and mutation effects. */
export async function checkedResponse<
  T extends { ok: boolean; status: number },
>(response: Promise<T>, message: string): Promise<T> {
  const result = await response;
  if (!result.ok) throw new Error(`${message} (HTTP ${result.status})`);
  return result;
}

export async function checkedJson<T>(
  response: Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>,
  message: string,
): Promise<T> {
  return (await (await checkedResponse(response, message)).json()) as T;
}
