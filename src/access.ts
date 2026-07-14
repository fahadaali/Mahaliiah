// التحقّق من هوية Cloudflare Access عبر JWT (RS256) دون مكتبات خارجية.
// يتحقّق من التوقيع مقابل مفاتيح Access العامة (JWKS) ومن aud/iss/exp.

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

interface JwksCache {
  keys: Jwk[];
  fetchedAt: number;
}

let jwksCache: JwksCache | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // ساعة

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(part: string): any {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

async function getJwks(teamDomain: string): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const url = `${teamDomain.replace(/\/$/, "")}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("تعذّر جلب مفاتيح Access");
  const data = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys: data.keys || [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

async function importRsaKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

export interface AccessIdentity {
  email: string;
  name: string;
}

/** يتحقّق من رمز Access ويُرجع الهوية، أو يرمي خطأً عند الفشل. */
export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  expectedAud: string
): Promise<AccessIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("رمز غير صالح");
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);

  // exp
  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error("انتهت صلاحية الرمز");
  // aud (قد تكون سلسلة أو مصفوفة)
  const auds: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(expectedAud)) throw new Error("جمهور غير مطابق (aud)");
  // iss
  if (payload.iss && !payload.iss.startsWith(teamDomain.replace(/\/$/, ""))) {
    throw new Error("مُصدِر غير مطابق (iss)");
  }

  const keys = await getJwks(teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("لا يوجد مفتاح مطابق");
  const key = await importRsaKey(jwk);

  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const sig = b64urlToBytes(parts[2]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, signed);
  if (!ok) throw new Error("فشل التحقّق من التوقيع");

  const email: string = payload.email || payload.identity || "";
  if (!email) throw new Error("لا يوجد بريد في الرمز");
  return { email: email.toLowerCase(), name: payload.name || email };
}
