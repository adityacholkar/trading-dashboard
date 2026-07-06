import type { ReactElement } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DailyPnlPoint } from '../api';
import { inr, inrCompact } from '../format';

interface DailyPnlChartProps {
  data: DailyPnlPoint[];
}

export function DailyPnlChart({ data }: DailyPnlChartProps): ReactElement {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <XAxis dataKey="date" minTickGap={60} tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v: number) => inrCompact(v)} tick={{ fontSize: 12 }} width={80} />
        <Tooltip formatter={(value) => [inr(Number(value)), 'Net P&L']} />
        <Bar dataKey="netPnl" isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.date} fill={d.netPnl >= 0 ? '#16a34a' : '#dc2626'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
