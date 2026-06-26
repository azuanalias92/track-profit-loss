import { Hono } from "hono";
import type { Env, GoogleUser, User } from "../types";
import * as jose from "jose";

const auth = new Hono<{ Bindings: Env }>();

// Generate JWT for authenticated users
async function generateTokens(
  user: User,
  secret: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const encoder = new TextEncoder();
  const key = new jose.SignJWT({ sub: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h");

  const refreshKey = new jose.SignJWT({ sub: user.id, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d");

  const [accessToken, refreshToken] = await Promise.all([
    key.sign(encoder.encode(secret)),
    refreshKey.sign(encoder.encode(secret)),
  ]);

  return { accessToken, refreshToken };
}

// Verify JWT and return payload
export async function verifyToken(
  token: string,
  secret: string
): Promise<{ sub: string; email: string; name: string } | null> {
  try {
    const encoder = new TextEncoder();
    const { payload } = await jose.jwtVerify(token, encoder.encode(secret), {
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      email: (payload.email as string) || "",
      name: (payload.name as string) || "",
    };
  } catch {
    return null;
  }
}

// GET /auth/google — initiate Google OAuth
auth.get("/google", async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: "Google OAuth not configured" }, 500);
  }

  const redirectTo = c.req.query("redirect_to") || c.req.header("Referer") || "";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${new URL(c.req.url).origin}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state: redirectTo,
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /auth/google/callback — handle Google OAuth callback
auth.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state") || "";
  const error = c.req.query("error");

  if (error || !code) {
    const redirectUrl = new URL(state || "/");
    redirectUrl.searchParams.set("error_description", error || "No authorization code received");
    return c.redirect(redirectUrl.toString());
  }

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const origin = new URL(c.req.url).origin;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const redirectUrl = new URL(state || "/");
    redirectUrl.searchParams.set("error_description", "Failed to exchange authorization code");
    return c.redirect(redirectUrl.toString());
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    id_token: string;
  };

  // Decode ID token to get user info (no verification needed for Google's endpoint)
  const idTokenParts = tokenData.id_token.split(".");
  if (idTokenParts.length !== 3) {
    const redirectUrl = new URL(state || "/");
    redirectUrl.searchParams.set("error_description", "Invalid ID token");
    return c.redirect(redirectUrl.toString());
  }

  const payload = JSON.parse(atob(idTokenParts[1])) as GoogleUser;

  // Upsert user in D1
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, avatar_url, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT(id) DO UPDATE SET
       email = ?2, name = ?3, avatar_url = ?4, updated_at = ?5`
  )
    .bind(payload.sub, payload.email, payload.name, payload.picture || null, now)
    .run();

  const user: User = {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    avatar_url: payload.picture || null,
    created_at: now,
    updated_at: now,
  };

  // Generate JWT tokens
  const authSecret = clientSecret || "fallback-secret-change-me";
  const { accessToken, refreshToken } = await generateTokens(user, authSecret);

  // Redirect back to frontend with tokens in URL params
  const redirectUrl = new URL(state || "/");
  redirectUrl.searchParams.set("access_token", accessToken);
  redirectUrl.searchParams.set("refresh_token", refreshToken);
  redirectUrl.searchParams.set("token_type", "Bearer");
  redirectUrl.searchParams.set("expires_in", "86400");
  redirectUrl.searchParams.set("user_id", user.id);
  redirectUrl.searchParams.set("user_email", user.email);
  redirectUrl.searchParams.set("user_name", user.name);
  if (user.avatar_url) {
    redirectUrl.searchParams.set("user_avatar_url", user.avatar_url);
  }

  return c.redirect(redirectUrl.toString());
});

// POST /auth/refresh — refresh access token
auth.post("/refresh", async (c) => {
  try {
    const { refresh_token } = await c.req.json<{ refresh_token: string }>();
    const clientSecret = c.env.GOOGLE_CLIENT_SECRET || "fallback-secret-change-me";

    const payload = await verifyToken(refresh_token, clientSecret);
    if (!payload) {
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    // Fetch user from database
    const userRow = await c.env.DB.prepare(
      "SELECT id, email, name, avatar_url, created_at, updated_at FROM users WHERE id = ?1"
    )
      .bind(payload.sub)
      .first<User>();

    if (!userRow) {
      return c.json({ error: "User not found" }, 401);
    }

    const { accessToken, refreshToken } = await generateTokens(userRow, clientSecret);

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: 86400,
      user: userRow,
    });
  } catch {
    return c.json({ error: "Invalid request" }, 400);
  }
});

// POST /auth/logout (no-op for JWT, but clears client state)
auth.post("/logout", async (c) => {
  return c.json({ success: true });
});

// Middleware to require authentication
export async function requireAuth(
  c: any,
  next: any
) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET || "fallback-secret-change-me";
  const payload = await verifyToken(token, clientSecret);

  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("userId", payload.sub);
  await next();
}

export default auth;
