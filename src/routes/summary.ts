import { Hono } from "hono";
import type { Env, Trade, PnLSummary, OpenPosition, ClosedTrade } from "../types";
import { requireAuth } from "../auth";

const summary = new Hono<{ Bindings: Env }>();

summary.use("*", requireAuth as any);

// GET /summary — compute P&L summary using FIFO method
summary.get("/", async (c) => {
  const userId = c.get("userId") as string;

  // Fetch all trades ordered by date (oldest first for FIFO)
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM trades WHERE user_id = ?1 ORDER BY trade_date ASC, created_at ASC"
  )
    .bind(userId)
    .all<Trade>();

  const trades = results || [];

  // Group by symbol
  const bySymbol = new Map<string, Trade[]>();
  for (const t of trades) {
    const group = bySymbol.get(t.symbol) || [];
    group.push(t);
    bySymbol.set(t.symbol, group);
  }

  const openPositions: OpenPosition[] = [];
  const closedTrades: ClosedTrade[] = [];
  let totalRealizedPnL = 0;

  for (const [symbol, symbolTrades] of bySymbol) {
    // FIFO: match sells against remaining buy lots
    const buyLots: { quantity: number; price: number; date: string }[] = [];

    for (const trade of symbolTrades) {
      if (trade.side === "buy") {
        buyLots.push({
          quantity: trade.quantity,
          price: trade.price,
          date: trade.trade_date,
        });
      } else {
        // Sell — match against open buy lots (FIFO)
        let remainingSell = trade.quantity;

        while (remainingSell > 0 && buyLots.length > 0) {
          const lot = buyLots[0];
          const matchedQty = Math.min(remainingSell, lot.quantity);

          const pnl = (trade.price - lot.price) * matchedQty - trade.commission * (matchedQty / trade.quantity);
          const pnlPercent = ((trade.price - lot.price) / lot.price) * 100;

          totalRealizedPnL += pnl;

          closedTrades.push({
            symbol: trade.symbol,
            buyDate: lot.date,
            sellDate: trade.trade_date,
            quantity: matchedQty,
            buyPrice: lot.price,
            sellPrice: trade.price,
            pnl: Math.round(pnl * 100) / 100,
            pnlPercent: Math.round(pnlPercent * 100) / 100,
          });

          lot.quantity -= matchedQty;
          remainingSell -= matchedQty;

          if (lot.quantity <= 0) {
            buyLots.shift();
          }

          // Calculate remaining commission for unmatched portion
          if (remainingSell > 0) {
            // Commission applied proportionally
          }
        }
      }
    }

    // Remaining buy lots = open positions
    for (const lot of buyLots) {
      if (lot.quantity > 0) {
        openPositions.push({
          symbol,
          quantity: lot.quantity,
          avgCost: lot.price,
          unrealizedPnL: 0,
          marketValue: lot.quantity * lot.price,
        });
      }
    }
  }

  // Calculate total unrealized P&L (would need market prices — set to 0 for now)
  const totalUnrealizedPnL = openPositions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);

  return c.json({
    totalRealizedPnL: Math.round(totalRealizedPnL * 100) / 100,
    totalUnrealizedPnL: Math.round(totalUnrealizedPnL * 100) / 100,
    openPositions,
    closedTrades: closedTrades.reverse(), // most recent first
  } satisfies PnLSummary);
});

export default summary;
