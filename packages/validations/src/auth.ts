import { z } from "zod/v3";

// OAuth device-flow token poll: the renderer submits the device_code obtained
// from POST /device/code.
export const deviceTokenSchema = z.object({
  device_code: z.string().min(1, "device_code required"),
});

export type DeviceTokenInput = z.infer<typeof deviceTokenSchema>;
