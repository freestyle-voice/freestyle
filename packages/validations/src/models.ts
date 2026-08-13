import { z } from "zod/v3";

export const configureModelSchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  model_id: z.string().min(1, "Model ID is required"),
  model_name: z.string().min(1, "Model name is required"),
  type: z.enum(["voice", "llm"]),
  is_default: z.boolean().optional(),
});

export type ConfigureModelInput = z.infer<typeof configureModelSchema>;
