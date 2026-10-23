import { createHash } from "node:crypto";

export const SESSION_COOKIE_NAME = "waterlily_session";

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
