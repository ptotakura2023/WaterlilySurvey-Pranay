import { randomBytes } from "node:crypto";
import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db";
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "./session";

export const authRouter = Router();

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(8)
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
      message: "Password must be at most 72 bytes",
    }),
});

function setSessionCookie(
  res: Response,
  token: string,
): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions,
    maxAge: SESSION_DURATION_MS,
  });
}

function clearSessionCookie(
  res: Response,
): void {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

authRouter.post("/register", async (req, res) => {
  const credentials = credentialsSchema.safeParse(req.body);
  if (!credentials.success) {
    return res.status(400).json({
      error: "Invalid registration details",
      details: credentials.error.flatten().fieldErrors,
    });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  try {
    const user = await prisma.user.create({
      data: {
        email: credentials.data.email,
        passwordHash: await bcrypt.hash(
          credentials.data.password,
          BCRYPT_ROUNDS,
        ),
        sessions: {
          create: {
            token: hashSessionToken(token),
            expiresAt,
          },
        },
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    setSessionCookie(res, token);
    return res.status(201).json({ user });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });
    }
    throw error;
  }
});

authRouter.post("/login", async (req, res) => {
  const credentials = credentialsSchema.safeParse(req.body);
  if (!credentials.success) {
    return res.status(400).json({
      error: "Invalid login details",
      details: credentials.error.flatten().fieldErrors,
    });
  }

  const user = await prisma.user.findUnique({
    where: { email: credentials.data.email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      createdAt: true,
    },
  });

  if (
    !user ||
    !(await bcrypt.compare(credentials.data.password, user.passwordHash))
  ) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.session.create({
    data: {
      token: hashSessionToken(token),
      userId: user.id,
      expiresAt,
    },
  });

  setSessionCookie(res, token);
  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    },
  });
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (token) {
    await prisma.session.deleteMany({
      where: { token: hashSessionToken(token) },
    });
  }

  clearSessionCookie(res);
  return res.status(204).end();
});

authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
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
    clearSessionCookie(res);
    return res.status(401).json({ error: "Not authenticated" });
  }

  return res.status(200).json({ user: session.user });
});
