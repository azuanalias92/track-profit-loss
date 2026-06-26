export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
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

export interface CreateTradeForm {
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  commission: string;
  trade_date: string;
  notes: string;
}

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
