import { z } from "zod/v3";

const MCP_CONNECTION_NAME_MAX = 80;
const MCP_REMOTE_URL_MAX = 2_000;
const MCP_COMMAND_MAX = 500;
const MCP_ARG_MAX = 1_000;
const MCP_ENV_VALUE_MAX = 4_000;
const MCP_TOOL_DESCRIPTION_MAX = 2_000;
const MCP_TOOL_SCHEMA_MAX_BYTES = 24_000;
/** Maximum local MCP tools advertised in one Cloud Remix turn. */
export const MCP_TOOLS_MAX = 40;

export const mcpTransportSchema = z.enum(["stdio", "http"]);
export const mcpAuthTypeSchema = z.enum(["none", "bearer", "headers", "oauth"]);
export const mcpAuthStatusSchema = z.enum([
  "not_required",
  "not_connected",
  "pending",
  "connected",
  "failed",
]);

function isSafeRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const isLoopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && isLoopback)) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

const mcpSecretSchema = z.string().min(1).max(MCP_ENV_VALUE_MAX);
const mcpEnvironmentSchema = z
  .record(z.string().min(1).max(128), mcpSecretSchema)
  .refine(
    (env) => Object.keys(env).length <= 40,
    "At most 40 environment variables are allowed",
  );
const TRANSPORT_CONTROLLED_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const mcpHeadersSchema = z
  .record(z.string().min(1).max(128), mcpSecretSchema)
  .refine(
    (headers) => Object.keys(headers).length <= 20,
    "At most 20 custom headers are allowed",
  )
  .superRefine((headers, ctx) => {
    for (const name of Object.keys(headers)) {
      const normalized = name.toLowerCase();
      if (
        TRANSPORT_CONTROLLED_HEADERS.has(normalized) ||
        normalized.startsWith("proxy-") ||
        normalized.startsWith("sec-")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: "This header is controlled by the HTTP transport",
        });
      }
    }
  });

/** Write-only connection input. Secret fields never appear in list responses. */
export const mcpConnectionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(MCP_CONNECTION_NAME_MAX),
    transport: mcpTransportSchema,
    command: z.string().trim().min(1).max(MCP_COMMAND_MAX).optional(),
    args: z.array(z.string().max(MCP_ARG_MAX)).max(30).optional(),
    cwd: z.string().trim().min(1).max(MCP_REMOTE_URL_MAX).optional(),
    env: mcpEnvironmentSchema.optional(),
    url: z.string().trim().max(MCP_REMOTE_URL_MAX).optional(),
    authType: mcpAuthTypeSchema.optional(),
    bearerToken: mcpSecretSchema.optional(),
    headers: mcpHeadersSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.transport === "stdio") {
      if (!value.command) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command"],
          message: "A local MCP connection needs a command",
        });
      }
      if (value.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "A local MCP connection cannot have a remote URL",
        });
      }
      if (value.authType && value.authType !== "none") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["authType"],
          message: "Local MCP authentication belongs in its environment",
        });
      }
      return;
    }

    if (!value.url || !isSafeRemoteUrl(value.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message:
          "Use an HTTPS MCP endpoint without embedded credentials (loopback HTTP is allowed for development)",
      });
    }
    if (value.command || value.args || value.cwd || value.env) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transport"],
        message: "A remote MCP connection cannot include local process fields",
      });
    }
    const authType = value.authType ?? "none";
    if (authType === "bearer" && !value.bearerToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bearerToken"],
        message: "A bearer token is required",
      });
    }
    if (authType === "headers" && !value.headers) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["headers"],
        message: "At least one custom header is required",
      });
    }
    if (
      (authType === "none" || authType === "oauth") &&
      (value.bearerToken || value.headers)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authType"],
        message: "This authentication mode does not accept a static secret",
      });
    }
    if (authType === "bearer" && value.headers) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["headers"],
        message: "Bearer authentication cannot also include custom headers",
      });
    }
    if (authType === "headers" && value.bearerToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bearerToken"],
        message:
          "Custom-header authentication cannot also include a bearer token",
      });
    }
  });

export type McpConnectionInput = z.infer<typeof mcpConnectionInputSchema>;

/** Public, renderer-safe connection shape. This schema is intentionally strict. */
export const mcpConnectionSummarySchema = z
  .object({
    id: z.string().regex(/^mcp_[1-9][0-9]*$/),
    name: z.string().min(1).max(MCP_CONNECTION_NAME_MAX),
    transport: mcpTransportSchema,
    url: z.string().max(MCP_REMOTE_URL_MAX).nullable(),
    enabled: z.boolean(),
    authType: mcpAuthTypeSchema,
    authStatus: mcpAuthStatusSchema,
    toolCount: z.number().int().min(0).max(100),
    lastError: z.string().max(500).nullable(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type McpConnectionSummary = z.infer<typeof mcpConnectionSummarySchema>;

const jsonSchemaValue = z
  .record(z.string(), z.unknown())
  .refine(
    (value) => JSON.stringify(value).length <= MCP_TOOL_SCHEMA_MAX_BYTES,
    "The MCP tool schema is too large",
  );

/** Tool description exposed to Cloud. It contains no endpoint or secret data. */
export const remixMcpToolSchema = z
  .object({
    name: z.string().regex(/^mcp_[1-9][0-9]*_[a-z][a-z0-9_]{0,47}$/),
    description: z.string().trim().min(1).max(MCP_TOOL_DESCRIPTION_MAX),
    inputSchema: jsonSchemaValue,
  })
  .strict();

export type RemixMcpTool = z.infer<typeof remixMcpToolSchema>;

export const remixMcpToolsSchema = z
  .array(remixMcpToolSchema)
  .max(MCP_TOOLS_MAX)
  .refine(
    (tools) => new Set(tools.map((tool) => tool.name)).size === tools.length,
    "MCP tool names must be unique",
  );

export const mcpCallSchema = z.object({
  toolName: remixMcpToolSchema.shape.name,
  input: z.record(z.string(), z.unknown()),
});

export type McpCall = z.infer<typeof mcpCallSchema>;
