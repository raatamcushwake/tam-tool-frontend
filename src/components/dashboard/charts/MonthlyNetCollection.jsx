import { TrendingUp } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";

const fmt = (val) =>
  `₹${(val / 10000000).toFixed(2)}Cr`;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-lg text-sm">
      <p className="font-black text-gray-800 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function MonthlyNetCollection({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
        <TrendingUp size={36} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-400 font-semibold text-sm">No collection data yet</p>
        <p className="text-gray-300 text-xs mt-1">Appears once MIS months are approved</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
        <TrendingUp className="text-emerald-600" size={20} />
        <div>
          <h3 className="font-black text-gray-800 text-base uppercase tracking-tight">
            Monthly Net Collection
          </h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
            Planned vs Actual vs Net (₹ Crores)
          </p>
        </div>
      </div>

      <div className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="month"
              stroke="#9ca3af"
              tick={{ fontSize: 11, fontWeight: 700 }}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `₹${(v / 10000000).toFixed(0)}Cr`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, fontWeight: 700, paddingTop: 12 }}
            />
            <Line
              type="monotone"
              dataKey="planned"
              name="Planned"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 4 }}
              strokeDasharray="5 5"
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual"
              stroke="#0891b2"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="net"
              name="Net (Actual - Cancelled)"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary row — last month */}
      <div className="px-6 pb-5 grid grid-cols-3 gap-3">
        {[
          { label: "Planned", key: "planned", color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" },
          { label: "Actual", key: "actual", color: "text-cyan-600", bg: "bg-cyan-50", border: "border-cyan-200" },
          { label: "Net Collection", key: "net", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{s.label}</p>
            <p className={`text-lg font-black ${s.color} mt-0.5`}>
              {fmt(data[data.length - 1]?.[s.key] || 0)}
            </p>
            <p className="text-[9px] text-gray-400 mt-0.5">{data[data.length - 1]?.month}</p>
          </div>
        ))}
      </div>
    </div>
  );
}