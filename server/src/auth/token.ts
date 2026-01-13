import jwt from "jsonwebtoken";
import type { TokenPayload } from "@hearth/shared";

export function signToken(secret: string) {
  const payload: TokenPayload = { sub: "admin" };
  return jwt.sign(payload, secret, { expiresIn: "30d" });
}

export function verifyToken(secret: string, token: string) {
  return jwt.verify(token, secret) as TokenPayload;
}
