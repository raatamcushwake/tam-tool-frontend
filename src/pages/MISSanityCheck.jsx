import { useState, useRef } from "react";
import Layout from "../components/common/Layout";
import {
  Upload, FileSpreadsheet, X, CheckCircle, AlertTriangle,
  ArrowRight, Search, MoveRight, ArrowDownRight, ArrowUpRight
} from "lucide-react";
import * as XLSX from "xlsx";

const ROLE_COLORS = {
  MAKER: "bg-blue-100 text-blue-700",
  REVIEWER: "bg-yellow-100 text-yellow-700",
  MANAGER: "bg-green-100 text-green-700",
};

function FileUploadBox({ label, subtitle, file, onFileSelect, onClear, accent = "blue" }) {
  const inputRef = useRef(null);
  const colors = {
    blue: { border: "border-blue-400", bg: "bg-blue-50", icon: "bg-blue-100 text-blue-600", btn: "bg-blue-600" },
    indigo: { border: "border-indigo-400", bg: "bg-indigo-50", icon: "bg-indigo-100 text-indigo-600", btn: "bg-indigo-600" },
  };
  const c = colors[accent];

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer
        ${file ? "border-green-400 bg-green-50" : `border-gray-300 bg-white hover:${c.border} hover:${c.bg}`}`}
      onClick={() => !file && inputRef.current.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFileSelect(f); }}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFileSelect(e.target.files[0]); }} />
      {file ? (
        <>
          <CheckCircle size={40} className="text-green-500 mb-3" />
          <p className="text-green-700 font-semibold text-sm">{file.name}</p>
          <p className="text-green-500 text-xs mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          <button onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute top-3 right-3 w-7 h-7 bg-red-100 hover:bg-red-200 rounded-full flex items-center justify-center">
            <X size={14} className="text-red-500" />
          </button>
        </>
      ) : (
        <>
          <div className={`w-14 h-14 ${c.icon} rounded-2xl flex items-center justify-center mb-4`}>
            <FileSpreadsheet size={28} />
          </div>
          <p className="text-gray-700 font-semibold text-sm">{label}</p>
          <p className="text-gray-400 text-xs mt-1">{subtitle}</p>
          <div className={`mt-4 flex items-center gap-2 ${c.btn} text-white text-xs font-medium px-4 py-2 rounded-lg`}>
            <Upload size={13} /> Browse File
          </div>
          <p className="text-gray-300 text-xs mt-2">or drag & drop · .xlsx / .xls only</p>
        </>
      )}
    </div>
  );
}

const SummaryBox = ({ title, incValue, decValue, incCount, decCount, isArea = false, accentClass, showDecreaseOnly = false }) => {
  const fmt = (val) => isArea ? `${val} sft` : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  return (
    <div className={`bg-white p-5 rounded-xl border border-gray-200 border-l-4 ${accentClass} shadow-sm hover:shadow-md transition-shadow`}>
      <p className="text-gray-500 text-[10px] font-bold uppercase mb-3 tracking-widest">{title}</p>
      {showDecreaseOnly ? (
        <div>
          <span className="text-[9px] text-red-500 font-bold uppercase">Decrease Sum</span>
          <h2 className="text-xl font-bold text-gray-900 mt-1">{fmt(decValue)}</h2>
          <span className="text-[10px] text-red-500 font-black">#{decCount} Units</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-end border-b border-gray-100 pb-2">
            <div>
              <span className="text-[9px] text-emerald-600 font-bold uppercase">Increase Sum</span>
              <h2 className="text-base font-bold text-gray-900 mt-0.5">{fmt(incValue)}</h2>
            </div>
            <span className="text-[10px] text-emerald-600 font-black">#{incCount} Units</span>
          </div>
          <div className="flex justify-between items-end pt-1">
            <div>
              <span className="text-[9px] text-red-500 font-bold uppercase">Decrease Sum</span>
              <h2 className="text-base font-bold text-gray-900 mt-0.5">{fmt(decValue)}</h2>
            </div>
            <span className="text-[10px] text-red-500 font-black">#{decCount} Units</span>
          </div>
        </div>
      )}
    </div>
  );
};

const columnSequence = [
  "Unit No.", "Tower", "Booking Date", "Registration Date",
  "Unit Type", "Customer Name", "Saleable area in sft",
  "Carpet area in sft", "Agreement value",
  "Amount Received excl. Tax",
  "Demand Raised as on Current Month excl. tax"
];

export default function MISSanityCheck() {
  const [files, setFiles] = useState({ prev: null, curr: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

  const runSanityCheck = async () => {
    setIsProcessing(true);
    setResults(null);
    const formData = new FormData();
    formData.append("prev_month", files.prev);
    formData.append("curr_month", files.curr);
    try {
      const res = await fetch(`${apiUrl}/api/mis-sanity/run`, { method: "POST", body: formData });
      const data = await res.json();
setResults(data);
localStorage.setItem("sanityPassed", JSON.stringify(data.sanity_check_passed));
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheetsConfig = [
      { name: "All Errors", data: (() => {
        const map = new Map();
        const add = (u) => { if (!map.has(u['Unit No.'])) map.set(u['Unit No.'], u); };
        [...(results.decreases?.amount || []), ...(results.decreases?.demand || []),
         ...(results.decreases?.agreement || []), ...(results.decreases?.saleable || []),
         ...(results.decreases?.carpet || []), ...(results.increases?.agreement || []),
         ...(results.increases?.saleable || []), ...(results.increases?.carpet || []),
         ...(results.duplicate_units || []), ...(results.anomaly_units || [])].forEach(add);
        return Array.from(map.values());
      })() },
      { name: "New Bookings", data: results.new_bookings || [] },
      { name: "Transfers", data: results.transferred_units || [] },
      { name: "Anomaly", data: results.anomaly_units || [] },
      { name: "Name Corrections", data: results.name_corrections || [] },
      { name: "Cancelled", data: results.cancelled_units || [] },
      { name: "Duplicates", data: results.duplicate_units || [] },
      { name: "Agreement Changes", data: [...(results.decreases?.agreement || []), ...(results.increases?.agreement || [])] },
      { name: "Amount Decreased", data: results.decreases?.amount || [] },
      { name: "Demand Decreased", data: results.decreases?.demand || [] },
      { name: "Saleable Changes", data: [...(results.decreases?.saleable || []), ...(results.increases?.saleable || [])] },
      { name: "Carpet Changes", data: [...(results.decreases?.carpet || []), ...(results.increases?.carpet || [])] },
    ];
    sheetsConfig.forEach(({ name, data }) => {
      const rows = data.map(u => ({
        "Unit No.": u["Unit No."] || "-", "Tower": u["Tower"] || "-",
        "Booking Date": u["Booking Date"] || "-", "Registration Date": u["Registration Date"] || "-",
        "Unit Type": u["Unit Type"] || "-", "Customer Name": u["Customer Name"] || "-",
        "Saleable Area (sft)": u["Saleable area in sft"] || 0,
        "Carpet Area (sft)": u["Carpet area in sft"] || 0,
        "Agreement Value": u["Agreement value"] || 0,
        "Amount Received": u["Amount Received excl. Tax"] || 0,
        "Demand Raised": u["Demand Raised as on Current Month excl. tax"] || 0,
        "Prev Customer": u["prev_customer"] || "-", "Curr Customer": u["curr_customer"] || "-",
        "Agreement Delta": u["agreement_delta"] || 0, "Amount Delta": u["amount_received_delta"] || 0,
        "Demand Delta": u["demand_delta"] || 0, "Saleable Delta": u["saleable_delta"] || 0,
        "Carpet Delta": u["carpet_delta"] || 0,
      }));
      const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Info: "No records" }]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, `Failed_Sanity_Check_${files.curr?.name?.replace(/\.[^/.]+$/, "") || "Current"}.xlsx`);
  };

  const displayData = (() => {
    if (!results) return [];
    switch (activeTab) {
      case "new": return results.new_bookings || [];
      case "transfer": return (results.transferred_units || []).filter(u => !u.anomaly_detected);
      case "anomaly": return [...(results.anomaly_units || []), ...(results.transferred_units || []).filter(u => u.anomaly_detected)];
      case "name_correction": return results.name_corrections || [];
      case "cancelled": return results.cancelled_units || [];
      case "duplicate": return results.duplicate_units || [];
      case "agreement_change": return [...(results.decreases?.agreement || []), ...(results.increases?.agreement || [])];
      case "amount_change": return results.decreases?.amount || [];
      case "demand_change": return results.decreases?.demand || [];
      case "saleable_change": return [...(results.decreases?.saleable || []), ...(results.increases?.saleable || [])];
      case "carpet_change": return [...(results.decreases?.carpet || []), ...(results.increases?.carpet || [])];
      default: {
        const map = new Map();
        const add = (u) => { if (!map.has(u['Unit No.'])) map.set(u['Unit No.'], u); };
        [...(results.decreases?.amount || []), ...(results.decreases?.demand || []),
         ...(results.decreases?.agreement || []), ...(results.decreases?.saleable || []),
         ...(results.decreases?.carpet || []), ...(results.increases?.agreement || []),
         ...(results.increases?.saleable || []), ...(results.increases?.carpet || []),
         ...(results.duplicate_units || []), ...(results.anomaly_units || [])].forEach(add);
        return Array.from(map.values());
      }
    }
  })();

  const filteredUnits = displayData.filter(unit =>
    Object.values(unit).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const fmt = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const renderChange = (unit) => {
    if (activeTab === "transfer" && unit.transfer_detected && !unit.anomaly_detected) return (
      <div className="flex flex-col gap-1 py-1">
        <span className="text-[10px] font-black uppercase text-blue-600">TRANSFER</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="line-through text-red-500">{unit.prev_customer}</span>
          <MoveRight size={12} className="text-blue-500" />
          <span className="text-emerald-600 font-bold">{unit.curr_customer}</span>
        </div>
      </div>
    );
    if (activeTab === "name_correction") return (
      <div className="flex flex-col gap-1 py-1">
        <span className="text-[10px] font-black uppercase text-teal-600">NAME CORRECTION</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="line-through text-gray-400">{unit.prev_customer}</span>
          <MoveRight size={12} className="text-teal-500" />
          <span className="text-gray-900 font-bold">{unit.curr_customer}</span>
        </div>
      </div>
    );
    if (activeTab === "cancelled") return (
      <div className="flex flex-col gap-1 py-1">
        <span className="text-[10px] font-black uppercase text-orange-500">CANCELLED</span>
        <span className="text-xs text-red-500 line-through font-bold">{unit.prev_customer}</span>
      </div>
    );
    if (activeTab === "duplicate") return (
      <div className="flex flex-col gap-1 py-1">
        <span className="text-[10px] font-black uppercase text-red-600">⚠ DUPLICATE ENTRY</span>
        <span className="text-xs text-amber-600 font-bold">Unit appears multiple times</span>
      </div>
    );
    if (activeTab === "anomaly" && unit.anomaly_detected) return (
      <div className="flex flex-col gap-1 py-1 border-l-2 border-purple-400 pl-4">
        <span className="text-[10px] font-black uppercase text-purple-600">Anomaly / Resale</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="line-through text-red-400">{unit.prev_customer}</span>
          <MoveRight size={12} className="text-gray-400" />
          <span className="text-purple-600 font-bold">{unit.curr_customer}</span>
        </div>
      </div>
    );
    const changes = [];
    const add = (delta, prev, curr, label, isArea = false) => { if (delta !== 0) changes.push({ delta, prev, curr, label, isArea }); };
    if (["all", "agreement_change"].includes(activeTab)) add(unit.agreement_delta, unit.prev_agreement, unit['Agreement value'], "Agreement Value");
    if (["all", "amount_change"].includes(activeTab)) add(unit.amount_received_delta, unit.prev_amount_received, unit['Amount Received excl. Tax'], "Amount Received");
    if (["all", "demand_change"].includes(activeTab)) add(unit.demand_delta, unit.prev_demand, unit['Demand Raised as on Current Month excl. tax'], "Demand Raised");
    if (["all", "saleable_change"].includes(activeTab)) add(unit.saleable_delta, unit.prev_saleable, unit['Saleable area in sft'], "Saleable Area", true);
    if (["all", "carpet_change"].includes(activeTab)) add(unit.carpet_delta, unit.prev_carpet, unit['Carpet area in sft'], "Carpet Area", true);
    if (changes.length === 0) return <span className="text-gray-300">-</span>;
    return (
      <div className="flex flex-col gap-3 py-1">
        {changes.map((item, i) => (
          <div key={i} className="flex flex-col gap-1 border-b border-gray-100 last:border-0 pb-2 last:pb-0">
            <span className="text-[10px] font-black uppercase text-blue-600">{item.label}</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="line-through text-gray-400">{item.isArea ? `${item.prev} sft` : fmt(item.prev)}</span>
              <MoveRight size={12} className="text-blue-400" />
              <span className="font-bold">{item.isArea ? `${item.curr} sft` : fmt(item.curr)}</span>
            </div>
            <div className={`text-[11px] font-bold flex items-center gap-1 ${item.delta < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {item.delta < 0 ? <ArrowDownRight size={10} /> : <ArrowUpRight size={10} />}
              {item.delta < 0 ? 'Reduced by' : 'Increased by'} {item.isArea ? `${Math.abs(item.delta)} sft` : fmt(Math.abs(item.delta))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const tabs = [
    { id: "all", label: "All Errors", color: "bg-blue-600" },
    { id: "new", label: "New Bookings", color: "bg-purple-600" },
    { id: "transfer", label: "Transfers", color: "bg-blue-500" },
    { id: "anomaly", label: "Anomaly", color: "bg-purple-600" },
    { id: "name_correction", label: "Name Correction", color: "bg-teal-600" },
    { id: "cancelled", label: "Cancelled", color: "bg-orange-500" },
    { id: "duplicate", label: "Duplicate Units", color: "bg-red-600" },
    { id: "agreement_change", label: "Agreement Value Changes", color: "bg-amber-500" },
    { id: "amount_change", label: "Amount Received ↓", color: "bg-cyan-600" },
    { id: "demand_change", label: "Demand Raised ↓", color: "bg-rose-600" },
    { id: "saleable_change", label: "Saleable Area Changes", color: "bg-emerald-600" },
    { id: "carpet_change", label: "Carpet Area Changes", color: "bg-indigo-600" },
  ];

  return (
    <Layout title="MIS Sanity Check">

      <div className="mb-6">
        <h3 className="text-gray-800 font-bold text-lg">MIS Sanity Check</h3>
        <p className="text-gray-400 text-sm mt-1">Upload Previous and Current month MIS sheets to run a sanity comparison.</p>
      </div>

      {/* Upload Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <p className="text-sm font-semibold text-gray-600 mb-2">Previous Month MIS</p>
          <FileUploadBox label="Upload Previous Sheet" subtitle="Last month's MIS Excel file"
            file={files.prev} accent="blue"
            onFileSelect={(f) => setFiles(p => ({ ...p, prev: f }))}
            onClear={() => setFiles(p => ({ ...p, prev: null }))} />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-600 mb-2">Current Month MIS</p>
          <FileUploadBox label="Upload Current Sheet" subtitle="This month's MIS Excel file"
            file={files.curr} accent="indigo"
            onFileSelect={(f) => setFiles(p => ({ ...p, curr: f }))}
            onClear={() => setFiles(p => ({ ...p, curr: null }))} />
        </div>
      </div>

      {/* Run Button */}
      <div className="flex justify-center mb-8">
        <button onClick={runSanityCheck} disabled={!files.prev || !files.curr || isProcessing}
          className={`flex items-center gap-3 px-10 py-3.5 rounded-xl font-bold text-sm transition-all
            ${files.prev && files.curr && !isProcessing
              ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 hover:scale-105 active:scale-95"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
          {isProcessing ? "Analyzing Data..." : "Run Sanity Check"}
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Status Banner */}
      {results && (
        <div className="mb-6">
          {results.sanity_check_passed ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle size={22} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-emerald-700">✓ Sanity Check Passed</h3>
                <p className="text-emerald-600 text-sm">No issues detected. You can proceed to other modules.</p>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle size={22} className="text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-red-700">⚠ Sanity Check Failed</h3>
                <p className="text-gray-600 text-sm mb-2">The following issues were found:</p>
                <ul className="list-disc list-inside text-red-600 font-bold text-sm">
                  {(results.issues || []).map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">

          {/* Download */}
          <div className="flex justify-end">
            <button onClick={downloadExcel}
              className="px-6 py-2.5 rounded-lg font-bold text-sm bg-green-600 hover:bg-green-700 text-white shadow flex items-center gap-2 transition-all">
              ⬇ Download Failed_Sanity_Checks.xlsx
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'New Bookings', value: results.summary.new_bookings_count, sub: 'New Inventory', accent: 'border-l-purple-500' },
              { label: 'Transfers', value: results.summary.transferred_count, sub: 'Ownership Change', accent: 'border-l-blue-500' },
              { label: 'Name Corr.', value: results.summary.name_correction_count, sub: 'Spelling Fixes', accent: 'border-l-teal-500' },
              { label: 'Cancelled', value: results.summary.cancelled_count, sub: 'Unsold/Missing', accent: 'border-l-orange-500' },
              { label: 'Duplicates', value: results.summary.duplicate_count || 0, sub: 'Duplicate Entries', accent: 'border-l-red-500' },
              { label: 'Anomaly', value: results.summary.anomaly_count || 0, sub: 'Resale / Anomaly', accent: 'border-l-purple-500' },
            ].map((card) => (
              <div key={card.label} className={`bg-white p-5 rounded-xl border border-gray-200 border-l-4 ${card.accent} shadow-sm hover:shadow-md transition-shadow`}>
                <p className="text-gray-500 text-[10px] font-bold uppercase mb-2 tracking-widest">{card.label}</p>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">{card.value}</h2>
                <span className="text-gray-400 text-[11px]">{card.sub}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryBox title="Agreement Value" incValue={results.summary.agreement_inc} decValue={results.summary.agreement_dec} incCount={results.summary.agreement_inc_count} decCount={results.summary.agreement_dec_count} accentClass="border-l-amber-500" />
            <SummaryBox title="Amount Received" decValue={results.summary.amount_dec} decCount={results.summary.amount_dec_count} accentClass="border-l-cyan-500" showDecreaseOnly />
            <SummaryBox title="Demand Raised" decValue={results.summary.demand_dec} decCount={results.summary.demand_dec_count} accentClass="border-l-rose-500" showDecreaseOnly />
            <SummaryBox title="Saleable Area" incValue={results.summary.saleable_inc} decValue={results.summary.saleable_dec} incCount={results.summary.saleable_inc_count} decCount={results.summary.saleable_dec_count} isArea accentClass="border-l-emerald-500" />
            <SummaryBox title="Carpet Area" incValue={results.summary.carpet_inc} decValue={results.summary.carpet_dec} incCount={results.summary.carpet_inc_count} decCount={results.summary.carpet_dec_count} isArea accentClass="border-l-indigo-500" />
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-2 bg-gray-50">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                      ${activeTab === tab.id ? `${tab.color} text-white shadow-sm` : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto relative w-full lg:w-64 mt-2 lg:mt-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input type="text" placeholder="Search records..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg py-2 pl-9 pr-4 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition" />
              </div>
            </div>
            <div className="overflow-x-auto max-h-[750px]">
              <table className="w-full text-left border-collapse min-w-[2500px]">
                <thead>
                  <tr className="bg-gray-50 sticky top-0 z-10 text-gray-500 uppercase text-[11px] font-black tracking-widest border-b border-gray-200">
                    <th className="p-4 w-12">#</th>
                    {columnSequence.map((key) => <th key={key} className="p-4 whitespace-nowrap">{key}</th>)}
                    <th className="p-4 sticky right-0 bg-gray-50 z-20 text-blue-600 min-w-[280px] border-l border-gray-200">Change Highlights</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUnits.length > 0 ? filteredUnits.map((unit, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/50 text-sm group transition-all">
                      <td className="p-4 text-gray-400 font-mono group-hover:text-blue-600">{idx + 1}</td>
                      {columnSequence.map((key) => (
                        <td key={key} className="p-4 whitespace-nowrap font-medium text-gray-700">{String(unit[key] || "-")}</td>
                      ))}
                      <td className="p-4 bg-white sticky right-0 border-l border-gray-100 group-hover:bg-blue-50/50 shadow-[-8px_0_12px_rgba(0,0,0,0.04)]">
                        {renderChange(unit)}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={columnSequence.length + 2} className="p-16 text-center text-gray-400 font-medium italic">
                        No matching records found in this category.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}