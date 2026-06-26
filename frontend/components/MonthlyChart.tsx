"use client";

import type { MonthlyPnL } from "@/lib/types";

function formatMYR(n: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleDateString("en-MY", { month: "short", year: "2-digit" });
}

export default function MonthlyChart({ data }: { data: MonthlyPnL[] }) {
  if (data.length === 0) {
    return (
      <div className="neo-card p-4">
        <p className="text-base font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
          No P&amp;L data yet
        </p>
        <p className="mt-2 text-xs text-[#64748b]">
          Add some sell trades to see your monthly realized P&amp;L chart.
        </p>
      </div>
    );
  }

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  const chartHeight = 180;
  const barWidth = Math.max(28, Math.min(48, Math.floor(280 / data.length)));
  const gap = 6;
  const totalWidth = data.length * (barWidth + gap) + 40;

  return (
    <div className="neo-card p-4 overflow-x-auto">
      <h3
        className="text-sm font-bold text-[#141414] mb-3"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Realized P&amp;L by Month
      </h3>
      <svg
        width={totalWidth}
        height={chartHeight + 60}
        viewBox={`0 0 ${totalWidth} ${chartHeight + 60}`}
        className="min-w-full"
      >
        {/* Zero line */}
        <line
          x1={20}
          y1={chartHeight / 2 + 10}
          x2={totalWidth - 20}
          y2={chartHeight / 2 + 10}
          stroke="#141414"
          strokeWidth={2}
        />

        {/* Bars */}
        {data.map((d, i) => {
          const x = 25 + i * (barWidth + gap);
          const barH = (Math.abs(d.pnl) / maxAbs) * (chartHeight / 2 - 10);
          const y = d.pnl >= 0 ? chartHeight / 2 + 10 - barH : chartHeight / 2 + 10;
          const fill = d.pnl >= 0 ? "#06D6A0" : "#EF4444";

          return (
            <g key={d.month}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 2)}
                fill={fill}
                stroke="#141414"
                strokeWidth={2}
              />
              {/* Value label */}
              <text
                x={x + barWidth / 2}
                y={d.pnl >= 0 ? y - 6 : y + Math.max(barH, 2) + 14}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill="#141414"
                fontFamily="var(--font-heading)"
              >
                {formatMYR(d.pnl)}
              </text>
              {/* Month label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 32}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="#141414"
                fontFamily="var(--font-heading)"
              >
                {monthLabel(d.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
