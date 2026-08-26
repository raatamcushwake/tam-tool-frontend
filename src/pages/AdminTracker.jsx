import { useState, useEffect } from "react";
import Layout from "../components/common/Layout";
import { getAllProjectsWithSubmissions } from "../services/adminTrackerService";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useAuth } from "../context/AuthContext";

const STATUS_COLOR = {
  PENDING_REVIEW:       "bg-yellow-100 text-yellow-700 border-yellow-200",
  PENDING_MANAGER:      "bg-blue-100 text-blue-700 border-blue-200",
  APPROVED:             "bg-green-100 text-green-700 border-green-200",
  REJECTED_BY_REVIEWER: "bg-red-100 text-red-700 border-red-200",
  REJECTED_BY_MANAGER:  "bg-red-100 text-red-700 border-red-200",
};

const STATUS_LABEL = {
  PENDING_REVIEW:       "Pending Review",
  PENDING_MANAGER:      "Pending Manager",
  APPROVED:             "Approved",
  REJECTED_BY_REVIEWER: "Rejected by Reviewer",
  REJECTED_BY_MANAGER:  "Rejected by Manager",
};

const TYPE_COLOR = {
  "MIS Sanity":        "bg-purple-100 text-purple-700",
  "MIS":               "bg-blue-100 text-blue-700",
  "CS Tracker":        "bg-teal-100 text-teal-700",
  "Approval Tracker":  "bg-orange-100 text-orange-700",
  "Cost Analysis":     "bg-pink-100 text-pink-700",
};

const fmt = (val) => {
  if (!val) return "—";
  if (val?.seconds) return new Date(val.seconds * 1000).toLocaleDateString("en-GB");
  return new Date(val).toLocaleDateString("en-GB");
};

