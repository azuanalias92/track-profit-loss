import { Hono } from "hono";
import type { Env, Trade, CreateTradeRequest, PnLSummary, OpenPosition, ClosedTrade } from "../types";
import { requireAuth } from "../auth";

const trades = new Hono<{ Bindings: Env }>();

// Apply auth middleware to all routes
trades.use("*", requireAuth as any);

// GET /trades — fetch all trades for current user
trades.get("/", async (c) => {
  const userId = c.get("userId") as string;

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM trades WHERE user_id = ?1 ORDER BY trade_date DESC, created_at DESC"
  )
    .bind(userId)
    .all<Trade>();

  return c.json(results || []);
});

// POST /trades — create a new trade
trades.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json<CreateTradeRequest>();

  // Validation
  if (!body.symbol?.trim()) {
    return c.json({ error: "Symbol is required" }, 400);
  }
  if (!["buy", "sell"].includes(body.side)) {
    return c.json({ error: "Side must be 'buy' or 'sell'" }, 400);
  }
  if (!Number.isFinite(body.quantity) || body.quantity <= 0) {
    return c.json({ error: "Quantity must be a positive number" }, 400);
  }
  if (!Number.isFinite(body.price) || body.price <= 0) {
    return c.json({ error: "Price must be a positive number" }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const commission = Number.isFinite(body.commission) ? body.commission : 0;

  const trade: Trade = {
    id,
    user_id: userId,
    symbol: body.symbol.trim().toUpperCase(),
    side: body.side,
    quantity: body.quantity,
    price: body.price,
    commission,
    trade_date: body.trade_date || now.split("T")[0],
    notes: body.notes || "",
    created_at: now,
    updated_at: now,
  };

  await c.env.DB.prepare(
    `INSERT INTO trades (id, user_id, symbol, side, quantity, price, commission, trade_date, notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
  )
    .bind(
      trade.id, trade.user_id, trade.symbol, trade.side,
      trade.quantity, trade.price, trade.commission,
      trade.trade_date, trade.notes, trade.created_at, trade.updated_at
    )
    .run();

  return c.json(trade, 201);
});

// PUT /trades/:id — update a trade
trades.put("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const tradeId = c.req.param("id");
  const body = await c.req.json<Partial<CreateTradeRequest>>();

  const existing = await c.env.DB.prepare(
    "SELECT * FROM trades WHERE id = ?1 AND user_id = ?2"
  )
    .bind(tradeId, userId)
    .first<Trade>();

  if (!existing) {
    return c.json({ error: "Trade not found" }, 404);
  }

  const now = new Date().toISOString();
  const updates: string[] = [];
  const bindings: any[] = [];

  if (body.symbol !== undefined) {
    if (!body.symbol.trim()) return c.json({ error: "Symbol cannot be empty" }, 400);
    updates.push("symbol = ?");
    bindings.push(body.symbol.trim().toUpperCase());
  }
  if (body.side !== undefined) {
    if (!["buy", "sell"].includes(body.side)) return c.json({ error: "Side must be 'buy' or 'sell'" }, 400);
    updates.push("side = ?");
    bindings.push(body.side);
  }
  if (body.quantity !== undefined) {
    if (!Number.isFinite(body.quantity) || body.quantity <= 0)
      return c.json({ error: "Quantity must be positive" }, 400);
    updates.push("quantity = ?");
    bindings.push(body.quantity);
  }
  if (body.price !== undefined) {
    if (!Number.isFinite(body.price) || body.price <= 0)
      return c.json({ error: "Price must be positive" }, 400);
    updates.push("price = ?");
    bindings.push(body.price);
  }
  if (body.commission !== undefined) {
    updates.push("commission = ?");
    bindings.push(Number.isFinite(body.commission) ? body.commission : 0);
  }
  if (body.trade_date !== undefined) {
    updates.push("trade_date = ?");
    bindings.push(body.trade_date);
  }
  if (body.notes !== undefined) {
    updates.push("notes = ?");
    bindings.push(body.notes);
  }

  if (updates.length === 0) {
    return c.json(existing);
  }

  updates.push("updated_at = ?");
  bindings.push(now);

  await c.env.DB.prepare(
    `UPDATE trades SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`
  )
    .bind(...bindings, tradeId, userId)
    .run();

  // Return updated trade
  const updated = await c.env.DB.prepare(
    "SELECT * FROM trades WHERE id = ?1 AND user_id = ?2"
  )
    .bind(tradeId, userId)
    .first<Trade>();

  return c.json(updated);
});

// DELETE /trades/:id — delete a trade
trades.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const tradeId = c.req.param("id");

  const result = await c.env.DB.prepare(
    "DELETE FROM trades WHERE id = ?1 AND user_id = ?2"
  )
    .bind(tradeId, userId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Trade not found" }, 404);
  }

  return c.json({ success: true });
});

export default trades;
