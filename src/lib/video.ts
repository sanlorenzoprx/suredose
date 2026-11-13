// Stable opaque room identity for the configured in-app video provider.
export async function videoRoomName(familyCode: string): Promise<string> {
  const code = familyCode.trim().toUpperCase();
  if (!code) throw new Error("A family code is needed for a video call");
  const bytes = new TextEncoder().encode(`suredose-video:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `SureDose-${hex.slice(0, 24)}`;
}
