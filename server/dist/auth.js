"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const node_crypto_1 = require("node:crypto");
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const db_1 = require("./db");
exports.authRouter = (0, express_1.Router)();
const SESSION_COOKIE_NAME = "waterlily_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const credentialsSchema = zod_1.z.object({
    email: zod_1.z.string().trim().toLowerCase().email().max(254),
    password: zod_1.z
        .string()
        .min(8)
        .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
        message: "Password must be at most 72 bytes",
    }),
});
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
};
function hashSessionToken(token) {
    return (0, node_crypto_1.createHash)("sha256").update(token).digest("hex");
}
function setSessionCookie(res, token) {
    res.cookie(SESSION_COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: SESSION_DURATION_MS,
    });
}
function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
}
function isUniqueConstraintError(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002");
}
exports.authRouter.post("/register", async (req, res) => {
    const credentials = credentialsSchema.safeParse(req.body);
    if (!credentials.success) {
        return res.status(400).json({
            error: "Invalid registration details",
            details: credentials.error.flatten().fieldErrors,
        });
    }
    const token = (0, node_crypto_1.randomBytes)(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    try {
        const user = await db_1.prisma.user.create({
            data: {
                email: credentials.data.email,
                passwordHash: await bcryptjs_1.default.hash(credentials.data.password, BCRYPT_ROUNDS),
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
    }
    catch (error) {
        if (isUniqueConstraintError(error)) {
            return res
                .status(409)
                .json({ error: "An account with this email already exists" });
        }
        throw error;
    }
});
exports.authRouter.post("/login", async (req, res) => {
    const credentials = credentialsSchema.safeParse(req.body);
    if (!credentials.success) {
        return res.status(400).json({
            error: "Invalid login details",
            details: credentials.error.flatten().fieldErrors,
        });
    }
    const user = await db_1.prisma.user.findUnique({
        where: { email: credentials.data.email },
        select: {
            id: true,
            email: true,
            passwordHash: true,
            createdAt: true,
        },
    });
    if (!user ||
        !(await bcryptjs_1.default.compare(credentials.data.password, user.passwordHash))) {
        return res.status(401).json({ error: "Invalid email or password" });
    }
    const token = (0, node_crypto_1.randomBytes)(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await db_1.prisma.session.create({
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
exports.authRouter.post("/logout", async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (token) {
        await db_1.prisma.session.deleteMany({
            where: { token: hashSessionToken(token) },
        });
    }
    clearSessionCookie(res);
    return res.status(204).end();
});
exports.authRouter.get("/me", async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
        return res.status(401).json({ error: "Not authenticated" });
    }
    const session = await db_1.prisma.session.findFirst({
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
