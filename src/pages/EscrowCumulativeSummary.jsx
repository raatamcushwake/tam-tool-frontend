import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import Layout from "../components/common/Layout";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, getEscrowStatus, setEscrowStatus, ESCROW_STATUS, archiveAndResetEscrow, getEscrowHistoryMonth, ensureActiveHistoryEntry, markActiveHistoryRejected } from "../services/escrow";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Download, XCircle, Send, CheckCircle, RefreshCw, Clock } from "lucide-react";
import * as XLSX from "xlsx-js-style";

export default function EscrowCumulativeSummary() {
  const { userProfile } = useAuth();
  const { selectedProject } = useProject();
  const projectId = selectedProject?.projectId;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [inflowGroups, setInflowGroups] = useState({});
  const [outflowGroups, setOutflowGroups] = useState({});
  const [balanceRows, setBalanceRows] = useState([]);

  const [workflowStatus, setWorkflowStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [comment, setComment] = useState("");
  const [lastComment, setLastComment] = useState(null);
  const [commentHistory, setCommentHistory] = useState([]);
  const [escrowMonth, setEscrowMonth] = useState("");
  const [searchParams] = useSearchParams();
  const historyMonth = searchParams.get("month");

  const role = userProfile?.projectRoles?.find(r => r.projectId === projectId)?.role;
  if (!["MANAGER", "MAKER", "REVIEWER"].includes(role)) {
    return (
      <Layout title="Escrow Analysis">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
            <h3 className="text-gray-700 font-bold text-lg">Access Denied</h3>
            <p className="text-gray-400 text-sm mt-1">Only Managers and Makers can access Escrow Analysis.</p>
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
          // Read-only mode — load an archived, completed month's snapshot
          const snap = await getEscrowHistoryMonth(projectId, historyMonth);
          if (!snap) { setLoading(false); return; }

          const accountsList = Object.keys(snap.accounts || {}).map(accNo => ({ accNo }));
          let totalOpening = 0;
          const combinedInflowGroups = {};
          const combinedOutflowGroups = {};
          (snap.globalInflowRemarks || []).forEach(r => { combinedInflowGroups[r] = 0; });
          (snap.globalOutflowRemarks || []).forEach(r => { combinedOutflowGroups[r] = 0; });
          let totalPaymentReversal = 0;

          for (const accNo of Object.keys(snap.accounts || {})) {
            const remarksData = snap.remarksByAcc?.[accNo];
            if (!remarksData) continue;
            totalOpening += remarksData.openingBalance || 0;
            const inflow = remarksData.inflow || [];
            const outflow = remarksData.outflow || [];

            for (const row of inflow) {
              const key = (row.remark || "").trim();
              if (!key) continue;
              if (key.startsWith("Received from") || key.startsWith("Transferred to")) continue;
              if (key.toLowerCase() === "payment reversal") { totalPaymentReversal += row.amount || 0; continue; }
              if (!combinedInflowGroups[key]) combinedInflowGroups[key] = 0;
              combinedInflowGroups[key] += row.amount || 0;
            }
            for (const row of outflow) {
              const key = (row.remark || "").trim();
              if (!key) continue;
              if (key.startsWith("Received from") || key.startsWith("Transferred to")) continue;
              if (!combinedOutflowGroups[key]) combinedOutflowGroups[key] = 0;
              combinedOutflowGroups[key] += row.amount || 0;
            }
          }
          for (const key of Object.keys(combinedOutflowGroups)) {
            if (key.toLowerCase() === "vendor payment") combinedOutflowGroups[key] -= totalPaymentReversal;
          }

          setOpeningBalance(totalOpening);
          setInflowGroups(combinedInflowGroups);
          setOutflowGroups(combinedOutflowGroups);

          const balanceTable = [];
          for (const accNo of Object.keys(snap.accounts || {})) {
            const remarksData = snap.remarksByAcc?.[accNo];
            if (!remarksData) continue;
            balanceTable.push({
              accNo,
              accountName: snap.accounts[accNo]?.accountName || "",
              description: snap.accountDescriptions?.[accNo] || "",
              balanceAsOf: remarksData.balanceAsOf || "",
              closingBalance: remarksData.closingBalance || 0,
            });
          }
          setBalanceRows(balanceTable);
          setLoading(false);
          return;
        }

        // Load accounts config
        const accSnap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
        if (!accSnap.exists()) {
          setLoading(false);
          return;
        }

        const accData = accSnap.data();
        const accountsMap = accData.accounts || {};
        const accountDescriptions = accData.accountDescriptions || {};
        const accountsList = Object.keys(accountsMap).map(accNo => ({ accNo }));

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

// Load manager's pre-defined remark lists from the accounts config
        const accConfigSnap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
        const accConfig = accConfigSnap.exists() ? accConfigSnap.data() : {};
        const predefinedInflowRemarks = accConfig.globalInflowRemarks || [];
        const predefinedOutflowRemarks = accConfig.globalOutflowRemarks || [];

        // Cumulative opening balance across all accounts
        let totalOpening = 0;

        // Initialize groups with 0 for every pre-defined remark
        const combinedInflowGroups = {};
        const combinedOutflowGroups = {};
        predefinedInflowRemarks.forEach(r => { combinedInflowGroups[r] = 0; });
        predefinedOutflowRemarks.forEach(r => { combinedOutflowGroups[r] = 0; });
        let totalPaymentReversal = 0;

        for (const acc of accountsList) {
          const remarksData = accRemarks[acc.accNo];
          if (!remarksData) continue;

          totalOpening += remarksData.openingBalance || 0;

          const inflow = remarksData.inflow || [];
          const outflow = remarksData.outflow || [];

          // Only group transactions that have a non-empty remark.
          // Transactions with no remark are excluded entirely.
          for (const row of inflow) {
  const key = (row.remark || "").trim();
  if (!key) continue;
  if (key.startsWith("Received from") || key.startsWith("Transferred to")) continue;
  if (key.toLowerCase() === "payment reversal") {
    totalPaymentReversal += row.amount || 0;
    continue; // exclude Payment Reversal from showing in cumulative inflow groups
  }
  if (!combinedInflowGroups[key]) combinedInflowGroups[key] = 0;
  combinedInflowGroups[key] += row.amount || 0;
}
for (const row of outflow) {
  const key = (row.remark || "").trim();
  if (!key) continue;
  if (key.startsWith("Received from") || key.startsWith("Transferred to")) continue;
  if (!combinedOutflowGroups[key]) combinedOutflowGroups[key] = 0;
  combinedOutflowGroups[key] += row.amount || 0;
}
        }

        // Always subtract total Payment Reversal amount from vendor payment outflow
        for (const key of Object.keys(combinedOutflowGroups)) {
          if (key.toLowerCase() === "vendor payment") {
            combinedOutflowGroups[key] -= totalPaymentReversal;
          }
        }

        setOpeningBalance(totalOpening);
        setInflowGroups(combinedInflowGroups);
        setOutflowGroups(combinedOutflowGroups);

        // Build balance rows for the new table
        const balanceTable = [];
        for (const acc of accountsList) {
          const remarksData = accRemarks[acc.accNo];
          const accConfig = accountsMap[acc.accNo];
          const accDesc = accountDescriptions[acc.accNo] || "";
          if (!remarksData) continue;
          balanceTable.push({
            accNo: acc.accNo,
            accountName: accConfig?.accountName || "",
            description: accDesc,
            balanceAsOf: remarksData.balanceAsOf || "",
            closingBalance: remarksData.closingBalance || 0,
          });
        }
        setBalanceRows(balanceTable);

      } catch (e) {
        console.error("Error loading cumulative summary:", e);
      }
      setLoading(false);
    };

    if (projectId) fetchData();
  }, [projectId]);

  useEffect(() => {
    const loadStatus = async () => {
      if (!projectId) return;
      setStatusLoading(true);
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
  }, [projectId]);

  const saveComment = async (fromRole, action) => {
    try {
      const entry = {
        text: comment.trim(),
        fromRole,
        action,
        updatedAt: new Date().toISOString(),
      };
      // Keep a running history of every comment across the whole cycle,
      // instead of overwriting — so Manager can see both Maker's and
      // Reviewer's remarks, not just the most recent one.
      const existingSnap = await getDoc(doc(db, "projects", projectId, "escrow", "workflowComment"));
      const existingHistory = existingSnap.exists() ? (existingSnap.data().history || []) : [];
      await setDoc(doc(db, "projects", projectId, "escrow", "workflowComment"), {
        ...entry, // keep top-level fields for backward compatibility with any old reads
        history: [...existingHistory, entry],
      });
    } catch (e) {
      console.error("Could not save comment:", e);
    }
  };

  const handleReviewerReject = async () => {
    if (!window.confirm("Reject and send this back to the Maker for corrections?")) return;
    setActionLoading(true);
    setActionStatus(null);
    try {
      await saveComment("REVIEWER", "Rejected — sent back to Maker");
      await markActiveHistoryRejected(projectId, "REVIEWER");
      await setEscrowStatus(projectId, ESCROW_STATUS.MAKER_INPUT, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.MAKER_INPUT);
      setActionStatus({ type: "success", message: "Sent back to Maker for corrections." });
      setComment("");
    } catch (err) {
      setActionStatus({ type: "error", message: err.message });
    }
    setActionLoading(false);
  };

  const handleReviewerApprove = async () => {
    setActionLoading(true);
    setActionStatus(null);
    try {
      await saveComment("REVIEWER", "Sent to Manager");
      await setEscrowStatus(projectId, ESCROW_STATUS.MANAGER_APPROVAL, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.MANAGER_APPROVAL);
      setActionStatus({ type: "success", message: "Sent to Manager for final approval." });
      setComment("");
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
      await saveComment("MANAGER", "Rejected — sent back to Maker");
      await markActiveHistoryRejected(projectId, "MANAGER");
      await setEscrowStatus(projectId, ESCROW_STATUS.MAKER_INPUT, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.MAKER_INPUT);
      setActionStatus({ type: "success", message: "Sent back to Maker for corrections." });
      setComment("");
    } catch (err) {
      setActionStatus({ type: "error", message: err.message });
    }
    setActionLoading(false);
  };

  const handleManagerApprove = async () => {
    setActionLoading(true);
    setActionStatus(null);
    try {
      await saveComment("MANAGER", "Approved — Completed");
      await setEscrowStatus(projectId, ESCROW_STATUS.COMPLETED, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.COMPLETED);

      const monthKeyToArchive = escrowMonth || `UNTITLED_${Date.now()}`;
      await archiveAndResetEscrow(projectId, monthKeyToArchive);

      setActionStatus({ type: "success", message: "Escrow analysis approved, completed, and archived to History!" });
      setComment("");
      setTimeout(() => navigate("/escrow-history"), 1200);
    } catch (err) {
      setActionStatus({ type: "error", message: err.message });
    }
    setActionLoading(false);
  };

  const handleMakerSendToReviewer = async () => {
    setActionLoading(true);
    setActionStatus(null);
    try {
      await saveComment("MAKER", "Sent to Reviewer");
      await ensureActiveHistoryEntry(projectId);
      await setEscrowStatus(projectId, ESCROW_STATUS.REVIEWER_APPROVAL, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.REVIEWER_APPROVAL);
      setActionStatus({ type: "success", message: "Sent to Reviewer for approval." });
      setComment("");
    } catch (err) {
      setActionStatus({ type: "error", message: err.message });
    }
    setActionLoading(false);
  };

  const handleMakerCancel = () => {
    navigate("/escrow-upload?view=results");
  };

  if (loading || statusLoading) {
    return (
      <Layout title="Escrow Analysis">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400 text-sm">Loading cumulative summary...</p>
        </div>
      </Layout>
    );
  }

  const inflowKeys = Object.keys(inflowGroups);
  const outflowKeys = Object.keys(outflowGroups);
  const totalInflow = inflowKeys.reduce((sum, k) => sum + inflowGroups[k], 0);
  const totalOutflow = outflowKeys.reduce((sum, k) => sum + outflowGroups[k], 0);
  const closingBalance = openingBalance + totalInflow - totalOutflow;

  const fmt = (val) => val.toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const isMyTurn =
    (role === "MAKER" && workflowStatus === ESCROW_STATUS.MAKER_INPUT) ||
    (role === "REVIEWER" && workflowStatus === ESCROW_STATUS.REVIEWER_APPROVAL) ||
    (role === "MANAGER" && workflowStatus === ESCROW_STATUS.MANAGER_APPROVAL);

  const canView = historyMonth || isMyTurn || workflowStatus === ESCROW_STATUS.COMPLETED || revealed;

  return (
    <Layout title="Escrow Analysis">
      <div className="max-w-full mx-auto px-8">

        {/* Workflow Status Tracker — visible to Maker, Reviewer, and Manager at all times */}
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
              const isDone = thisIdx < currentIdx || workflowStatus === ESCROW_STATUS.COMPLETED && thisIdx <= currentIdx;
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
          {workflowStatus === ESCROW_STATUS.MAKER_INPUT && (
            <p className="text-xs text-gray-400 mt-4">Currently with Maker — filling in / correcting details.</p>
          )}
          {workflowStatus === ESCROW_STATUS.REVIEWER_APPROVAL && (
            <p className="text-xs text-gray-400 mt-4">Currently with Reviewer — awaiting review.</p>
          )}
          {workflowStatus === ESCROW_STATUS.MANAGER_APPROVAL && (
            <p className="text-xs text-gray-400 mt-4">Currently with Manager — awaiting final approval.</p>
          )}
          {workflowStatus === ESCROW_STATUS.COMPLETED && (
            <p className="text-xs text-green-600 mt-4 font-semibold">Completed and approved.</p>
          )}
        </div>

        {/* Comment history — Manager sees the full trail (Maker's + Reviewer's remarks),
            everyone else just sees the most recent comment relevant to their turn. */}
        {isMyTurn && role === "MANAGER" && commentHistory.filter(c => c.text).length > 0 && (
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
        {isMyTurn && role !== "MANAGER" && lastComment?.text && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-bold text-amber-700 mb-1">
              Comment from {lastComment.fromRole === "MAKER" ? "Maker" : lastComment.fromRole === "REVIEWER" ? "Reviewer" : "Manager"}
              {lastComment.action ? ` (${lastComment.action})` : ""}:
            </p>
            <p className="text-xs text-amber-800 whitespace-pre-wrap">{lastComment.text}</p>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all">
            ← Back
          </button>
          {canView && (
          <button
            onClick={() => {
  const wb = XLSX.utils.book_new();
  const ws = {};

  const colLetter = (n) => {
    let result = "";
    while (n > 0) {
      result = String.fromCharCode(((n - 1) % 26) + 65) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  };

  const fmt = (v) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  const inflowStartCol = 2;
  const inflowEndCol = inflowStartCol + inflowKeys.length;
  const outflowStartCol = inflowEndCol + 1;
  const outflowEndCol = outflowStartCol + outflowKeys.length;
  const closingCol = outflowEndCol + 1;

  // Styles
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

  // Row 1 — Main headings
  ws["A1"] = { v: "Opening Balance", s: blueHeader };
  ws[`${colLetter(inflowStartCol)}1`] = { v: "Inflows", s: greenHeader };
  ws[`${colLetter(outflowStartCol)}1`] = { v: "Outflows", s: redHeader };
  ws[`${colLetter(closingCol)}1`] = { v: "Closing Balance", s: blueHeader };

  // Fill merged inflow header cells
  for (let i = inflowStartCol + 1; i <= inflowEndCol; i++) {
    ws[`${colLetter(i)}1`] = { v: "", s: greenHeader };
  }
  // Fill merged outflow header cells
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

  XLSX.utils.book_append_sheet(wb, ws, "Cumulative Summary");

  // Account Balance Summary sheet
  if (balanceRows.length > 0) {
    const ws2 = {};

    const balHeaderStyle = { font: { bold: true, color: { rgb: "1E3A5F" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
    const balCellStyle = { font: { color: { rgb: "374151" } }, fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "left", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
    const balAmtStyle = { font: { bold: true, color: { rgb: "1D4ED8" } }, fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "right", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
    const balTotalStyle = { font: { bold: true, color: { rgb: "1E3A5F" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "right", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
    const balTotalLabelStyle = { font: { bold: true, color: { rgb: "1E3A5F" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "left", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };

    // Headers
    const balHeaders = ["Account No.", "Account Name", "Description", "Balance As Of", "Closing Balance (₹)"];
    balHeaders.forEach((h, i) => {
      ws2[`${String.fromCharCode(65 + i)}1`] = { v: h, s: balHeaderStyle };
    });

    // Data rows
    balanceRows.forEach((row, idx) => {
      const r = idx + 2;
      ws2[`A${r}`] = { v: row.accNo, s: balCellStyle };
      ws2[`B${r}`] = { v: row.accountName, s: balCellStyle };
      ws2[`C${r}`] = { v: row.description, s: balCellStyle };
      ws2[`D${r}`] = { v: row.balanceAsOf, s: { ...balCellStyle, alignment: { horizontal: "center" } } };
      ws2[`E${r}`] = { v: fmt(row.closingBalance), s: balAmtStyle };
    });

    // Total row
    const totalRow = balanceRows.length + 2;
    ws2[`A${totalRow}`] = { v: "Total", s: balTotalLabelStyle };
    ws2[`B${totalRow}`] = { v: "", s: balTotalLabelStyle };
    ws2[`C${totalRow}`] = { v: "", s: balTotalLabelStyle };
    ws2[`D${totalRow}`] = { v: "", s: balTotalLabelStyle };
    ws2[`E${totalRow}`] = { v: fmt(balanceRows.reduce((sum, r) => sum + r.closingBalance, 0)), s: balTotalStyle };

    ws2["!cols"] = [
      { wch: 20 },
      { wch: 45 },
      { wch: 25 },
      { wch: 22 },
      { wch: 22 },
    ];
    ws2["!rows"] = [{ hpt: 25 }];
    ws2["!ref"] = `A1:E${totalRow}`;

    XLSX.utils.book_append_sheet(wb, ws2, "Account Balance Summary");
  }

  XLSX.writeFile(wb, "Escrow_Cumulative_Summary.xlsx");
}}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl shadow transition-all">
            <Download size={14} /> Export to Excel
          </button>
          )}
        </div>

        {canView && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
          <div className="mb-6 pb-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 text-base">Cumulative Escrow Summary — All Accounts</h3>
            <p className="text-gray-400 text-xs">Combined totals across every uploaded bank statement</p>
          </div>

          {inflowKeys.length === 0 && outflowKeys.length === 0 ? (
            <p className="text-gray-400 text-sm py-6 text-center">
              No remarked transactions found yet. Add remarks on the Escrow Upload page first.
            </p>
          ) : (
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              <table className="text-xs border-collapse" style={{ minWidth: '900px', width: '100%' }}>
                <thead>
                  <tr>
                    <th rowSpan={2}
                      className="p-3 text-center font-bold text-gray-700 bg-blue-50 border border-gray-200 whitespace-nowrap align-middle">
                      Opening Balance
                    </th>

                    <th colSpan={inflowKeys.length + 1}
                      className="p-2 text-center font-bold text-green-800 bg-green-100 border border-gray-200">
                      Inflows
                    </th>

                    <th colSpan={outflowKeys.length + 1}
                      className="p-2 text-center font-bold text-red-800 bg-red-100 border border-gray-200">
                      Outflows
                    </th>

                    <th rowSpan={2}
                      className="p-3 text-center font-bold text-gray-700 bg-blue-50 border border-gray-200 whitespace-nowrap align-middle">
                      Closing Balance
                    </th>
                  </tr>

                  <tr>
                    {inflowKeys.map(key => (
                      <th key={key}
                        className="p-3 text-center font-semibold text-green-700 bg-green-50 border border-gray-200 whitespace-nowrap">
                        ↳ {key}
                      </th>
                    ))}
                    <th className="p-3 text-center font-bold text-green-800 bg-green-100 border border-gray-200 whitespace-nowrap">
                      Total Inflows
                    </th>

                    {outflowKeys.map(key => (
                      <th key={key}
                        className="p-3 text-center font-semibold text-red-700 bg-red-50 border border-gray-200 whitespace-nowrap">
                        ↳ {key}
                      </th>
                    ))}
                    <th className="p-3 text-center font-bold text-red-800 bg-red-100 border border-gray-200 whitespace-nowrap">
                      Total Outflows
                    </th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td className="p-3 text-center font-bold text-blue-700 bg-blue-50 border border-gray-200 whitespace-nowrap">
                      ₹{fmt(openingBalance)}
                    </td>

                    {inflowKeys.map(key => (
                      <td key={key}
                        className="p-3 text-center text-green-700 bg-green-50 border border-gray-200 whitespace-nowrap">
                        ₹{fmt(inflowGroups[key])}
                      </td>
                    ))}
                    <td className="p-3 text-center font-bold text-green-800 bg-green-100 border border-gray-200 whitespace-nowrap">
                      ₹{fmt(totalInflow)}
                    </td>

                    {outflowKeys.map(key => (
                      <td key={key}
                        className="p-3 text-center text-red-700 bg-red-50 border border-gray-200 whitespace-nowrap">
                        ₹{fmt(outflowGroups[key])}
                      </td>
                    ))}
                    <td className="p-3 text-center font-bold text-red-800 bg-red-100 border border-gray-200 whitespace-nowrap">
                      ₹{fmt(totalOutflow)}
                    </td>

                    <td className="p-3 text-center font-bold text-blue-700 bg-blue-50 border border-gray-200 whitespace-nowrap">
                      ₹{fmt(closingBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* Balance As Of Table */}
        {canView && balanceRows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
            <div className="mb-4 pb-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-base">Account Balance Summary</h3>
              <p className="text-gray-400 text-xs">Closing balance as of last transaction date per account</p>
            </div>
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-blue-50">
                    <th className="p-3 text-left font-bold text-blue-800 border border-gray-200 whitespace-nowrap">Account No.</th>
                    <th className="p-3 text-left font-bold text-blue-800 border border-gray-200">Account Name</th>
                    <th className="p-3 text-left font-bold text-blue-800 border border-gray-200">Description</th>
                    <th className="p-3 text-center font-bold text-blue-800 border border-gray-200 whitespace-nowrap">Balance As Of</th>
                    <th className="p-3 text-right font-bold text-blue-800 border border-gray-200 whitespace-nowrap">Closing Balance (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceRows.map((row, index) => (
                    <tr key={index} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-gray-700 border border-gray-200 whitespace-nowrap">{row.accNo}</td>
                      <td className="p-3 text-gray-700 border border-gray-200">{row.accountName}</td>
                      <td className="p-3 text-gray-700 border border-gray-200">{row.description}</td>
                      <td className="p-3 text-center text-gray-700 border border-gray-200 whitespace-nowrap">{row.balanceAsOf}</td>
                      <td className="p-3 text-right font-bold text-blue-700 border border-gray-200 whitespace-nowrap">
                        ₹{row.closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 border-t-2 border-blue-200">
                    <td colSpan={4} className="p-3 font-bold text-blue-800 border border-gray-200">Total</td>
                    <td className="p-3 text-right font-bold text-blue-800 border border-gray-200 whitespace-nowrap">
                      ₹{balanceRows.reduce((sum, r) => sum + r.closingBalance, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {actionStatus && (
          <div className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2
            ${actionStatus.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {actionStatus.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {actionStatus.message}
          </div>
        )}

        {/* Maker actions — only while it's actually the Maker's turn, reviewed here on the final summary */}
        {!historyMonth && role === "MAKER" && workflowStatus === ESCROW_STATUS.MAKER_INPUT && (
          <>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 mb-1 block">Add a comment (optional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add any note for the Reviewer..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
          <div className="flex gap-3 mb-6">
            <button onClick={handleMakerCancel} disabled={actionLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
                ${!actionLoading ? "bg-gray-200 hover:bg-gray-300 text-gray-700 shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              <XCircle size={14} /> Cancel — Edit Details
            </button>
            <button onClick={handleMakerSendToReviewer} disabled={actionLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
                ${!actionLoading ? "bg-green-600 hover:bg-green-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />} Send to Reviewer
            </button>
          </div>
          </>
        )}

        {/* Reviewer actions — only while it's actually the Reviewer's turn */}
        {!historyMonth && role === "REVIEWER" && workflowStatus === ESCROW_STATUS.REVIEWER_APPROVAL && (
          <>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 mb-1 block">Add a comment (optional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add any note for the Maker or Manager..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
          <div className="flex gap-3 mb-6">
            <button onClick={handleReviewerReject} disabled={actionLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
                ${!actionLoading ? "bg-red-600 hover:bg-red-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <XCircle size={14} />} Reject — Send to Maker
            </button>
            <button onClick={handleReviewerApprove} disabled={actionLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
                ${!actionLoading ? "bg-green-600 hover:bg-green-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />} Send to Manager
            </button>
          </div>
          </>
        )}

        {/* Manager final-approval actions — only while it's actually the Manager's turn */}
        {!historyMonth && role === "MANAGER" && workflowStatus === ESCROW_STATUS.MANAGER_APPROVAL && (
          <>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 mb-1 block">Add a comment (optional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add any note for the Maker..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
          <div className="flex gap-3 mb-6">
            <button onClick={handleManagerReject} disabled={actionLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
                ${!actionLoading ? "bg-red-600 hover:bg-red-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <XCircle size={14} />} Reject — Send to Maker
            </button>
            <button onClick={handleManagerApprove} disabled={actionLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
                ${!actionLoading ? "bg-green-600 hover:bg-green-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />} Approve — Complete
            </button>
          </div>
          </>
        )}

        {/* Informational banner for anyone viewing outside their own action window */}
        {!historyMonth && !canView && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Clock size={20} className="text-blue-400 flex-shrink-0" />
              <p className="text-blue-700 text-xs">
                {workflowStatus === ESCROW_STATUS.MANAGER_APPROVAL && role === "REVIEWER" && "You've sent this to the Manager for final approval."}
                {workflowStatus === ESCROW_STATUS.MAKER_INPUT && role !== "MAKER" && "This was sent back to the Maker for corrections."}
                {workflowStatus === ESCROW_STATUS.REVIEWER_APPROVAL && role === "MANAGER" && "This is currently with the Reviewer — it'll appear here for your approval once they send it forward."}
                {workflowStatus === ESCROW_STATUS.REVIEWER_APPROVAL && role === "MAKER" && "You've submitted this — it's currently with the Reviewer for approval."}
                {workflowStatus === ESCROW_STATUS.MANAGER_APPROVAL && role === "MAKER" && "You've submitted this — it's now with the Manager for final approval."}
              </p>
            </div>
            <button onClick={() => setRevealed(true)}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap">
              View Submitted Data
            </button>
          </div>
        )}

      </div>
    </Layout>
  );
}