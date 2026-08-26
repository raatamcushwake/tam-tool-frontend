import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/common/Layout";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import { getLastApprovedMIS, getAllApprovedMIS } from "../services/misSubmissionService";
import { getBusinessPlanData } from "../services/referenceService";
import MonthlyNetCollection from "../components/dashboard/charts/MonthlyNetCollection";
import MonthlyNetAreaSold from "../components/dashboard/charts/MonthlyNetAreaSold";
import TowerWiseSaleVsCollection from "../components/dashboard/charts/TowerWiseSaleVsCollection";
import TowerWiseSaleVsDemand from "../components/dashboard/charts/TowerWiseSaleVsDemand";
import TowerWiseDemandVsCollection from "../components/dashboard/charts/TowerWiseDemandVsCollection";
import { getInventoryData } from "../services/referenceService";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Building2, Store, ChevronRight, ChevronLeft, TrendingUp, Home } from "lucide-react";

const isUnitSold = (customerName) => {
  if (!customerName) return false;
  const name = String(customerName).trim().toUpperCase();
  return !["", "-", "N/A", "NOT APPLICABLE", "EMPTY", "NULL", "UNDEFINED", "UNSOLD"].includes(name);
};

const isCommercial = (unitType) => {
  const type = String(unitType || "").toUpperCase();
  return type.includes("COMMERCIAL") || type.includes("SHOP") || type.includes("OFFICE");
};

const COLORS = {
  sold: "#2563eb",
  unsold: "#f43f5e",
  palette: ["#2563eb","#7c3aed","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#0284c7"],
};

const formatNum = (val) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

