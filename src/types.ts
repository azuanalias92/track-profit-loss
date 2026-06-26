export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  user_id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  commission: number;
  trade_date: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTradeRequest {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  commission?: number;
  trade_date: string;
  notes?: string;
}

export interface GoogleUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

// P&L computed types
export interface PnLSummary {
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  openPositions: OpenPosition[];
  closedTrades: ClosedTrade[];
}

export interface OpenPosition {
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice?: number;
  unrealizedPnL: number;
  marketValue: number;
}

export interface ClosedTrade {
  symbol: string;
  buyDate: string;
  sellDate: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  pnl: number;
  pnlPercent: number;
}

export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_ORIGINS: string;
}
