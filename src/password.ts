// تجزئة كلمات المرور والتحقّق منها عبر PBKDF2 (Web Crypto) + جلسات عشوائية

const ITER = 100000;

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(pw: string, salt: Uint8Array, iter: number): Promise<ArrayBuffer> {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, baseKey, 256);
}

/** يُنتج نصاً مخزّناً بالشكل: pbkdf2$<iter>$<saltB64>$<hashB64> */
export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(pw, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(key)}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = (stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iter = parseInt(parts[1], 10);
  const salt = fromB64(parts[2]);
  const key = await derive(pw, salt, iter);
  // مقارنة زمن-ثابت مبسّطة
  const a = b64(key), b = parts[3];
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** رمز جلسة عشوائي آمن (base64url) */
export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
