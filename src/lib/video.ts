/*
 * Family video check-in. Uses a Jitsi Meet room (no accounts, no keys, works in
 * a phone browser). The room name is a hash of the family code, so the patient's
 * and caregiver's phones land in the same private room without storing anything.
 */

const JITSI_BASE = "https://meet.jit.si";

export async function videoRoomName(familyCode: string): Promise<string> {
  const code = familyCode.trim().toUpperCase();
  if (!code) throw new Error("A family code is needed for a video call");
  const bytes = new TextEncoder().encode(`suredose-video:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `SureDose-${hex.slice(0, 24)}`;
}

export async function videoCallUrl(familyCode: string, displayName: string): Promise<string> {
  const room = await videoRoomName(familyCode);
  const name = displayName.trim().slice(0, 40);
  const config = [
    "config.prejoinConfig.enabled=false",
    "config.startWithVideoMuted=false",
    "config.disableDeepLinking=true",
  ];
  if (name) config.push(`userInfo.displayName=${JSON.stringify(name)}`);
  return `${JITSI_BASE}/${room}#${config.join("&")}`;
}
