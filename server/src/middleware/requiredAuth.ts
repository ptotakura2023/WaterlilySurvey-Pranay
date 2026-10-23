import type { NextFunction, Request, RequestHandler, Response } from "express";
import { hashSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from "../session";
import { prisma } from "../db";

export type AuthenticatedUser = {
  id: string;
  email: string;
  createdAt: Date;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const requiredAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    if (token !== undefined) {
      res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
    }
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const session = await prisma.session.findFirst({
    where: {
      token: hashSessionToken(token),
      expiresAt: { gt: new Date() },
    },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) {
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.user = session.user;
  next();
};
