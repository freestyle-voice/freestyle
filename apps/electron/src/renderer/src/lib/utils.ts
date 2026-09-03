import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ON_DEVICE_PHRASE =
  process.platform === "darwin" ? "your Mac" : "your device";
