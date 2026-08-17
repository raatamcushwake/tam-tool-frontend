import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import Layout from "../components/common/Layout";
import { doc, getDoc } from "firebase/firestore";
import { db, getEscrowStatus, setEscrowStatus, ESCROW_STATUS, getEscrowHistoryMonth, getEscrowHistoryList } from "../services/escrow";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Landmark, Download, CheckCircle, XCircle, Send, Clock, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx-js-style";

function AccountSummaryCard({ account, remarksData }) {
  if (!remarksData) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Landmark size={20} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-base">
              {account.description || account.accountName} — {account.accNo}
            </h3>
            <p className="text-gray-400 text-xs">{account.accountName}</p>
          </div>
          <span className="ml-auto text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full">
            No PDF uploaded
          </span>
        </div>
        <p className="text-gray-400 text-sm py-6 text-center">
          No data found for this account.
        </p>
      </div>
    );
  }

  const inflow = remarksData.inflow || [];
  const outflow = remarksData.outflow || [];
  const openingBalance = remarksData.openingBalance || 0;

  // Group inflow by remark
  const inflowGroups = {};
  for (const row of inflow) {
    const key = (row.remark || "").trim() || "Others";
    if (!inflowGroups[key]) inflowGroups[key] = 0;
    inflowGroups[key] += row.amount || 0;
  }

  // Group outflow by remark
  const outflowGroups = {};
  for (const row of outflow) {
    const key = (row.remark || "").trim() || "Others";
    if (!outflowGroups[key]) outflowGroups[key] = 0;
    outflowGroups[key] += row.amount || 0;
  }

  const inflowKeys = Object.keys(inflowGroups);
  const outflowKeys = Object.keys(outflowGroups);
  const totalInflow = inflow.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalOutflow = outflow.reduce((sum, r) => sum + (r.amount || 0), 0);
  const closingBalance = openingBalance + totalInflow - totalOutflow;

  // The statement's own closing balance, taken from the last transaction
  // row when the PDF/Excel was parsed (see closingBalance in parseSheetRows).
  const statementClosingBalance = remarksData.closingBalance || 0;
  const isMatching = Math.abs(closingBalance - statementClosingBalance) < 1; // ₹1 tolerance for rounding

  const fmt = (val) => val.toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
      {/* Account Header */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
          <Landmark size={20} className="text-indigo-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-800 text-base">
            {account.description || account.accountName} — {account.accNo}
          </h3>
          <p className="text-gray-400 text-xs">{account.accountName}</p>
        </div>
      </div>

      {/* Horizontal Table */}
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
        <table className="text-xs border-collapse table-fixed" style={{ width: '100%' }}>
  <colgroup>
    <col style={{ width: '140px' }} />
    {inflowKeys.map(key => <col key={'col-' + key} style={{ width: '140px' }} />)}
    <col style={{ width: '140px' }} />
    {outflowKeys.map(key => <col key={'col-' + key} style={{ width: '140px' }} />)}
    <col style={{ width: '140px' }} />
    <col style={{ width: '140px' }} />
  </colgroup>
          <thead>
            {/* Row 1 — Main headings */}
            <tr>
              <th rowSpan={2}
                className="p-3 text-center font-bold text-gray-700 bg-blue-50 border border-gray-200 break-words align-middle">
                Opening Balance
              </th>

              {/* Inflows parent heading spanning all subheadings + total */}
              <th colSpan={inflowKeys.length + 1}
                className="p-2 text-center font-bold text-green-800 bg-green-100 border border-gray-200">
                Inflows
              </th>

              {/* Outflows parent heading spanning all subheadings + total */}
              <th colSpan={outflowKeys.length + 1}
                className="p-2 text-center font-bold text-red-800 bg-red-100 border border-gray-200">
                Outflows
              </th>

              <th rowSpan={2}
                className="p-3 text-center font-bold text-gray-700 bg-blue-50 border border-gray-200 break-words align-middle">
                Closing Balance
              </th>
            </tr>

            {/* Row 2 — Subheadings */}
            <tr>
              {/* Inflow subheadings */}
              {inflowKeys.map(key => (
                <th key={key}
                  className="p-3 text-center font-semibold text-green-700 bg-green-50 border border-gray-200 break-words">
                  ↳ {key}
                </th>
              ))}
              {/* Total Inflows */}
              <th className="p-3 text-center font-bold text-green-800 bg-green-100 border border-gray-200 break-words">
                Total Inflows
              </th>

              {/* Outflow subheadings */}
              {outflowKeys.map(key => (
                <th key={key}
                  className="p-3 text-center font-semibold text-red-700 bg-red-50 border border-gray-200 break-words">
                  ↳ {key}
                </th>
              ))}
              {/* Total Outflows */}
              <th className="p-3 text-center font-bold text-red-800 bg-red-100 border border-gray-200 break-words">
                Total Outflows
              </th>
            </tr>
          </thead>

          <tbody>
            <tr>
              {/* Opening Balance */}
              <td className="p-3 text-center font-bold text-blue-700 bg-blue-50 border border-gray-200 break-words">
                ₹{fmt(openingBalance)}
              </td>

              {/* Inflow subheading amounts */}
              {inflowKeys.map(key => (
                <td key={key}
                  className="p-3 text-center text-green-700 bg-green-50 border border-gray-200 break-words">
                  ₹{fmt(inflowGroups[key])}
                </td>
              ))}

              {/* Total Inflows */}
              <td className="p-3 text-center font-bold text-green-800 bg-green-100 border border-gray-200 break-words">
                ₹{fmt(totalInflow)}
              </td>

              {/* Outflow subheading amounts */}
              {outflowKeys.map(key => (
                <td key={key}
                  className="p-3 text-center text-red-700 bg-red-50 border border-gray-200 break-words">
                  ₹{fmt(outflowGroups[key])}
                </td>
              ))}

              {/* Total Outflows */}
              <td className="p-3 text-center font-bold text-red-800 bg-red-100 border border-gray-200 break-words">
                ₹{fmt(totalOutflow)}
              </td>

              {/* Closing Balance */}
              <td className="p-3 text-center font-bold text-blue-700 bg-blue-50 border border-gray-200 break-words">
                ₹{fmt(closingBalance)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Verification Note */}
      <div className="flex items-center justify-end gap-3 mt-3">
        <p className="text-xs text-gray-500 italic">
          Closing balance matching with statement
        </p>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all
            ${isMatching ? "bg-green-500 text-white border-green-500" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
            OK
          </span>
          <span className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all
            ${!isMatching ? "bg-red-500 text-white border-red-500" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
            Not OK
          </span>
        </div>
      </div>
    </div>
  );
}

export default function EscrowSummary() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { selectedProject } = useProject();
  const projectId = selectedProject?.projectId;

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [remarksByAcc, setRemarksByAcc] = useState({});

  const [workflowStatus, setWorkflowStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [lastComment, setLastComment] = useState(null);
  const [commentHistory, setCommentHistory] = useState([]);
  const [escrowMonth, setEscrowMonth] = useState("");
  const [searchParams] = useSearchParams();
  const historyMonth = searchParams.get("month");
  const [pastEscrows, setPastEscrows] = useState([]);

  useEffect(() => {
    const loadPastEscrows = async () => {
      if (!projectId) return;
      try {
        const list = await getEscrowHistoryList(projectId);
        setPastEscrows(list);
      } catch (e) {
        console.error("Could not load past escrow history:", e);
      }
    };
    loadPastEscrows();
  }, [projectId]);

  const role = userProfile?.projectRoles?.find(r => r.projectId === projectId)?.role;
  if (!["MANAGER", "MAKER", "REVIEWER"].includes(role)) {
    return (
      <Layout title="Account Summary">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
            <h3 className="text-gray-700 font-bold text-lg">Access Denied</h3>
            <p className="text-gray-400 text-sm mt-1">Only Managers, Makers, and Reviewers can access Account Summary.</p>
          </div>
        </div>
      </Layout>
    );
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (historyMonth) {
          const snap = await getEscrowHistoryMonth(projectId, historyMonth);
          if (!snap) { setLoading(false); return; }

          const accountsList = Object.entries(snap.accounts || {}).map(([accNo, cfg]) => ({
            accNo,
            accountName: cfg.accountName || "",
            description: snap.accountDescriptions?.[accNo] || "",
          }));
          const priorityOrder = ["100%", "70%", "30%"];
          accountsList.sort((a, b) => {
            const aIdx = priorityOrder.findIndex(p => (a.description || "").includes(p));
            const bIdx = priorityOrder.findIndex(p => (b.description || "").includes(p));
            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
          });
          setAccounts(accountsList);
          setRemarksByAcc(snap.remarksByAcc || {});
          setLoading(false);
          return;
        }

        // Load accounts config
        const accSnap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
        if (!accSnap.exists()) { setLoading(false); return; }

        const accData = accSnap.data();
        const accountsMap = accData.accounts || {};
        const accountDescriptions = accData.accountDescriptions || {};

        const accountsList = Object.entries(accountsMap).map(([accNo, cfg]) => ({
          accNo,
          accountName: cfg.accountName || "",
          description: accountDescriptions[accNo] || "",
        }));

        // Sort: 100% first, 70% second, 30% third, rest in any order
        const priorityOrder = ["100%", "70%", "30%"];
        accountsList.sort((a, b) => {
          const aIdx = priorityOrder.findIndex(p => (a.description || "").includes(p));
          const bIdx = priorityOrder.findIndex(p => (b.description || "").includes(p));
          const aPriority = aIdx === -1 ? 999 : aIdx;
          const bPriority = bIdx === -1 ? 999 : bIdx;
          return aPriority - bPriority;
        });

        setAccounts(accountsList);

       // Load remarks directly by account number
        const accRemarks = {};
        for (const acc of accountsList) {
          const safeKey = acc.accNo.replace(/[^a-zA-Z0-9]/g, "_");
          try {
            const remarksSnap = await getDoc(doc(db, "projects", projectId, "escrow", "remarks_" + safeKey));
            if (remarksSnap.exists()) {
              accRemarks[acc.accNo] = remarksSnap.data();
            }
          } catch (e) {
            console.error("Could not load remarks for", acc.accNo, e);
          }
        }

        setRemarksByAcc(accRemarks);

      } catch (e) {
        console.error("Error loading summary:", e);
      }
      setLoading(false);
    };

    if (projectId) fetchData();
  }, [projectId]);

  useEffect(() => {
    const loadStatus = async () => {
      if (!projectId) return;
      setStatusLoading(true);

      if (historyMonth) {
        setWorkflowStatus(ESCROW_STATUS.COMPLETED);
        setLastComment(null);
        setEscrowMonth(historyMonth.replace(/_/g, " "));
        setStatusLoading(false);
        return;
      }

      const s = await getEscrowStatus(projectId);
      setWorkflowStatus(s);
      try {
        const commentSnap = await getDoc(doc(db, "projects", projectId, "escrow", "workflowComment"));
        if (commentSnap.exists()) {
          const data = commentSnap.data();
          setLastComment(data);
          setCommentHistory(data.history || []);
        } else {
          setLastComment(null);
          setCommentHistory([]);
        }
      } catch (e) {
        console.error("Could not load workflow comment:", e);
      }
      try {
        const periodSnap = await getDoc(doc(db, "projects", projectId, "escrow", "period"));
        if (periodSnap.exists()) {
          setEscrowMonth(periodSnap.data().month || "");
        }
      } catch (e) {
        console.error("Could not load escrow month:", e);
      }
      setStatusLoading(false);
    };
    loadStatus();
  }, [projectId, historyMonth]);

  if (loading || statusLoading) {
    return (
      <Layout title="Account Summary">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400 text-sm">Loading summary...</p>
        </div>
      </Layout>
    );
  }

  const handleReviewerReject = async () => {
    if (!window.confirm("Reject and send this back to the Maker for corrections?")) return;
    setActionLoading(true);
    setActionStatus(null);
    try {
      await setEscrowStatus(projectId, ESCROW_STATUS.MAKER_INPUT, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.MAKER_INPUT);
      setActionStatus({ type: "success", message: "Sent back to Maker for corrections." });
    } catch (err) {
      setActionStatus({ type: "error", message: err.message });
    }
    setActionLoading(false);
  };

  const handleReviewerApprove = async () => {
    setActionLoading(true);
    setActionStatus(null)
    try {
      await setEscrowStatus(projectId, ESCROW_STATUS.MANAGER_APPROVAL, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.MANAGER_APPROVAL);
      setActionStatus({ type: "success", message: "Sent to Manager for final approval." });
    } catch (err) {
      setActionStatus({ type: "error", message: err.message });
    }
    setActionLoading(false);
  };

  const handleManagerReject = async () => {
    if (!window.confirm("Reject and send this back to the Maker for corrections?")) return;
    setActionLoading(true);
    setActionStatus(null);
    try {
      await setEscrowStatus(projectId, ESCROW_STATUS.MAKER_INPUT, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.MAKER_INPUT);
      setActionStatus({ type: "success", message: "Sent back to Maker for corrections." });
    } catch (err) {
      setActionStatus({ type: "error", message: err.message });
    }
    setActionLoading(false);
  };

  const handleManagerApprove = async () => {
    setActionLoading(true);
    setActionStatus(null);
    try {
      await setEscrowStatus(projectId, ESCROW_STATUS.COMPLETED, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.COMPLETED);
      setActionStatus({ type: "success", message: "Escrow analysis approved and completed!" });
    } catch (err) {
      setActionStatus({ type: "error", message: err.message });
    }
    setActionLoading(false);
  };

  const handleMakerSendToReviewer = async () => {
    setActionLoading(true);
    setActionStatus(null);
    try {
      await setEscrowStatus(projectId, ESCROW_STATUS.REVIEWER_APPROVAL, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.REVIEWER_APPROVAL);
      setActionStatus({ type: "success", message: "Sent to Reviewer for approval." });
    } catch (err) {
      setActionStatus({ type: "error", message: err.message });
    }
    setActionLoading(false);
  };

  const handleMakerCancel = () => {
    navigate("/escrow-upload?view=results");
  };

  return (
    <Layout title="Account Summary">
      <div className="max-w-full mx-auto px-8">
        <button
          onClick={() => historyMonth ? navigate("/escrow-history") : navigate("/escrow-upload?view=results")}
          className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all">
          ← Back
        </button>

        {/* Workflow Status Tracker — always visible */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <p className="text-xs font-bold text-gray-500">Approval Status</p>
            {escrowMonth && (
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
                Escrow Period: {escrowMonth}
              </span>
            )}
          </div>
          <div className="flex items-center">
            {[
              { key: ESCROW_STATUS.MANAGER_SETUP, label: "Manager" },
              { key: ESCROW_STATUS.MAKER_INPUT, label: "Maker" },
              { key: ESCROW_STATUS.REVIEWER_APPROVAL, label: "Reviewer" },
              { key: ESCROW_STATUS.MANAGER_APPROVAL, label: "Manager" },
              { key: ESCROW_STATUS.COMPLETED, label: "Completed" },
            ].map((step, idx, arr) => {
              const stepOrder = [ESCROW_STATUS.MANAGER_SETUP, ESCROW_STATUS.MAKER_INPUT, ESCROW_STATUS.REVIEWER_APPROVAL, ESCROW_STATUS.MANAGER_APPROVAL, ESCROW_STATUS.COMPLETED];
              const currentIdx = stepOrder.indexOf(workflowStatus);
              const thisIdx = stepOrder.indexOf(step.key);
              const isDone = thisIdx < currentIdx || (workflowStatus === ESCROW_STATUS.COMPLETED && thisIdx <= currentIdx);
              const isCurrent = thisIdx === currentIdx && workflowStatus !== ESCROW_STATUS.COMPLETED;
              const isLast = idx === arr.length - 1;

              return (
                <div key={step.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 font-bold text-xs
                      ${isCurrent ? "bg-blue-600 border-blue-600 text-white" :
                        isDone ? "bg-green-500 border-green-500 text-white" :
                        "bg-gray-100 border-gray-300 text-gray-400"}`}>
                      {isDone ? <CheckCircle size={16} /> : idx + 1}
                    </div>
                    <p className={`mt-2 text-xs font-semibold whitespace-nowrap
                      ${isCurrent ? "text-blue-700" : isDone ? "text-green-700" : "text-gray-400"}`}>
                      {step.label}
                    </p>
                  </div>
                  {!isLast && (
                    <div className={`flex-1 h-0.5 mx-2 mb-5 ${isDone ? "bg-green-400" : "bg-gray-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {!revealed ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Landmark size={48} className="text-indigo-300 mx-auto mb-3" />
              <h3 className="text-gray-700 font-bold text-lg mb-1">Account Summary Ready</h3>
              <p className="text-gray-400 text-sm mb-5">Click below to view the detailed account-wise breakdown.</p>
              <button onClick={() => setRevealed(true)}
                className="px-6 py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all">
                View Account Summary
              </button>
            </div>
          </div>
        ) : (
        <>
        {role === "MANAGER" && commentHistory.filter(c => c.text).length > 0 && (
          <div className="mb-6 space-y-3">
            {commentHistory.filter(c => c.text).map((c, idx) => (
              <div key={idx} className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs font-bold text-amber-700 mb-1">
                  Comment from {c.fromRole === "MAKER" ? "Maker" : c.fromRole === "REVIEWER" ? "Reviewer" : "Manager"}
                  {c.action ? ` (${c.action})` : ""}:
                </p>
                <p className="text-xs text-amber-800 whitespace-pre-wrap">{c.text}</p>
              </div>
            ))}
          </div>
        )}
        {role !== "MANAGER" && lastComment?.text && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-bold text-amber-700 mb-1">
              Comment from {lastComment.fromRole === "MAKER" ? "Maker" : lastComment.fromRole === "REVIEWER" ? "Reviewer" : "Manager"}
              {lastComment.action ? ` (${lastComment.action})` : ""}:
            </p>
            <p className="text-xs text-amber-800 whitespace-pre-wrap">{lastComment.text}</p>
          </div>
        )}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => {
  const wb = XLSX.utils.book_new();

  const colLetter = (n) => {
    let result = "";
    while (n > 0) {
      result = String.fromCharCode(((n - 1) % 26) + 65) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  };

  const fmt = (v) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  const blueHeader = { font: { bold: true, color: { rgb: "1E3A5F" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const greenHeader = { font: { bold: true, color: { rgb: "166534" } }, fill: { fgColor: { rgb: "DCFCE7" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const greenSubHeader = { font: { bold: false, color: { rgb: "15803D" } }, fill: { fgColor: { rgb: "F0FDF4" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const greenTotal = { font: { bold: true, color: { rgb: "14532D" } }, fill: { fgColor: { rgb: "DCFCE7" } }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const redHeader = { font: { bold: true, color: { rgb: "991B1B" } }, fill: { fgColor: { rgb: "FEE2E2" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const redSubHeader = { font: { bold: false, color: { rgb: "B91C1C" } }, fill: { fgColor: { rgb: "FFF1F2" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const redTotal = { font: { bold: true, color: { rgb: "7F1D1D" } }, fill: { fgColor: { rgb: "FEE2E2" } }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const blueValue = { font: { bold: true, color: { rgb: "1D4ED8" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const greenValue = { font: { bold: false, color: { rgb: "15803D" } }, fill: { fgColor: { rgb: "F0FDF4" } }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const redValue = { font: { bold: false, color: { rgb: "B91C1C" } }, fill: { fgColor: { rgb: "FFF1F2" } }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };

  accounts.forEach(acc => {
    const remarksData = remarksByAcc[acc.accNo];
    if (!remarksData) return;

    const inflow = remarksData.inflow || [];
    const outflow = remarksData.outflow || [];
    const openingBalance = remarksData.openingBalance || 0;

    const inflowGroups = {};
    for (const row of inflow) {
      const key = (row.remark || "").trim() || "Others";
      if (!inflowGroups[key]) inflowGroups[key] = 0;
      inflowGroups[key] += row.amount || 0;
    }
    const outflowGroups = {};
    for (const row of outflow) {
      const key = (row.remark || "").trim() || "Others";
      if (!outflowGroups[key]) outflowGroups[key] = 0;
      outflowGroups[key] += row.amount || 0;
    }

    const inflowKeys = Object.keys(inflowGroups);
    const outflowKeys = Object.keys(outflowGroups);
    const totalInflow = inflow.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalOutflow = outflow.reduce((sum, r) => sum + (r.amount || 0), 0);
    const closingBalance = openingBalance + totalInflow - totalOutflow;

    const inflowStartCol = 2;
    const inflowEndCol = inflowStartCol + inflowKeys.length;
    const outflowStartCol = inflowEndCol + 1;
    const outflowEndCol = outflowStartCol + outflowKeys.length;
    const closingCol = outflowEndCol + 1;

    const ws = {};

    // Row 1 — Main headings
    ws["A1"] = { v: "Opening Balance", s: blueHeader };
    ws[`${colLetter(inflowStartCol)}1`] = { v: "Inflows", s: greenHeader };
    ws[`${colLetter(outflowStartCol)}1`] = { v: "Outflows", s: redHeader };
    ws[`${colLetter(closingCol)}1`] = { v: "Closing Balance", s: blueHeader };

    for (let i = inflowStartCol + 1; i <= inflowEndCol; i++) {
      ws[`${colLetter(i)}1`] = { v: "", s: greenHeader };
    }
    for (let i = outflowStartCol + 1; i <= outflowEndCol; i++) {
      ws[`${colLetter(i)}1`] = { v: "", s: redHeader };
    }

    // Row 2 — Subheadings
    ws["A2"] = { v: "", s: blueHeader };
    inflowKeys.forEach((key, i) => {
      ws[`${colLetter(inflowStartCol + i)}2`] = { v: `↳ ${key}`, s: greenSubHeader };
    });
    ws[`${colLetter(inflowEndCol)}2`] = { v: "Total Inflows", s: greenTotal };
    outflowKeys.forEach((key, i) => {
      ws[`${colLetter(outflowStartCol + i)}2`] = { v: `↳ ${key}`, s: redSubHeader };
    });
    ws[`${colLetter(outflowEndCol)}2`] = { v: "Total Outflows", s: redTotal };
    ws[`${colLetter(closingCol)}2`] = { v: "", s: blueHeader };

    // Row 3 — Values
    ws["A3"] = { v: fmt(openingBalance), s: blueValue };
    inflowKeys.forEach((key, i) => {
      ws[`${colLetter(inflowStartCol + i)}3`] = { v: fmt(inflowGroups[key]), s: greenValue };
    });
    ws[`${colLetter(inflowEndCol)}3`] = { v: fmt(totalInflow), s: greenTotal };
    outflowKeys.forEach((key, i) => {
      ws[`${colLetter(outflowStartCol + i)}3`] = { v: fmt(outflowGroups[key]), s: redValue };
    });
    ws[`${colLetter(outflowEndCol)}3`] = { v: fmt(totalOutflow), s: redTotal };
    ws[`${colLetter(closingCol)}3`] = { v: fmt(closingBalance), s: blueValue };

    // Merges
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: inflowStartCol - 1 }, e: { r: 0, c: inflowEndCol - 1 } },
      { s: { r: 0, c: outflowStartCol - 1 }, e: { r: 0, c: outflowEndCol - 1 } },
      { s: { r: 0, c: closingCol - 1 }, e: { r: 1, c: closingCol - 1 } },
    ];

    // Column widths
    ws["!cols"] = [
      { wch: 22 },
      ...inflowKeys.map(() => ({ wch: 24 })),
      { wch: 18 },
      ...outflowKeys.map(() => ({ wch: 24 })),
      { wch: 18 },
      { wch: 22 },
    ];

    // Row heights
    ws["!rows"] = [{ hpt: 30 }, { hpt: 30 }, { hpt: 25 }];

    ws["!ref"] = `A1:${colLetter(closingCol)}3`;

    const sheetName = (acc.description || acc.accNo).slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, "Escrow_Account_Summary.xlsx");
}}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl shadow transition-all">
            <Download size={14} /> Export to Excel
          </button>
        </div>
        {accounts.map(acc => (
          <AccountSummaryCard
            key={acc.accNo}
            account={acc}
            remarksData={remarksByAcc[acc.accNo] || null}
          />
        ))}

        {actionStatus && (
          <div className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2
            ${actionStatus.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {actionStatus.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {actionStatus.message}
          </div>
        )}

        {/* Informational note — actual Reviewer/Manager actions live on the Escrow Analysis page */}
        {!historyMonth && (role === "REVIEWER" || role === "MANAGER") && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
            <Clock size={20} className="text-blue-400 flex-shrink-0" />
            <p className="text-blue-700 text-xs">
              {workflowStatus === ESCROW_STATUS.COMPLETED
                ? "This escrow analysis has been completed and approved."
                : "Click \"Escrow Analysis\" below to review the cumulative summary and take action (approve / reject)."}
            </p>
          </div>
        )}

        <button onClick={() => navigate(historyMonth ? `/escrow-cumulative-summary?month=${historyMonth}` : "/escrow-cumulative-summary")}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all mb-10">
          Escrow Analysis
        </button>
        </>
        )}
      </div>
    </Layout>
  );
}