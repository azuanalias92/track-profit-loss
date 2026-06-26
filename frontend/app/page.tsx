"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Trade, CreateTradeForm, StoredSession, PnLSummary, MonthlyPnL } from "@/lib/types";
import {
  getSession,
  setSession,
  fetchTrades,
  createTrade,
  updateTrade,
  deleteTrade,
  fetchSummary,
  fetchMonthlyPnL,
  apiRequest,
} from "@/lib/api";
import { buildGoogleAuthUrl, parseCallbackUrl } from "@/lib/auth";
import MonthlyChart from "@/components/MonthlyChart";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  LogOut,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";

const defaultForm = (): CreateTradeForm => ({
  symbol: "",
  side: "buy",
  quantity: "",
  price: "",
  commission: "",
  trade_date: new Date().toISOString().split("T")[0],
  notes: "",
});

export default function TrackPnlApp() {
  // ── State ──
  const [booting, setBooting] = useState(true);
  const [session, setSessionState] = useState<StoredSession | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<PnLSummary | null>(null);
  const [monthlyPnL, setMonthlyPnL] = useState<MonthlyPnL[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [form, setForm] = useState<CreateTradeForm>(defaultForm());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"trades" | "positions" | "closed">("trades");
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Bootstrap ──
  useEffect(() => {
    const stored = getSession();
    if (stored) setSessionState(stored);
    setBooting(false);
  }, []);

  // ── Check for OAuth callback on mount ──
  useEffect(() => {
    if (booting) return;
    const params = new URLSearchParams(window.location.search);
    const errorMsg = params.get("error_description");
    if (errorMsg) {
      setAuthError(errorMsg);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    const accessToken = params.get("access_token");
    if (accessToken) {
      const parsed = parseCallbackUrl(window.location.href);
      if (parsed.type === "success" && parsed.payload) {
        const nextSession: StoredSession = {
          accessToken: parsed.payload.access_token,
          refreshToken: parsed.payload.refresh_token,
          tokenType: parsed.payload.token_type,
          expiresIn: parsed.payload.expires_in,
          user: parsed.payload.user,
        };
        setSession(nextSession);
        setSessionState(nextSession);
        setAuthError(null);
        setDashboardError(null);
      } else if (parsed.type === "error") {
        setAuthError(parsed.message ?? "Authentication failed.");
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [booting]);

  // ── Fetch data on session change ──
  useEffect(() => {
    if (!session) {
      setTrades([]);
      setSummary(null);
      setMonthlyPnL([]);
      return;
    }
    refreshData();
  }, [session]);

  async function refreshData() {
    setLoading(true);
    setDashboardError(null);
    try {
      const [tradeData, summaryData, monthlyData] = await Promise.all([
        fetchTrades(),
        fetchSummary(),
        fetchMonthlyPnL(),
      ]);
      setTrades(tradeData);
      setSummary(summaryData);
      setMonthlyPnL(monthlyData);
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // ── Auth actions ──
  const openGoogleSignIn = useCallback(() => {
    setAuthError(null);
    setAuthenticating(true);
    window.location.href = buildGoogleAuthUrl();
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {}
    setSession(null);
    setSessionState(null);
    setTrades([]);
    setSummary(null);
    setMonthlyPnL([]);
    setShowModal(false);
    setDropdownOpen(false);
  }, []);

  // ── Trade CRUD ──
  const openAddModal = useCallback(() => {
    setEditingTrade(null);
    setForm(defaultForm());
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((t: Trade) => {
    setEditingTrade(t);
    setForm({
      symbol: t.symbol,
      side: t.side,
      quantity: t.quantity.toString(),
      price: t.price.toString(),
      commission: t.commission.toString(),
      trade_date: t.trade_date,
      notes: t.notes || "",
    });
    setShowModal(true);
    setDropdownOpen(false);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingTrade(null);
    setForm(defaultForm());
  }, []);

  const handleDelete = useCallback(async (trade: Trade) => {
    setDashboardError(null);
    try {
      await deleteTrade(trade.id);
      await refreshData();
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, []);

  const handleSave = useCallback(async () => {
    const symbol = form.symbol.trim();
    const quantity = Number(form.quantity);
    const price = Number(form.price);

    if (!symbol) {
      setDashboardError("Please enter a stock symbol.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setDashboardError("Please enter a valid quantity.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setDashboardError("Please enter a valid price.");
      return;
    }

    setSubmitting(true);
    setDashboardError(null);

    try {
      if (editingTrade) {
        await updateTrade(editingTrade.id, form);
      } else {
        await createTrade(form);
      }
      closeModal();
      await refreshData();
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }, [form, editingTrade, closeModal]);

  // ── Helpers ──
  function formatCurrency(n: number): string {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
      minimumFractionDigits: 2,
    }).format(n);
  }

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // ── Boot screen ──
  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center neo-card">
            <Loader2 className="h-8 w-8 animate-spin text-neo-orange" />
          </div>
          <h2 className="mt-5 text-2xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            Loading Traone Profit
          </h2>
        </div>
      </div>
    );
  }

  // ── Auth screen ──
  if (!session) {
    return (
      <div className="flex min-h-screen flex-col justify-center px-6 pb-12 pt-16">
        <div
          className="mx-auto mb-6 neo-avatar"
          style={{
            width: 100,
            height: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FF6B35",
          }}
        >
          <span className="text-4xl font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
            T
          </span>
        </div>

        <h1 className="mb-1 text-center text-3xl font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
          Traone Profit
        </h1>
        <h2 className="text-center text-xl font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
          Track your trading profit &amp; loss with confidence.
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-[#475569]">
          Sign in with Google to log your trades, track realized P&amp;L,
          and monitor open positions in real time.
        </p>

        {authError && (
          <div className="mt-5 neo-error p-4">
            <p className="text-sm font-bold text-red-700" style={{ fontFamily: "var(--font-heading)" }}>
              Login failed
            </p>
            <p className="mt-1 text-sm text-red-800">{authError}</p>
          </div>
        )}

        <button
          onClick={openGoogleSignIn}
          className="neo-btn neo-btn-secondary mt-7 flex min-h-[54px] w-full items-center justify-center px-4 text-base"
        >
          Continue with Google
        </button>

        {authenticating && (
          <div className="mt-4 flex items-center gap-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-neo-blue" />
            <p className="text-xs text-[#64748b]">
              Finish Google sign-in in your browser. Traone Profit will reopen automatically.
            </p>
          </div>
        )}

        <p className="mx-auto mt-4 max-w-xs text-center text-xs text-[#64748b]">
          Google sign-in opens in your browser and returns to Traone Profit when it finishes.
        </p>
      </div>
    );
  }

  // ── Dashboard ──
  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-32 pt-4">
      {/* Header */}
      <div className="neo-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p
              className="text-xs font-bold uppercase tracking-wider text-neo-orange"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Traone Profit
            </p>
            <h1 className="mt-1 text-xl font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
              Trading Dashboard
            </h1>
          </div>
          <div className="relative">
            <button onClick={() => setDropdownOpen(!dropdownOpen)} className="flex items-center gap-2">
              {session.user.avatar_url ? (
                <img
                  src={session.user.avatar_url}
                  alt=""
                  className="neo-avatar h-11 w-11 object-cover"
                />
              ) : (
                <div className="neo-avatar flex h-11 w-11 items-center justify-center bg-neo-blue">
                  <span className="text-sm font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>
                    {getInitials(session.user.name)}
                  </span>
                </div>
              )}
            </button>
            {dropdownOpen && (
              <div className="neo-card absolute right-0 top-14 z-50 w-48 p-1">
                <div className="px-3 py-2">
                  <p className="text-sm font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
                    {session.user.name}
                  </p>
                  <p className="text-xs text-[#64748b]">{session.user.email}</p>
                </div>
                <hr className="mx-2 border-t-2 border-[#141414]" />
                <button
                  onClick={handleLogout}
                  className="neo-btn neo-btn-red mt-1 flex w-full items-center gap-2 rounded-none px-3 py-2 text-sm"
                  style={{ boxShadow: "none", border: "none" }}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {dashboardError && (
        <div className="neo-error mt-4 p-4">
          <p className="text-sm font-bold text-red-700" style={{ fontFamily: "var(--font-heading)" }}>
            Something needs attention
          </p>
          <p className="mt-1 text-sm text-red-800">{dashboardError}</p>
        </div>
      )}

      {/* P&L Summary */}
      {summary && (
        <div className="mt-5">
          <h2 className="text-lg font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
            P&amp;L Summary
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <SummaryCard
              label="Realized P&amp;L"
              value={formatCurrency(summary.totalRealizedPnL)}
              color={summary.totalRealizedPnL >= 0 ? "#06D6A0" : "#EF4444"}
              icon={
                summary.totalRealizedPnL >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )
              }
            />
            <SummaryCard
              label={summary.openPositions.length === 0 ? "No Positions" : "Open Positions"}
              value={summary.openPositions.length === 0 ? "—" : `${summary.openPositions.length}`}
              color="#3A86FF"
              icon={<BarChart3 className="h-4 w-4" />}
            />
            <SummaryCard
              label="Closed Trades"
              value={`${summary.closedTrades.length}`}
              color="#8338EC"
            />
            <SummaryCard
              label="Total Trades"
              value={`${trades.length}`}
              color="#FFBE0B"
            />
          </div>
        </div>
      )}

      {/* Monthly Chart */}
      {monthlyPnL.length > 0 && (
        <div className="mt-5">
          <MonthlyChart data={monthlyPnL} />
        </div>
      )}

      {/* Tabs */}
      <div className="mt-5">
        <div className="flex gap-2">
          {(["trades", "positions", "closed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`neo-btn px-4 py-2 text-sm ${
                activeTab === tab ? "neo-btn-primary" : "neo-btn-light"
              }`}
              style={{ boxShadow: activeTab === tab ? "4px 4px 0 #141414" : "2px 2px 0 #141414" }}
            >
              {tab === "trades" ? "Trades" : tab === "positions" ? "Positions" : "Closed"}
            </button>
          ))}
          {loading && <Loader2 className="h-5 w-5 animate-spin text-neo-orange mt-2" />}
        </div>

        <div className="mt-3 space-y-3">
          {/* Trades list */}
          {activeTab === "trades" && (
            <>
              {trades.length === 0 ? (
                <div className="neo-card p-4">
                  <p className="text-base font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
                    No trades yet.
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#64748b]">
                    Tap the + button to add your first trade.
                  </p>
                </div>
              ) : (
                <SwipeList listRef={listRef} swipedId={swipedId} setSwipedId={setSwipedId}>
                  {trades.map((trade) => {
                    const isOpen = swipedId === trade.id;
                    return (
                      <SwipeableCard
                        key={trade.id}
                        commitmentId={trade.id}
                        isOpen={isOpen}
                        onOpen={() => setSwipedId(trade.id)}
                        onClose={() => setSwipedId(null)}
                        actions={
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditModal(trade); }}
                              className="neo-btn neo-btn-primary flex items-center gap-1.5 px-4 py-2 text-sm"
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(trade); }}
                              className="neo-btn neo-btn-red flex items-center gap-1.5 px-4 py-2 text-sm"
                              style={{ boxShadow: "4px 4px 0 #141414" }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        }
                      >
                        <button
                          onClick={() => { if (isOpen) setSwipedId(null); }}
                          className="w-full text-left neo-card p-4"
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p
                                  className="text-base font-bold text-[#141414] truncate"
                                  style={{ fontFamily: "var(--font-heading)" }}
                                >
                                  {trade.symbol}
                                </p>
                                <span
                                  className={`neo-badge ${
                                    trade.side === "buy" ? "neo-badge-buy" : "neo-badge-sell"
                                  }`}
                                >
                                  {trade.side.toUpperCase()}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-[#64748b] truncate">
                                {formatDate(trade.trade_date)} · {trade.quantity} @ {formatCurrency(trade.price)}
                                {trade.notes ? ` · ${trade.notes}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <div>
                              <p className="text-xs text-[#64748b]">Qty</p>
                              <p className="text-sm font-bold text-[#141414]">{trade.quantity}</p>
                            </div>
                            <div>
                              <p className="text-xs text-[#64748b]">Price</p>
                              <p className="text-sm font-bold text-[#141414]">{formatCurrency(trade.price)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-[#64748b]">Total</p>
                              <p className="text-sm font-bold text-[#141414]">
                                {formatCurrency(trade.quantity * trade.price + trade.commission)}
                              </p>
                            </div>
                          </div>
                        </button>
                      </SwipeableCard>
                    );
                  })}
                </SwipeList>
              )}
            </>
          )}

          {/* Open Positions */}
          {activeTab === "positions" && summary && (
            <>
              {summary.openPositions.length === 0 ? (
                <div className="neo-card p-4">
                  <p className="text-base font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
                    No open positions.
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#64748b]">
                    All your buys have been matched with sells.
                  </p>
                </div>
              ) : (
                summary.openPositions.map((pos, i) => (
                  <div key={`${pos.symbol}-${i}`} className="neo-card p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-base font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
                        {pos.symbol}
                      </p>
                      <span className="neo-badge neo-badge-buy">OPEN</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-[#64748b]">Quantity</p>
                        <p className="text-sm font-bold text-[#141414]">{pos.quantity}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748b]">Avg Cost</p>
                        <p className="text-sm font-bold text-[#141414]">{formatCurrency(pos.avgCost)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748b]">Market Value</p>
                        <p className="text-sm font-bold text-[#141414]">{formatCurrency(pos.marketValue)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* Closed Trades */}
          {activeTab === "closed" && summary && (
            <>
              {summary.closedTrades.length === 0 ? (
                <div className="neo-card p-4">
                  <p className="text-base font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
                    No closed trades.
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#64748b]">
                    Add a sell trade to close out a position and realize P&amp;L.
                  </p>
                </div>
              ) : (
                summary.closedTrades.map((ct, i) => (
                  <div key={`${ct.symbol}-${i}`} className="neo-card p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-base font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
                        {ct.symbol}
                      </p>
                      <span
                        className={`neo-badge ${
                          ct.pnl >= 0 ? "neo-badge-profit" : "neo-badge-loss"
                        }`}
                      >
                        {ct.pnl >= 0 ? "+" : ""}
                        {formatCurrency(ct.pnl)} ({ct.pnlPercent >= 0 ? "+" : ""}
                        {ct.pnlPercent}%)
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-[#64748b]">Bought</p>
                        <p className="text-sm font-bold text-[#141414]">
                          {ct.quantity} @ {formatCurrency(ct.buyPrice)}
                        </p>
                        <p className="text-xs text-[#64748b]">{formatDate(ct.buyDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748b]">Sold</p>
                        <p className="text-sm font-bold text-[#141414]">
                          {ct.quantity} @ {formatCurrency(ct.sellPrice)}
                        </p>
                        <p className="text-xs text-[#64748b]">{formatDate(ct.sellDate)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {/* FAB */}
      <button onClick={openAddModal} className="neo-fab fixed bottom-6 right-6 z-40 h-16 w-16">
        <Plus className="h-7 w-7 text-[#141414]" />
      </button>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            className="neo-modal w-full max-w-md p-5 animate-neo-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
                  {editingTrade ? "Edit trade" : "New trade"}
                </h3>
                <p className="mt-1 text-sm text-[#64748b]">
                  {editingTrade ? "Update this trade entry." : "Log a new trade to your journal."}
                </p>
              </div>
              <button onClick={closeModal} className="neo-btn neo-btn-light shrink-0 px-2 py-1 text-sm">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  className="mb-2 block text-sm font-bold text-[#141414]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Symbol
                </label>
                <input
                  placeholder="AAPL"
                  className="neo-input w-full px-4 py-3 text-sm text-[#141414]"
                  value={form.symbol}
                  onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="mb-2 block text-sm font-bold text-[#141414]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Side
                  </label>
                  <select
                    className="neo-select w-full px-4 py-3 text-sm text-[#141414]"
                    value={form.side}
                    onChange={(e) => setForm((f) => ({ ...f, side: e.target.value as "buy" | "sell" }))}
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-bold text-[#141414]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Date
                  </label>
                  <input
                    type="date"
                    className="neo-input w-full px-4 py-3 text-sm text-[#141414]"
                    value={form.trade_date}
                    onChange={(e) => setForm((f) => ({ ...f, trade_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="mb-2 block text-sm font-bold text-[#141414]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Quantity
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="100"
                    className="neo-input w-full px-4 py-3 text-sm text-[#141414]"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-bold text-[#141414]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Price (MYR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="1.50"
                    className="neo-input w-full px-4 py-3 text-sm text-[#141414]"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label
                  className="mb-2 block text-sm font-bold text-[#141414]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Commission (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="neo-input w-full px-4 py-3 text-sm text-[#141414]"
                  value={form.commission}
                  onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))}
                />
              </div>

              <div>
                <label
                  className="mb-2 block text-sm font-bold text-[#141414]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Notes (optional)
                </label>
                <input
                  placeholder="Entry reason, strategy, etc."
                  className="neo-input w-full px-4 py-3 text-sm text-[#141414]"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <button
              disabled={submitting}
              onClick={handleSave}
              className="neo-btn neo-btn-primary mt-5 flex min-h-[52px] w-full items-center justify-center px-4 text-base"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : editingTrade ? (
                "Save changes"
              ) : (
                "Save trade"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Swipeable list components ──

const SWIPE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 0.4;

function SwipeList({
  children,
  swipedId,
  setSwipedId,
  listRef,
}: {
  children: React.ReactNode;
  swipedId: string | null;
  setSwipedId: (id: string | null) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setSwipedId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [listRef, setSwipedId]);

  return (
    <div ref={listRef} className="mt-3 space-y-3">
      {children}
    </div>
  );
}

function SwipeableCard({
  children,
  commitmentId,
  isOpen,
  onOpen,
  onClose,
  actions,
}: {
  children: React.ReactNode;
  commitmentId: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  actions: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const dragging = useRef(false);
  const [offset, setOffset] = useState(0);
  const wasOpen = useRef(false);
  const actionsWidth = useRef(160);

  useEffect(() => {
    if (isOpen) {
      const el = cardRef.current;
      if (el) {
        const actionsEl = el.querySelector("[data-actions]") as HTMLElement;
        if (actionsEl) actionsWidth.current = actionsEl.offsetWidth;
      }
      setOffset(-actionsWidth.current);
    } else {
      setOffset(0);
    }
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    dragging.current = true;
    wasOpen.current = isOpen;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;

    if (wasOpen.current) {
      setOffset(Math.min(0, -actionsWidth.current + diff));
    } else {
      setOffset(Math.min(0, Math.max(-actionsWidth.current * 1.3, diff)));
    }
  };

  const handleTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const diff = currentX.current - startX.current;

    if (wasOpen.current) {
      if (diff > SWIPE_THRESHOLD) {
        onClose();
      } else {
        onOpen();
      }
    } else {
      if (diff < -SWIPE_THRESHOLD) {
        onOpen();
      } else {
        onClose();
      }
    }
  };

  return (
    <div className="relative overflow-hidden" ref={cardRef}>
      <div
        data-actions
        className="absolute inset-y-0 right-0 z-0 flex items-center gap-2 px-4"
        style={{
          backgroundColor: "rgba(255, 107, 53, 0.1)",
          border: "3px solid #141414",
        }}
      >
        {actions}
      </div>
      <div
        className="relative z-10 transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="neo-summary-card bg-white p-4">
      <div className="h-1 w-10" style={{ backgroundColor: color }} />
      <div className="mt-3 flex items-center gap-2">
        {icon && <span style={{ color }}>{icon}</span>}
        <p className="text-xs text-[#64748b]">{label}</p>
      </div>
      <p className="mt-1 text-lg font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
        {value}
      </p>
    </div>
  );
}
