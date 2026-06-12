import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Building2 } from "lucide-react";

const fmt = (val) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

const TowerWiseSaleVsCollection = ({ data }) => {
  if (!data || data.length === 0) return null;

  const totalAgreement = data.reduce((s, t) => s + t.agreementValue, 0);
  const totalCollection = data.reduce((s, t) => s + t.collection, 0);
  const totalOS = totalAgreement - totalCollection;
  const collectionPct = totalAgreement > 0 ? (totalCollection / totalAgreement) * 100 : 0;
  const osPct = totalAgreement > 0 ? (totalOS / totalAgreement) * 100 : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
        <Building2 className="text-cyan-600" size={20} />
        <h3 className="font-black text-gray-800 text-base uppercase tracking-tight">
          Tower-wise Sale Value vs Collection
        </h3>
      </div>

      <div className="p-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: "Total Sale Value", value: `₹${fmt(totalAgreement / 10000000)}Cr`, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
            { label: "Total Collection", value: `₹${fmt(totalCollection / 10000000)}Cr`, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
            { label: "Total O/S vs Sale", value: `₹${fmt(totalOS / 10000000)}Cr`, color: "text-orange-500", bg: "bg-orange-50", border: "border-orange-200" },
            { label: "Collection %", value: `${collectionPct.toFixed(1)}%`, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
            { label: "O/S % vs Sale", value: `${osPct.toFixed(1)}%`, color: "text-red-500", bg: "bg-red-50", border: "border-red-200" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4 text-center`}>
              <p className="text-gray-500 text-xs mb-1">{s.label}</p>
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Bar Chart */}
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="tower" stroke="#6b7280" />
            <YAxis stroke="#6b7280" tickFormatter={v => `₹${(v / 10000000).toFixed(0)}Cr`} />
            <Tooltip
              contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }}
              formatter={v => `₹${fmt(v / 10000000)}Cr`}
            />
            <Legend />
            <Bar dataKey="agreementValue" fill="#3b82f6" name="Sale Value" label={{ position: "top", fill: "#3b82f6", fontSize: 10, formatter: v => `₹${(v / 10000000).toFixed(1)}Cr` }} />
            <Bar dataKey="collection" fill="#10b981" name="Collection" label={{ position: "top", fill: "#10b981", fontSize: 10, formatter: v => `₹${(v / 10000000).toFixed(1)}Cr` }} />
            <Bar dataKey="osVsSale" fill="#f59e0b" name="O/S vs Sale" label={{ position: "top", fill: "#f59e0b", fontSize: 10, formatter: v => `₹${(v / 10000000).toFixed(1)}Cr` }} />
          </BarChart>
        </ResponsiveContainer>

        {/* Table */}
        <div className="overflow-x-auto mt-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-gray-500">Tower</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase text-gray-500">Sale Value</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase text-gray-500">Collection</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase text-gray-500">O/S vs Sale</th>
                <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-gray-500">Collection %</th>
                <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-gray-500">O/S % vs Sale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((t, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-black text-gray-800">{t.tower}</td>
                  <td className="px-4 py-3 text-right text-blue-600 font-medium">₹{fmt(t.agreementValue / 10000000)}Cr</td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">₹{fmt(t.collection / 10000000)}Cr</td>
                  <td className="px-4 py-3 text-right text-orange-500 font-medium">₹{fmt(t.osVsSale / 10000000)}Cr</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-black ${t.collectionPct >= 80 ? "bg-green-100 text-green-700" : t.collectionPct >= 60 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"}`}>
                      {t.collectionPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-black ${t.osSalePct >= 40 ? "bg-red-100 text-red-600" : t.osSalePct >= 20 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                      {t.osSalePct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TowerWiseSaleVsCollection;