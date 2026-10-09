import { getClient } from "./api";
import { checkedResponse } from "./checked-response";

/** Callers apply UI/native changes only after this resolves successfully. */
export async function saveSetting(key: string, value: string): Promise<void> {
  await checkedResponse(
    getClient().api.settings[":key"].$put({ param: { key }, json: { value } }),
    "Could not save setting",
  );
}
