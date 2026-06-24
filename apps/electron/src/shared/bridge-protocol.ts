/**
 * The IPC contract between the plugin-bridge preload (page side) and the
 * plugin UI host (main side). Shared so the serialize/deserialize pair can't
 * drift.
 */

/** An IPC-serializable form of a `fetch` request body. */
export type SerializedBody =
  | { kind: "none" }
  | { kind: "text"; value: string }
  | { kind: "binary"; data: ArrayBuffer; type: string }
  | {
      kind: "form";
      fields: Array<
        | { type: "text"; name: string; value: string }
        | {
            type: "file";
            name: string;
            filename: string;
            mime: string;
            data: ArrayBuffer;
          }
      >;
    };

/** A request proxied from a plugin page's bridge `api()` call. */
export interface PluginFetchRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: SerializedBody;
}

/** The serialized response returned to the plugin page. */
export interface PluginFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ArrayBuffer;
}
