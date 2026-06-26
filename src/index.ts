import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import authRoutes from "./auth";
import tradeRoutes from "./routes/trades";
import summaryRoutes from "./routes/summary";

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use("*", async (c, next) => {
  const allowedOrigins = (c.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map(s => s.trim());
  const origin = c.req.header("Origin");

  const corsMiddleware = cors({
    origin: (o) => {
      if (!o) return o;
      if (allowedOrigins.includes(o)) return o;
      // Allow vercel preview deploys
      if (o.endsWith(".vercel.app")) return o;
      // Allow pages.dev previews
      if (o.endsWith(".pages.dev")) return o;
      // Allow localhost
      if (o.startsWith("http://localhost:")) return o;
      return allowedOrigins[0];
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  });

  return corsMiddleware(c, next);
});

// Health check
app.get("/", (c) => c.json({ name: "track-profit-loss API", status: "ok" }));

// Routes
app.route("/auth", authRoutes);
app.route("/trades", tradeRoutes);
app.route("/summary", summaryRoutes);

export default app;