export default function AdminTracker() {
  console.log("🔥 TRACKER FILE VERSION 2 LOADED 🔥");
  const { isExecutive, isBusinessHead, tamRegion } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState("ALL");
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    fetch(`${apiUrl}/api/projects`)
      .then(r => r.json())
      .then(async (data) => {
        const allProjects = data || [];

        // Business Head (and Admin, who already reaches this page) see everything.
        // Executive only sees projects in their own region(s).
        const scopedProjects = isExecutive && !isBusinessHead
          ? allProjects.filter((p) => tamRegion.includes(p.region))
          : allProjects;

        setProjects(scopedProjects);
        const allRows = await getAllProjectsWithSubmissions(scopedProjects);
        console.log("ALLROWS LENGTH:", allRows.length, allRows);
        setRows(allRows);
        setLoading(false);
      })
      .catch((err) => {
        console.error("🚨 TRACKER FETCH ERROR:", err);
        setLoading(false);
      });
  }, [isExecutive, isBusinessHead, tamRegion]);

  const filtered = rows.filter(r =>
    (filterProject === "ALL" || r._projectName === filterProject) &&
    (filterType === "ALL" || r._type === filterType) &&
    (filterStatus === "ALL" || r.status === filterStatus)
  );

  const projectNames = [...new Set(rows.map(r => r._projectName))];
  const exportToExcel = () => {
  const exportData = filtered.map((row) => ({
    Project: row._projectName,
    Module: row._type,
    Period: row.monthYear || row.period,
    Status: STATUS_LABEL[row.status] || row.status,

    Maker: row.submittedBy,
    "Maker Date": fmt(row.submittedAt),
    "Maker Comment": row.makerComment,

    Reviewer: row.reviewedBy || "Awaiting",
    "Reviewer Date": fmt(row.reviewedAt),
    "Reviewer Comment": row.reviewerComment,

    Manager: row.approvedBy || row.rejectedBy || "Awaiting",
    "Manager Date": fmt(row.approvedAt || row.rejectedAt),
    "Manager Comment": row.managerComment,

    "Rejection Comment": row.rejectionComment,
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Activity Tracker"
  );

  const excelBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  const blob = new Blob([excelBuffer], {
    type: "application/octet-stream",
  });

  saveAs(blob, "ActivityTracker.xlsx");
};

  return (
    <Layout title="Activity Tracker">
      <div className="mb-6">
        <h3 className="text-gray-800 font-bold text-lg">Activity Tracker</h3>
        <p className="text-gray-400 text-sm mt-1">All submissions across all projects and modules.</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none shadow-sm">
          <option value="ALL">All Projects</option>
          {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none shadow-sm">
          <option value="ALL">All Modules</option>
          {["MIS Sanity", "MIS", "CS Tracker", "Approval Tracker", "Cost Analysis"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none shadow-sm">
          <option value="ALL">All Statuses</option>
          {Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button
  onClick={exportToExcel}
  className="bg-purple-600 text-white px-4 py-2 rounded-xl"
>
  Download Excel
</button>

        <span className="ml-auto text-xs text-gray-400 font-bold self-center">{filtered.length} records</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <p className="text-gray-400 animate-pulse">Loading all submissions...</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
          <table className="w-full text-[13px] text-left border-collapse">
            <thead className="bg-gray-50">
              <tr>
                {["Project", "Module", "Period / Month", "Status", "Maker", "Reviewer", "Manager"].map(h => (
                  <th key={h} className="px-4 py-3 border-b border-gray-200 font-bold text-gray-500 text-xs uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No records found</td></tr>
              ) : filtered.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 font-bold text-gray-700 whitespace-nowrap">{row._projectName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${TYPE_COLOR[row._type]}`}>{row._type}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-700">{row.monthYear || row.period || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold border ${STATUS_COLOR[row.status] || "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABEL[row.status] || row.status || "—"}
                    </span>
                  </td>

                  {/* Maker Cell */}
                  <td className="px-4 py-3 min-w-[180px]">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-black text-gray-700">👤 {row.submittedBy?.split("@")[0] || "—"}</span>
                      <span className="text-xs text-gray-400">{fmt(row.submittedAt)}</span>
                      {row.makerComment && <span className="text-xs text-blue-600 italic mt-1">💬 "{row.makerComment}"</span>}
                    </div>
                  </td>

                  {/* Reviewer Cell */}
                  <td className="px-4 py-3 min-w-[180px]">
                    {row.reviewedBy ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-xs font-black ${row.status === "REJECTED_BY_REVIEWER" ? "text-red-600" : "text-emerald-600"}`}>
                          {row.status === "REJECTED_BY_REVIEWER" ? "❌" : "✅"} {row.reviewedBy.split("@")[0]}
                        </span>
                        <span className="text-xs text-gray-400">{fmt(row.reviewedAt)}</span>
                        {row.reviewerComment && <span className="text-xs text-purple-600 italic mt-1">💬 "{row.reviewerComment}"</span>}
                        {row.rejectionComment && row.status === "REJECTED_BY_REVIEWER" && (
                          <span className="text-xs text-red-500 italic mt-1">❌ "{row.rejectionComment}"</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300 font-bold">⏳ Awaiting</span>
                    )}
                  </td>

                  {/* Manager Cell */}
                  <td className="px-4 py-3 min-w-[180px]">
                    {row.approvedBy || row.rejectedBy ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-xs font-black ${row.status === "REJECTED_BY_MANAGER" ? "text-red-600" : "text-emerald-600"}`}>
                          {row.status === "REJECTED_BY_MANAGER" ? "❌" : "✅"} {(row.approvedBy || row.rejectedBy)?.split("@")[0]}
                        </span>
                        <span className="text-xs text-gray-400">{fmt(row.approvedAt || row.rejectedAt)}</span>
                        {row.managerComment && <span className="text-xs text-green-600 italic mt-1">💬 "{row.managerComment}"</span>}
                        {row.rejectionComment && row.status === "REJECTED_BY_MANAGER" && (
                          <span className="text-xs text-red-500 italic mt-1">❌ "{row.rejectionComment}"</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300 font-bold">⏳ Awaiting</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
