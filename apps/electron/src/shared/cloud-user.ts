/** The signed-in Freestyle Cloud user, as surfaced to the renderer. */
export interface CloudUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}
