import { z } from "zod/v3";

// OAuth device-flow token poll: the renderer submits the device_code obtained
// from POST /device/code.
export const deviceTokenSchema = z.object({
  device_code: z.string().min(1, "device_code required"),
});

export type DeviceTokenInput = z.infer<typeof deviceTokenSchema>;

// Update the signed-in user's display name.
export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Social providers the profile page can link against.
export const socialProviderSchema = z.enum(["github", "google", "apple"]);

export type SocialProviderInput = z.infer<typeof socialProviderSchema>;

// Begin linking a social account to the signed-in user.
export const linkSocialSchema = z.object({
  provider: socialProviderSchema,
});

export type LinkSocialInput = z.infer<typeof linkSocialSchema>;
