import type { StoredSession, Trade, PnLSummary, CreateTradeForm, MonthlyPnL } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://track-profit-loss.traone.workers.dev";
const SESSION_STORAGE_KEY = "traone-profit.session";

// ── Session management ──

export function getSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function setSession(session: StoredSession | null) {
  if (typeof window === "undefined") return;
  if (session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

// ── API request helper ──

async function getErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return payload?.error ?? text.trim() ?? `Request failed with status ${response.status}.`;
  } catch {
    return text.trim() || `Request failed with status ${response.status}.`;
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let activeSession = getSession();

  const makeRequest = async (accessToken?: string) => {
    const headers = new Headers(init.headers ?? {});
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  };

  if (!activeSession?.accessToken) {
    throw new Error("Please sign in with Google first.");
  }

  let response = await makeRequest(activeSession.accessToken);
  if (response.status === 401 && activeSession.refreshToken) {
    // Try refreshing
    const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: activeSession.refreshToken }),
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const newSession: StoredSession = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type,
        expiresIn: data.expires_in,
        user: data.user,
      };
      setSession(newSession);
      activeSession = newSession;
      response = await makeRequest(activeSession.accessToken);
    }
  }
  if (!response.ok) {
    const message = await getErrorMessage(response);
    if (response.status === 401) setSession(null);
    throw new Error(message);
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ── API methods ──

export async function fetchTrades(): Promise<Trade[]> {
  return apiRequest<Trade[]>("/trades");
}

export async function createTrade(form: CreateTradeForm): Promise<Trade> {
  return apiRequest<Trade>("/trades", {
    method: "POST",
    body: JSON.stringify({
      symbol: form.symbol.trim().toUpperCase(),
      side: form.side,
      quantity: Number(form.quantity),
      price: Number(form.price),
      commission: Number(form.commission) || 0,
      trade_date: form.trade_date,
      notes: form.notes || "",
    }),
  });
}

export async function updateTrade(id: string, updates: Partial<CreateTradeForm>): Promise<Trade> {
  const body: Record<string, unknown> = {};
  if (updates.symbol !== undefined) body.symbol = updates.symbol.trim().toUpperCase();
  if (updates.side !== undefined) body.side = updates.side;
  if (updates.quantity !== undefined) body.quantity = Number(updates.quantity);
  if (updates.price !== undefined) body.price = Number(updates.price);
  if (updates.commission !== undefined) body.commission = Number(updates.commission) || 0;
  if (updates.trade_date !== undefined) body.trade_date = updates.trade_date;
  if (updates.notes !== undefined) body.notes = updates.notes;

  return apiRequest<Trade>(`/trades/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteTrade(id: string): Promise<void> {
  return apiRequest<void>(`/trades/${id}`, { method: "DELETE" });
}

export async function fetchSummary(): Promise<PnLSummary> {
  return apiRequest<PnLSummary>("/summary");
}

export async function fetchMonthlyPnL(): Promise<MonthlyPnL[]> {
  return apiRequest<MonthlyPnL[]>("/summary/monthly");
}
