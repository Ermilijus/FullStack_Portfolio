import crypto from "node:crypto";

type TokenPayload = {
  id: string;
  email: string | null;
  exp: number;
};

type UserPayload = {
  id: string;
  email: string | null;
};

const signData = (data: string, secret: string): string => {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
};

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
};

export const createAuthToken = (user: UserPayload, secret: string): string => {
  const payload: TokenPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signData(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
};

export const verifyAuthToken = (
  token: string,
  secret: string,
): UserPayload | null => {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signData(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as TokenPayload;

    if (!payload.id || typeof payload.exp !== "number") {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return { id: payload.id, email: payload.email ?? null };
  } catch {
    return null;
  }
};
