/** Derive up-to-two-letter initials from a user's name or email. */
export function initialsFor(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const source = user.name?.trim() || user.email?.trim() || "";
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
