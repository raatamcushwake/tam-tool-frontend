import { BarChart3 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";

const fmtArea = (val) =>
  `${new Intl.NumberFormat("en-IN").format(Math.round(val || 0))} sft`;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-lg text-sm">
      <p className="font-black text-gray-800 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold">
          {p.name}: {fmtArea(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function MonthlyNetAreaSold({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
        <BarChart3 size={36} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-400 font-semibold text-sm">No area sold data yet</p>
        <p className="text-gray-300 text-xs mt-1">Appears once MIS months are approved</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
        <BarChart3 className="text-blue-600" size={20} />
        <div>
          <h3 className="font-black text-gray-800 text-base uppercase tracking-tight">
            Monthly Net Area Sold
          </h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
            Planned vs Actual vs Net (Sq. Ft.)
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
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, fontWeight: 700, paddingTop: 12 }}
            />
            <Line
              type="monotone"
              dataKey="planned"
              name="Planned"
              stroke="#7c3aed"
              strokeWidth={2}
              dot={{ r: 4 }}
              strokeDasharray="5 5"
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual (New Bookings)"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="net"
              name="Net (New - Cancelled)"
              stroke="#f59e0b"
              strokeWidth={2.5}
              dot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary row — last month */}
      <div className="px-6 pb-5 grid grid-cols-3 gap-3">
        {[
          { label: "Planned", key: "planned", color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
          { label: "Actual", key: "actual", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
          { label: "Net Area Sold", key: "net", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{s.label}</p>
            <p className={`text-lg font-black ${s.color} mt-0.5`}>
              {fmtArea(data[data.length - 1]?.[s.key] || 0)}
            </p>
            <p className="text-[9px] text-gray-400 mt-0.5">{data[data.length - 1]?.month}</p>
          </div>
        ))}
      </div>
    </div>
  );
}