export default function Dashboard() {
  const navigate = useNavigate();
  const { userProfile, currentUser } = useAuth();
  const { selectedProject, selectProject } = useProject();

  const [misData, setMisData] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [allApprovedMIS, setAllApprovedMIS] = useState([]);
  const [businessPlan, setBusinessPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [allProjects, setAllProjects] = useState([]);

  // Drill-down state
  // level: 'root' | 'tower' | 'unittype'
  const [drillLevel, setDrillLevel] = useState("root");
  const [selectedSegment, setSelectedSegment] = useState(null); // 'sold' or 'unsold'
  const [selectedTower, setSelectedTower] = useState(null);

  useEffect(() => {
    const projectId = selectedProject?.projectId;
    if (!projectId) return;
    setLoading(true);
    setDrillLevel("root");
    setSelectedSegment(null);
    setSelectedTower(null);
    Promise.all([
  getLastApprovedMIS(projectId),
  getInventoryData(projectId),
  getAllApprovedMIS(projectId),
  getBusinessPlanData(projectId),
]).then(([mis, inv, allMIS, bp]) => {
  setMisData(mis);
  setInventoryData(inv);
  setAllApprovedMIS(allMIS || []);
  setBusinessPlan(bp);
  setLoading(false);
});
  }, [selectedProject]);

useEffect(() => {
  if (!userProfile?.isAdmin) return;
  fetch(`${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}/api/projects`)
    .then(r => r.json())
    .then(data => setAllProjects(data || []))
    .catch(() => {});
}, [userProfile]);

  const extractedData = useMemo(() => misData?.extractedData || [], [misData]);
const towerWiseOSData = useMemo(() => {
  const towerMap = {};
  extractedData
    .filter(r => r.Status !== "CANCELLATION")
    .forEach(r => {
      const tower = String(r["Tower"] || "Unknown").trim();
      if (!towerMap[tower]) {
        towerMap[tower] = { tower, agreementValue: 0, collection: 0, demand: 0 };
      }
      towerMap[tower].agreementValue += parseFloat(r["Agreement value"] || 0);
      towerMap[tower].collection += parseFloat(r["Amount Received excl. Tax"] || 0);
      towerMap[tower].demand += parseFloat(r["Demand Raised as on Current Month excl. tax"] || 0);
    });
  return Object.values(towerMap).map(t => ({
    ...t,
    osVsSale: t.agreementValue - t.collection,
    osVsDemand: t.demand - t.collection,
    collectionPct: t.agreementValue > 0 ? (t.collection / t.agreementValue) * 100 : 0,
    demandPct: t.agreementValue > 0 ? (t.demand / t.agreementValue) * 100 : 0,
    osSalePct: t.agreementValue > 0 ? ((t.agreementValue - t.collection) / t.agreementValue) * 100 : 0,
    osDemandPct: t.demand > 0 ? ((t.demand - t.collection) / t.demand) * 100 : 0,
  })).sort((a, b) => b.agreementValue - a.agreementValue);
}, [extractedData]);

  // ── Helper: parse "FEB-2026" → Date for sorting ───────────────
const parseMonthYear = (str) => {
  const months = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  const [m, y] = String(str || "").toUpperCase().split("-");
  return new Date(parseInt(y), months[m] ?? 0, 1);
};

// ── Map quarterly Business Plan → per-month planned values ────
const quarterlyPlanMap = useMemo(() => {
  if (!businessPlan?.quarters) return {};
  const map = {};
  const monthOrder = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

  businessPlan.quarters.forEach((q) => {
    const range = String(q.monthRange || "").toLowerCase();
    const foundMonths = monthOrder.filter(m =>
      range.includes(m.toLowerCase().substring(0, 3))
    );
    if (foundMonths.length < 2) return;

    const startIdx = monthOrder.indexOf(foundMonths[0]);
    const endIdx = monthOrder.indexOf(foundMonths[foundMonths.length - 1]);
    const yearMatch = String(q.monthRange || "").match(/\d{4}/);
    const year = yearMatch ? yearMatch[0] : null;
    if (!year) return;

    for (let i = startIdx; i <= endIdx; i++) {
      const key = `${monthOrder[i]}-${year}`;
      map[key] = {
        plannedCollection: (q.collectionsPlanned || 0) / 3,
        plannedArea: (q.areaToSellPlanned || 0) / 3,
      };
    }
  });
  return map;
}, [businessPlan]);

// ── Month-wise Net Collection chart data ──────────────────────
const collectionChartData = useMemo(() => {
  return allApprovedMIS
    .slice()
    .sort((a, b) => parseMonthYear(a.monthYear) - parseMonthYear(b.monthYear))
    .map((mis) => {
      const rows = mis.extractedData || [];
const cancellations = rows.filter((r) => r.Status === "CANCELLATION");

const actualCollection = rows.reduce((s, r) => {
  if (r.Status === "CANCELLATION") return s;
  if (r.Status === "NEW") {
    return s + parseFloat(r["Amount Received excl. Tax Current Month"] || 0);
  }
  const rc = parseFloat(r["RECEIVED_INCREMENT_VAL"] || 0);
  return rc > 0 ? s + rc : s;
}, 0);

const cancelledCollection = cancellations.reduce(
  (s, r) => s + parseFloat(r["Amount Received excl. Tax Current Month"] || 0), 0
);
const netCollection = actualCollection - cancelledCollection;
      const planned = quarterlyPlanMap[mis.monthYear]?.plannedCollection || 0;

      return {
        month: mis.monthYear,
        planned,
        actual: actualCollection,
        net: netCollection,
      };
    });
}, [allApprovedMIS, quarterlyPlanMap]);

// ── Month-wise Net Area Sold chart data ───────────────────────
const areaSoldChartData = useMemo(() => {
  return allApprovedMIS
    .slice()
    .sort((a, b) => parseMonthYear(a.monthYear) - parseMonthYear(b.monthYear))
    .map((mis) => {
      const rows = mis.extractedData || [];
      const newBookings = rows.filter(
  (r) => r.Status === "NEW"
);

      const cancellations = rows.filter((r) => r.Status === "CANCELLATION");

      const actualArea = newBookings.reduce(
        (s, r) => s + parseFloat(r["Saleable area in sft"] || 0), 0
      );
      const cancelledArea = cancellations.reduce(
        (s, r) => s + parseFloat(r["Saleable area in sft"] || 0), 0
      );
      const netArea = actualArea - cancelledArea;
      const planned = quarterlyPlanMap[mis.monthYear]?.plannedArea || 0;

      return {
        month: mis.monthYear,
        planned,
        actual: actualArea,
        net: netArea,
      };
    });
}, [allApprovedMIS, quarterlyPlanMap]);

  // ── Root level: Sold vs Unsold ────────────────────────────────
  const rootData = useMemo(() => {
    const totalUnits = inventoryData?.rows
      ? inventoryData.rows.reduce((a, r) => a + (r.totalUnits || 0), 0)
      : 0;
    const sold = extractedData.filter(
      (r) => r.Status !== "CANCELLATION" && isUnitSold(r["Customer Name"])
    ).length;
    const unsold = Math.max(0, totalUnits - sold);
    return [
      { name: "Sold Units", value: sold, key: "sold" },
      { name: "Unsold Units", value: unsold, key: "unsold" },
    ];
  }, [extractedData, inventoryData]);

  // ── Tower level: tower-wise sold OR unsold ────────────────────
  const towerData = useMemo(() => {
    if (!selectedSegment) return [];

    if (selectedSegment === "sold") {
      const filtered = extractedData.filter((r) =>
        r.Status !== "CANCELLATION" && isUnitSold(r["Customer Name"])
      );
      const towerMap = {};
      filtered.forEach((r) => {
        const tower = String(r["Tower"] || "Unknown").trim();
        towerMap[tower] = (towerMap[tower] || 0) + 1;
      });
      return Object.entries(towerMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    }

    // Unsold: inventoryData total per tower minus sold per tower
    const soldPerTower = {};
    extractedData
      .filter((r) => r.Status !== "CANCELLATION" && isUnitSold(r["Customer Name"]))
      .forEach((r) => {
        const tower = String(r["Tower"] || "Unknown").trim();
        soldPerTower[tower] = (soldPerTower[tower] || 0) + 1;
      });

    const towerMap = {};
    (inventoryData?.rows || []).forEach((r) => {
      const tower = String(r.tower || r.towerName || r.Tower || "Unknown").trim();
      const total = r.totalUnits || 0;
      const sold = soldPerTower[tower] || 0;
      const unsold = Math.max(0, total - sold);
      if (unsold > 0) towerMap[tower] = unsold;
    });

    return Object.entries(towerMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [extractedData, selectedSegment, inventoryData]);

  // ── Unit Type level: unit-type breakdown for selected tower ───
  const unitTypeData = useMemo(() => {
    if (!selectedTower || !selectedSegment) return [];
    const filtered = extractedData.filter((r) => {
      if (r.Status === "CANCELLATION") return false;
      const tower = String(r["Tower"] || "Unknown").trim();
      if (tower !== selectedTower) return false;
      return selectedSegment === "sold"
        ? isUnitSold(r["Customer Name"])
        : !isUnitSold(r["Customer Name"]);
    });
    const typeMap = {};
    filtered.forEach((r) => {
      const utype = String(r["Unit Type"] || "Unknown").trim();
      if (!typeMap[utype]) {
        typeMap[utype] = {
          units: 0,
          agreementValue: 0,
          saleableArea: 0,
          amountReceived: 0,
        };
      }
      typeMap[utype].units++;
      typeMap[utype].agreementValue += parseFloat(r["Agreement value"] || 0);
      typeMap[utype].saleableArea += parseFloat(r["Saleable area in sft"] || 0);
      typeMap[utype].amountReceived += parseFloat(r["Amount Received excl. Tax Current Month"] || 0);
    });
    return Object.entries(typeMap)
      .map(([name, vals]) => ({ name, ...vals }))
      .sort((a, b) => b.units - a.units);
  }, [extractedData, selectedSegment, selectedTower]);

  // ── Pie click handler ─────────────────────────────────────────
  const handlePieClick = (data) => {
    if (drillLevel === "root") {
      setSelectedSegment(data.key);
      setDrillLevel("tower");
    } else if (drillLevel === "tower") {
      setSelectedTower(data.name);
      setDrillLevel("unittype");
    }
  };

  const handleBack = () => {
    if (drillLevel === "unittype") {
      setDrillLevel("tower");
      setSelectedTower(null);
    } else if (drillLevel === "tower") {
      setDrillLevel("root");
      setSelectedSegment(null);
    }
  };

  // ── Chart data by level ───────────────────────────────────────
  const currentChartData = useMemo(() => {
    if (drillLevel === "root") return rootData;
    if (drillLevel === "tower") return towerData;
    if (drillLevel === "unittype") return unitTypeData.map((d) => ({ name: d.name, value: d.units }));
    return [];
  }, [drillLevel, rootData, towerData, unitTypeData]);

  const chartColors = useMemo(() => {
    if (drillLevel === "root") return [COLORS.sold, COLORS.unsold];
    return COLORS.palette;
  }, [drillLevel]);

  const breadcrumb = useMemo(() => {
    const parts = ["Inventory"];
    if (selectedSegment) parts.push(selectedSegment === "sold" ? "Sold Units" : "Unsold Units");
    if (selectedTower) parts.push(selectedTower);
    return parts;
  }, [selectedSegment, selectedTower]);

  const drillTitle = useMemo(() => {
    if (drillLevel === "root") return "Inventory Overview";
    if (drillLevel === "tower") return `Tower-wise ${selectedSegment === "sold" ? "Sold" : "Unsold"} Units`;
    if (drillLevel === "unittype") return `${selectedTower} — Unit Type Breakdown`;
    return "";
  }, [drillLevel, selectedSegment, selectedTower]);

  // ── Custom Tooltip ────────────────────────────────────────────
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-lg text-sm">
          <p className="font-black text-gray-800">{payload[0].name}</p>
          <p className="text-blue-600 font-bold">{payload[0].value} units</p>
          {drillLevel === "root" && (
            <p className="text-[10px] text-gray-400 mt-1">Click to drill down →</p>
          )}
          {drillLevel === "tower" && (
            <p className="text-[10px] text-gray-400 mt-1">Click to see unit types →</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Layout title="Dashboard">
      <button onClick={() => navigate("/services/continuous-monitoring")}
        className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all">
        ← Back
      </button>
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 mb-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-2xl font-bold">
              Welcome back, {userProfile?.name || currentUser?.email?.split("@")[0]}! 👋
            </h2>
            <p className="text-blue-100 mt-1 text-sm">
              Here's what's happening across your project today.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-white/20 rounded-xl px-4 py-2">
            <TrendingUp size={18} className="text-white" />
            <span className="text-white text-sm font-medium">All Systems Operational</span>
          </div>
        </div>
      </div>

      {/* Admin Project Switcher */}
{userProfile?.isAdmin && allProjects.length > 0 && (
  <div className="mb-5 flex items-center gap-3">
    <span className="text-xs font-black uppercase tracking-widest text-gray-400">View Project:</span>
    <select
      value={selectedProject?.projectId || ""}
      onChange={e => {
  const proj = allProjects.find(p => (p.projectId || p.id) === e.target.value);
  if (proj) selectProject({ 
    projectId: proj.projectId || proj.id, 
    projectName: proj.projectName || proj.name, 
    role: "MANAGER" 
  });
}}
      className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-blue-400 shadow-sm"
    >
      <option value="">— Select a Project —</option>
      {allProjects.map(p => (
  <option key={p.projectId || p.id} value={p.projectId || p.id}>{p.projectName || p.name || p.projectId || p.id}</option>
))}
    </select>
  </div>
)}

      {/* No Project Selected */}
      {!selectedProject && (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <Home size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold">No project selected</p>
          <p className="text-gray-400 text-sm mt-1">Select a project to view dashboard analytics.</p>
        </div>
      )}

      {/* Loading */}
      {selectedProject && loading && (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <p className="text-gray-400 text-sm font-bold animate-pulse">Loading latest approved MIS data...</p>
        </div>
      )}

      {/* No approved MIS yet */}
      {selectedProject && !loading && !misData && (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <Building2 size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold">No approved MIS found</p>
          <p className="text-gray-400 text-sm mt-1">
            Dashboard will populate once Manager approves a MIS submission.
          </p>
        </div>
      )}

      {/* Main Dashboard */}
      {selectedProject && !loading && misData && (
        <>
          {/* Approved Month Info */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase tracking-widest text-gray-400">
                Showing Data For
              </span>
              <span className="bg-green-100 text-green-700 border border-green-200 text-xs font-black px-3 py-1 rounded-full">
                {misData.monthYear}
              </span>
              <span className="text-xs text-gray-400">
                Approved by {misData.approvedBy?.split("@")[0]} on{" "}
                {new Date(misData.approvedAt).toLocaleDateString("en-GB", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              {
                label: "Total Units",
                value: rootData[0].value + rootData[1].value,
                color: "text-purple-600",
                bg: "bg-purple-50",
                border: "border-purple-200",
              },
              {
                label: "Sold Units",
                value: rootData[0].value,
                color: "text-blue-600",
                bg: "bg-blue-50",
                border: "border-blue-200",
              },
              {
                label: "Unsold Units",
                value: rootData[1].value,
                color: "text-rose-500",
                bg: "bg-rose-50",
                border: "border-rose-200",
              },
            ].map((s) => (
              <div
                key={s.label}
                className={`${s.bg} border ${s.border} rounded-2xl p-5 flex flex-col items-center shadow-sm`}
              >
                <span className={`text-3xl font-bold ${s.color}`}>{s.value}</span>
                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest mt-1">
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* Inventory Pie Chart Card */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-6">
            {/* Card Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
              <Building2 className="text-blue-600" size={20} />
              <div className="flex-1">
                <h3 className="font-black text-gray-800 text-base uppercase tracking-tight">
                  {drillTitle}
                </h3>
                {/* Breadcrumb */}
                <div className="flex items-center gap-1 mt-0.5">
                  {breadcrumb.map((b, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight size={10} className="text-gray-400" />}
                      <span
                        className={`text-[10px] font-bold ${
                          i === breadcrumb.length - 1
                            ? "text-blue-600"
                            : "text-gray-400"
                        }`}
                      >
                        {b}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              {drillLevel !== "root" && (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition"
                >
                  <ChevronLeft size={13} /> Back
                </button>
              )}
            </div>

            {/* Chart + Legend Layout */}
            <div className="p-6 flex flex-col lg:flex-row gap-6 items-center">
              {/* Pie Chart */}
              <div className="w-full lg:w-1/2" style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
  data={currentChartData}
  cx="50%"
  cy="50%"
  innerRadius={0}
  outerRadius={130}
  paddingAngle={2}
  dataKey="value"
  onClick={drillLevel !== "unittype" ? handlePieClick : undefined}
  style={{ cursor: drillLevel !== "unittype" ? "pointer" : "default" }}
  label={({ name, value, percent }) =>
    `${name}: ${value} (${(percent * 100).toFixed(1)}%)`
  }
  labelLine={true}
>
                      {currentChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={chartColors[index % chartColors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend / Detail Panel */}
              <div className="w-full lg:w-1/2 flex flex-col gap-3">
                {drillLevel !== "unittype" &&
                  currentChartData.map((entry, index) => (
                    <div
                      key={entry.name}
                      onClick={drillLevel !== "unittype" ? () => handlePieClick(entry) : undefined}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all
                        ${drillLevel !== "unittype" ? "cursor-pointer hover:shadow-md hover:border-blue-300" : ""}
                        ${index === 0 && drillLevel === "root" ? "border-blue-200 bg-blue-50" : ""}
                        ${index === 1 && drillLevel === "root" ? "border-rose-200 bg-rose-50" : ""}
                        ${drillLevel === "tower" ? "border-gray-200 bg-gray-50 hover:bg-blue-50" : ""}
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: chartColors[index % chartColors.length] }}
                        />
                        <span className="text-sm font-bold text-gray-700">{entry.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-gray-800">{entry.value}</span>
                        <span className="text-xs text-gray-400 font-medium">units</span>
                        {drillLevel !== "unittype" && (
                          <ChevronRight size={14} className="text-gray-400" />
                        )}
                      </div>
                    </div>
                  ))}

                {/* Unit Type Detail Table */}
                {drillLevel === "unittype" && (
                  <div className="overflow-auto rounded-xl border border-gray-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-500">Unit Type</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-500 text-center">Units</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-500 text-right">Agreement (Cr)</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-500 text-right">Area (sft)</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-500 text-right">Received (Cr)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {unitTypeData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-blue-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-700 flex items-center gap-2">
                              {isCommercial(row.name) ? (
                                <Store size={14} className="text-indigo-500" />
                              ) : (
                                <Building2 size={14} className="text-blue-500" />
                              )}
                              {row.name}
                            </td>
                            <td className="px-4 py-3 text-center font-black text-blue-600">{row.units}</td>
                            <td className="px-4 py-3 text-right text-gray-700 font-medium">
                              ₹{formatNum(row.agreementValue / 10000000)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700 font-medium">
                              {formatNum(row.saleableArea)}
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-600 font-bold">
                              ₹{formatNum(row.amountReceived / 10000000)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Footer hint */}
            {drillLevel !== "unittype" && (
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  {drillLevel === "root"
                    ? "💡 Click on Sold or Unsold slice to drill down by Tower"
                    : "💡 Click on a Tower to see Unit Type breakdown"}
                </p>
              </div>
            )}
          </div>

          {/* Monthly Net Collection Chart */}
          <MonthlyNetCollection data={collectionChartData} />

          {/* Monthly Net Area Sold Chart */}
          <MonthlyNetAreaSold data={areaSoldChartData} />

          {/* Tower-wise O/S Tables */}
          <TowerWiseSaleVsCollection data={towerWiseOSData} />
          <TowerWiseSaleVsDemand data={towerWiseOSData} />
          <TowerWiseDemandVsCollection data={towerWiseOSData} />

        </>
      )}
    </Layout>
  );
}
