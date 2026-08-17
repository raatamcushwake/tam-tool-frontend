import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import Layout from "../components/common/Layout";
import { FileText, Upload, X, CheckCircle, AlertCircle, RefreshCw, BarChart3, Landmark, FileSpreadsheet, Clock } from "lucide-react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs, deleteDoc } from "firebase/firestore";
import { db, storage, getEscrowStatus, setEscrowStatus, ESCROW_STATUS, getEscrowHistoryList, updateActiveHistoryMonth, getEscrowHistoryMonth } from "../services/escrow";
import * as XLSX from "xlsx-js-style";
import { useNavigate, useSearchParams } from "react-router-dom";

function TransactionTable({ title, data, type, color, accountInfo, onUpdateRemark, dropdownOptions = [], readOnly = false, showReviewerColumn = false, reviewerEditable = false, onUpdateReviewerRemark = () => {}, currentRole = "" }) {
  const [filter, setFilter] = useState("all");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [showTransactions, setShowTransactions] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]); // array of original indices
  const [bulkRemarkOpen, setBulkRemarkOpen] = useState(false);
  const [bulkRemarkText, setBulkRemarkText] = useState("");

  const toggleRowSelect = (originalIndex) => {
    setSelectedRows(prev =>
      prev.includes(originalIndex) ? prev.filter(i => i !== originalIndex) : [...prev, originalIndex]
    );
  };

  const applyBulkRemark = () => {
    selectedRows.forEach(idx => onUpdateRemark(type, idx, bulkRemarkText));
    setSelectedRows([]);
    setBulkRemarkText("");
    setBulkRemarkOpen(false);
  };
  const clearAllRemarks = () => {
    const confirmed = window.confirm("Are you sure you want to clear all remarks in this table?");
    if (!confirmed) return;
    data.forEach((_, idx) => onUpdateRemark(type, idx, ""));
  };

  const filteredData = data.filter(row => {
    if (filter === "all") return true;
    if (filter === "allowed") return row.category === "green";
    if (filter === "other") return row.category === "red";
    if (filter === "reversal") return row.category === "reversal";
    return true;
  });

  const allVisibleSelected = filteredData.length > 0 && filteredData.every(row => selectedRows.includes(data.indexOf(row)));

  const toggleSelectAll = () => {
    const visibleIndices = filteredData.map(row => data.indexOf(row));
    if (allVisibleSelected) {
      setSelectedRows(prev => prev.filter(i => !visibleIndices.includes(i)));
    } else {
      setSelectedRows(prev => [...new Set([...prev, ...visibleIndices])]);
    }
  };

  const filterButtons = [
    { key: "all", label: "All" },
    { key: "allowed", label: type === "inflow" ? "Allowed Inflows" : "Allowed Outflows" },
    { key: "other", label: type === "inflow" ? "Other Inflows" : "Other Outflows" },
    { key: "reversal", label: "Reversal" },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">

      {/* Title row + Filter buttons side by side */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h4 className={`font-bold text-base ${color}`}>{title}</h4>

        <div className="flex items-center gap-2 flex-wrap">
        <button
            onClick={() => setShowTransactions(prev => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5
              ${showTransactions ? "bg-gray-700 text-white border-gray-700" : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200"}`}>
            {showTransactions ? "▲ Hide Transactions" : "▼ Show Transactions"}
          </button>
        {/* Filter buttons — positioned in the red box area (top right) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterButtons.map(btn => {
            const isActive = filter === btn.key;

            // Count per filter
            const count = data.filter(row => {
              if (btn.key === "all") return true;
              if (btn.key === "allowed") return row.category === "green";
              if (btn.key === "other") return row.category === "red";
              if (btn.key === "reversal") return row.category === "reversal";
              return true;
            }).length;

            // Active color per filter type
            let activeClass = "bg-blue-600 text-white border-blue-600";
            if (btn.key === "allowed") activeClass = "bg-green-600 text-white border-green-600";
            if (btn.key === "other") activeClass = "bg-red-500 text-white border-red-500";
            if (btn.key === "reversal") activeClass = "bg-red-800 text-white border-red-800";

            return (
              <button
                key={btn.key}
                onClick={() => setFilter(btn.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5
                  ${isActive ? activeClass : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}
              >
                {btn.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold
                  ${isActive ? "bg-white bg-opacity-25 text-white" : "bg-gray-200 text-gray-600"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        </div>
      </div>
      {/* Legend + Clear All Remarks */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-200 border border-green-400 inline-block"></span>
            <span className="text-gray-500">Matched allowed account</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-200 border border-red-400 inline-block"></span>
            <span className="text-gray-500">Other {type === "inflow" ? "Inflow" : "Outflow"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-400 border border-red-700 inline-block"></span>
            <span className="text-gray-500">Reversal entry</span>
          </div>
        </div>
        {!readOnly && (
        <button
          onClick={clearAllRemarks}
          className="text-xs font-bold text-gray-500 hover:text-red-600 border border-gray-300 hover:border-red-300 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap">
          Clear All Remarks
        </button>
        )}
      </div>

      {/* Bulk remark controls */}
      {!readOnly && selectedRows.length > 0 && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-blue-700">{selectedRows.length} selected</span>
          {!bulkRemarkOpen ? (
            <button
              onClick={() => setBulkRemarkOpen(true)}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">
              Apply Remark to Selected
            </button>
          ) : (
            <>
              {dropdownOptions.length > 0 ? (
                <select
                  value={bulkRemarkText}
                  onChange={(e) => setBulkRemarkText(e.target.value)}
                  className="flex-1 min-w-[200px] border border-blue-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                >
                  <option value="">Select remark...</option>
                  {dropdownOptions.map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={bulkRemarkText}
                  onChange={(e) => setBulkRemarkText(e.target.value)}
                  placeholder="Type remark for all selected..."
                  className="flex-1 min-w-[200px] border border-blue-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                />
              )}
              <button
                onClick={applyBulkRemark}
                disabled={!bulkRemarkText.trim()}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg
                  ${bulkRemarkText.trim() ? "bg-green-600 hover:bg-green-700 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
                Apply
              </button>
              <button
                onClick={() => { setBulkRemarkOpen(false); setBulkRemarkText(""); }}
                className="text-xs font-medium text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </>
          )}
          <button
            onClick={() => setSelectedRows([])}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 ml-auto">
            Clear selection
          </button>
        </div>
      )}

      {showTransactions && filteredData.length === 0 ? (
        <p className="text-gray-400 text-xs py-4 text-center">
          No {filter === "all" ? "" : filter} transactions found.
        </p>
      ) : showTransactions ? (
        <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
          <table className="text-sm" style={{ minWidth: '1100px', width: '100%' }}>
            <thead>
              <tr className="bg-gray-50 rounded-xl">
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 cursor-pointer"
                  />
                </th>
                <th className="text-left p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Transaction Date</th>
                <th className="text-left p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Acc Number</th>
                <th className="text-left p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Acc Name</th>
                <th className="text-left p-3 text-gray-600 font-bold text-xs">Description</th>
                <th className="text-left p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Reference No.</th>
                <th className="text-right p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Amount (₹)</th>
                <th className="text-left p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Remark</th>
                {showReviewerColumn && (
                  <th className="text-left p-3 text-gray-600 font-bold text-xs whitespace-nowrap bg-blue-50">Comments</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, index) => {
                // Find original index for remark update (must use original data index)
                const originalIndex = data.indexOf(row);

                let rowBg;
                if (row.category === "reversal") {
                  rowBg = "bg-red-200 border-red-500";
                } else if (row.category === "green") {
                  rowBg = "bg-green-50 border-green-200";
                } else {
                  rowBg = "bg-red-50 border-red-200";
                }
                return (
                  <tr key={index} className={`border-t ${rowBg}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(originalIndex)}
                        onChange={() => toggleRowSelect(originalIndex)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="p-3 text-gray-700 text-xs whitespace-nowrap">{row.transactionDate}</td>
                    <td className="p-3 text-gray-700 text-xs whitespace-nowrap">{accountInfo.number}</td>
                    <td className="p-3 text-gray-700 text-xs whitespace-nowrap">{accountInfo.name}</td>
                    <td className="p-3 text-gray-700 text-xs">{row.description}</td>
                    <td className="p-3 text-gray-700 text-xs whitespace-nowrap">{row.referenceNo}</td>
                    <td className="p-3 text-right text-gray-700 text-xs font-medium whitespace-nowrap">
                      {row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3" style={{ minWidth: '160px' }}>
                      {dropdownOptions.length > 0 ? (
                        <select
                          value={row.remark}
                          onChange={(e) => onUpdateRemark(type, originalIndex, e.target.value)}
                          disabled={row.category === "reversal" || readOnly}
                          className={`w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white ${(row.category === "reversal" || readOnly) ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          <option value="">Select remark...</option>
                          {row.remark && !dropdownOptions.includes(row.remark) && (
                            <option value={row.remark}>{row.remark}</option>
                          )}
                          {dropdownOptions.map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={row.remark}
                          onChange={(e) => onUpdateRemark(type, originalIndex, e.target.value)}
                          placeholder="Add remark..."
                          disabled={row.category === "reversal" || readOnly}
                          className={`w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white ${(row.category === "reversal" || readOnly) ? "opacity-60 cursor-not-allowed" : ""}`}
                        />
                      )}
                    </td>
                    {showReviewerColumn && (
                      <td className="p-3 bg-blue-50" style={{ minWidth: '220px' }}>
                        <p className="text-xs text-blue-700 whitespace-pre-wrap mb-2">
                          {row.reviewerRemark || <span className="text-gray-300 italic">No comments yet</span>}
                        </p>
                        {reviewerEditable && (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={commentDrafts[originalIndex] || ""}
                              onChange={(e) => setCommentDrafts(prev => ({ ...prev, [originalIndex]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && commentDrafts[originalIndex]?.trim()) {
                                  const roleLabel = currentRole === "MANAGER" ? "Manager" : currentRole === "REVIEWER" ? "Reviewer" : "Maker";
                                  const entry = `${roleLabel}-\n${commentDrafts[originalIndex].trim()}`;
                                  const updated = row.reviewerRemark ? `${row.reviewerRemark}\n\n${entry}` : entry;
                                  onUpdateReviewerRemark(type, originalIndex, updated);
                                  setCommentDrafts(prev => ({ ...prev, [originalIndex]: "" }));
                                }
                              }}
                              placeholder="Add a comment..."
                              className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                            />
                            <button
                              onClick={() => {
                                if (!commentDrafts[originalIndex]?.trim()) return;
                                const roleLabel = currentRole === "MANAGER" ? "Manager" : currentRole === "REVIEWER" ? "Reviewer" : "Maker";
                                const entry = `${roleLabel}-\n${commentDrafts[originalIndex].trim()}`;
                                const updated = row.reviewerRemark ? `${row.reviewerRemark}\n\n${entry}` : entry;
                                onUpdateReviewerRemark(type, originalIndex, updated);
                                setCommentDrafts(prev => ({ ...prev, [originalIndex]: "" }));
                              }}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg whitespace-nowrap">
                              Add
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={6} className="p-3 text-gray-700 font-bold text-xs">
                  Total {filter !== "all" ? `(${filterButtons.find(b => b.key === filter)?.label})` : ""}
                </td>
                <td className="p-3 text-right font-bold text-xs text-gray-800 whitespace-nowrap">
                  ₹{filteredData.reduce((sum, r) => sum + r.amount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td></td>
                {showReviewerColumn && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function AccountSection({ account, result, onUpdateRemark, inflowDropdownOptions, outflowDropdownOptions, readOnly = false, showReviewerColumn = false, reviewerEditable = false, onUpdateReviewerRemark = () => {}, currentRole = "" }) {
  const hasData = !!result;
  return (
    <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
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
        {hasData ? (
          <span className="ml-auto text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
            Matched: {result.matchedFile}
          </span>
        ) : (
          <span className="ml-auto text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full">
            No PDF uploaded
          </span>
        )}
      </div>

      {hasData ? (
        <>
          <TransactionTable
            title="📥 Inflow Transactions"
            data={result.inflow}
            type="inflow"
            color="text-green-600"
            accountInfo={{ number: account.accNo, name: account.accountName }}
            onUpdateRemark={(type, index, value) => onUpdateRemark(account.accNo, type, index, value)}
            dropdownOptions={inflowDropdownOptions}
            readOnly={readOnly}
            showReviewerColumn={showReviewerColumn}
            reviewerEditable={reviewerEditable}
            onUpdateReviewerRemark={(type, index, value) => onUpdateReviewerRemark(account.accNo, type, index, value)}
            currentRole={currentRole}
          />
          <TransactionTable
            title="📤 Outflow Transactions"
            data={result.outflow}
            type="outflow"
            color="text-red-600"
            accountInfo={{ number: account.accNo, name: account.accountName }}
            onUpdateRemark={(type, index, value) => onUpdateRemark(account.accNo, type, index, value)}
            dropdownOptions={outflowDropdownOptions}
            readOnly={readOnly}
            showReviewerColumn={showReviewerColumn}
            reviewerEditable={reviewerEditable}
            onUpdateReviewerRemark={(type, index, value) => onUpdateReviewerRemark(account.accNo, type, index, value)}
            currentRole={currentRole}
          />
        </>
      ) : (
        <p className="text-gray-400 text-sm py-6 text-center">
          Upload this account's PDF statement to see its transactions here.
        </p>
      )}
    </div>
  );
}

export default function EscrowUpload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userProfile } = useAuth();
  const { selectedProject } = useProject();
  const projectId = selectedProject?.projectId;
  const inputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const [accounts, setAccounts] = useState([]); // from saved Excel config
  const [results, setResults] = useState({}); // accNo -> { inflow, outflow, matchedFile }
  const [showTables, setShowTables] = useState(false);
  const [readyForAnalysis, setReadyForAnalysis] = useState(false);
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [remarkStatus, setRemarkStatus] = useState(null);
  const [savingReviewerRemarks, setSavingReviewerRemarks] = useState(false);
  const [reviewerRemarkStatus, setReviewerRemarkStatus] = useState(null);
  const [inflowDropdownOptions, setInflowDropdownOptions] = useState([]);
  const [outflowDropdownOptions, setOutflowDropdownOptions] = useState([]);
  const [managerConfig, setManagerConfig] = useState(null); // read-only snapshot of Manager's setup
  const [showManagerConfig, setShowManagerConfig] = useState(false);

  const [workflowStatus, setWorkflowStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [rejectionComment, setRejectionComment] = useState(null);
  const [escrowMonth, setEscrowMonth] = useState("");
  const [monthInput, setMonthInput] = useState("");
  const [savingMonth, setSavingMonth] = useState(false);
  const [pastEscrows, setPastEscrows] = useState([]);
  const role = userProfile?.projectRoles?.find(r => r.projectId === projectId)?.role;
  const historyMonth = searchParams.get("month");
  const isViewer =
    role === "REVIEWER" ||
    role === "MANAGER" ||
    !!historyMonth ||
    (role === "MAKER" && workflowStatus && workflowStatus !== ESCROW_STATUS.MAKER_INPUT && workflowStatus !== ESCROW_STATUS.MANAGER_SETUP);

  useEffect(() => {
    const loadManagerConfig = async () => {
      if (!projectId) return;
      try {
        const snap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
        if (snap.exists()) {
          setManagerConfig(snap.data());
        } else {
          setManagerConfig(null);
        }
      } catch (e) {
        console.error("Could not load Manager's escrow config:", e);
      }
    };
    loadManagerConfig();
  }, [projectId]);

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

  useEffect(() => {
    const loadStatus = async () => {
      if (!projectId) return;
      setStatusLoading(true);
      const s = await getEscrowStatus(projectId);
      setWorkflowStatus(s);
      if (s === ESCROW_STATUS.MAKER_INPUT) {
        try {
          const commentSnap = await getDoc(doc(db, "projects", projectId, "escrow", "workflowComment"));
          if (commentSnap.exists()) {
            const data = commentSnap.data();
            if ((data.action || "").toLowerCase().includes("rejected")) {
              setRejectionComment(data);
            } else {
              setRejectionComment(null);
            }
          } else {
            setRejectionComment(null);
          }
        } catch (e) {
          console.error("Could not load rejection comment:", e);
        }
      }
      try {
        const periodSnap = await getDoc(doc(db, "projects", projectId, "escrow", "period"));
        if (periodSnap.exists()) {
          const m = periodSnap.data().month || "";
          setEscrowMonth(m);
          setMonthInput(m);
        }
      } catch (e) {
        console.error("Could not load escrow month:", e);
      }
      setStatusLoading(false);
    };
    loadStatus();
  }, [projectId]);

  useEffect(() => {
    const loadLastResults = async () => {
      if (historyMonth) {
        try {
          const snap = await getEscrowHistoryMonth(projectId, historyMonth);
          if (snap) {
            const accountsList = Object.entries(snap.accounts || {}).map(([accNo, cfg]) => ({
              accNo,
              accountName: cfg.accountName || "",
              description: snap.accountDescriptions?.[accNo] || "",
            }));
            const resultsMap = {};
            for (const [accNo, remarksData] of Object.entries(snap.remarksByAcc || {})) {
              resultsMap[accNo] = {
                inflow: remarksData.inflow || [],
                outflow: remarksData.outflow || [],
                matchedFile: remarksData.pdfKey || accNo,
                openingBalance: remarksData.openingBalance || 0,
                closingBalance: remarksData.closingBalance || 0,
                balanceAsOf: remarksData.balanceAsOf || "",
              };
            }
            setAccounts(accountsList);
            setResults(resultsMap);
            setInflowDropdownOptions(snap.globalInflowRemarks || []);
            setOutflowDropdownOptions(snap.globalOutflowRemarks || []);
            setReadyForAnalysis(true);
            setShowTables(true);
          }
        } catch (e) {
          console.error("Could not load archived results:", e);
        }
        return;
      }
      if (searchParams.get("view") !== "results" && !isViewer) return;
      try {
        const snap = await getDoc(doc(db, "projects", projectId, "escrow", "lastResults"));
        if (snap.exists()) {
          const saved = snap.data();
          setAccounts(saved.accounts || []);
          setInflowDropdownOptions(saved.inflowDropdownOptions || []);
          setOutflowDropdownOptions(saved.outflowDropdownOptions || []);
          setReadyForAnalysis(true);
          setShowTables(true);

          // "lastResults" is only a snapshot taken when the Maker uploaded
          // PDFs — it doesn't include remarks saved afterwards (Maker's
          // "Save Remarks" or Reviewer's "Save Reviewer Remarks"). Pull the
          // latest per-account remarks doc so Manager/Reviewer always see
          // up-to-date remarks, including the Reviewer's remarks once sent
          // on to the Manager.
          const baseResults = saved.results || {};
          const mergedResults = {};
          for (const [accNo, result] of Object.entries(baseResults)) {
            const safeKey = accNo.replace(/[^a-zA-Z0-9]/g, "_");
            let inflow = result.inflow;
            let outflow = result.outflow;
            try {
              const remarksSnap = await getDoc(doc(db, "projects", projectId, "escrow", "remarks_" + safeKey));
              if (remarksSnap.exists()) {
                const savedRemarks = remarksSnap.data();
                if (savedRemarks.inflow) inflow = savedRemarks.inflow;
                if (savedRemarks.outflow) outflow = savedRemarks.outflow;
              }
            } catch (e) {
              console.error("Could not load latest remarks for", accNo, e);
            }
            mergedResults[accNo] = { ...result, inflow, outflow };
          }
          setResults(mergedResults);
        }
      } catch (e) {
        console.error("Could not load last results:", e);
      }
    };
    if (projectId) loadLastResults();
  }, [projectId, searchParams, isViewer, historyMonth]);

  if (statusLoading) {
    return (
      <Layout title="Escrow Upload">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </Layout>
    );
  }

  if (!["MAKER", "REVIEWER", "MANAGER"].includes(role)) {
    return (
      <Layout title="Escrow Upload">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
            <h3 className="text-gray-700 font-bold text-lg">Access Denied</h3>
            <p className="text-gray-400 text-sm mt-1">Only Makers, Reviewers, and Managers can access this step of Escrow Analysis.</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Reviewer/Manager: read-only viewers. They aren't bound by the Maker's
  // turn-based gating below — they can look at this stage whenever they want.
  const EscrowPeriodsPanel = () => (
    pastEscrows.length > 0 && !historyMonth && (
        <div className="mb-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Escrow Periods</p>
          <div className="space-y-2">
            {pastEscrows.map(item => {
              const isClickable = ["COMPLETED", "REJECTED_BY_REVIEWER", "REJECTED_BY_MANAGER", "PENDING"].includes(item.status);
              const badge =
                item.status === "COMPLETED" ? { label: "Completed", cls: "text-green-700 bg-green-50 border-green-200" } :
                item.status === "REJECTED_BY_REVIEWER" ? { label: "Rejected by Reviewer", cls: "text-red-700 bg-red-50 border-red-200" } :
                item.status === "REJECTED_BY_MANAGER" ? { label: "Rejected by Manager", cls: "text-red-700 bg-red-50 border-red-200" } :
                { label: "Pending", cls: "text-amber-700 bg-amber-50 border-amber-200" };
              return (
                <div
                  key={item.id}
                  onClick={() => {
  if (!isClickable) return;
  if (item.status === "PENDING") {
    navigate("/escrow-analysis");
  } else {
    navigate(`/escrow-analysis?month=${item.id}`);
  }
}}
                  className={`flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl shadow-sm transition-all
                    ${isClickable ? "hover:border-indigo-300 hover:shadow-md cursor-pointer" : ""}`}>
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{item.monthKey || "Untitled Period"}</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {item.status === "COMPLETED"
                        ? `Completed ${new Date(item.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
                        : `Updated ${new Date(item.updatedAt || item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap border ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )
    );

  const updateReviewerRemark = (accNo, type, index, value) => {
    setResults(prev => {
      const result = prev[accNo];
      if (!result) return prev;
      const key = type === "inflow" ? "inflow" : "outflow";
      const updatedList = result[key].map((row, i) => i === index ? { ...row, reviewerRemark: value } : row);
      const updatedResult = { ...result, [key]: updatedList };

      saveReviewerRemarkForAccount(accNo, updatedResult);

      return { ...prev, [accNo]: updatedResult };
    });
  };

  const saveReviewerRemarks = async () => {
    setSavingReviewerRemarks(true);
    setReviewerRemarkStatus(null);
    try {
      for (const [accNo, result] of Object.entries(results)) {
        const safeKey = accNo.replace(/[^a-zA-Z0-9]/g, "_");
        await setDoc(
          doc(db, "projects", projectId, "escrow", "remarks_" + safeKey),
          { inflow: result.inflow, outflow: result.outflow },
          { merge: true }
        );
      }
      setReviewerRemarkStatus({ type: "success", message: "Reviewer remarks saved successfully!" });
    } catch (err) {
      setReviewerRemarkStatus({ type: "error", message: err.message });
    }
    setSavingReviewerRemarks(false);
  };
  const saveReviewerRemarkForAccount = async (accNo, updatedResult) => {
    try {
      const safeKey = accNo.replace(/[^a-zA-Z0-9]/g, "_");
      await setDoc(
        doc(db, "projects", projectId, "escrow", "remarks_" + safeKey),
        { inflow: updatedResult.inflow, outflow: updatedResult.outflow },
        { merge: true }
      );
    } catch (err) {
      console.error("Could not save comment for", accNo, err);
    }
  };

  if (isViewer) {
    const statusBanner = {
      [ESCROW_STATUS.REVIEWER_APPROVAL]: "This is currently with the Reviewer for approval.",
      [ESCROW_STATUS.MANAGER_APPROVAL]: "This is currently with the Manager for final approval.",
      [ESCROW_STATUS.COMPLETED]: "This escrow analysis has been completed and approved.",
      [ESCROW_STATUS.MAKER_INPUT]: "This was sent back for corrections.",
    };

    if (!showTables) {
      return (
        <Layout title="Escrow Upload">
          <div className="max-w-full mx-auto px-8 pt-4">
            {!historyMonth && statusBanner[workflowStatus] && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                <Clock size={20} className="text-blue-400 flex-shrink-0" />
                <p className="text-blue-700 text-xs">{statusBanner[workflowStatus]}</p>
              </div>
            )}
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <Clock size={40} className="text-blue-400 mx-auto mb-3" />
                <h3 className="text-gray-700 font-bold text-lg">No Data Yet</h3>
                <p className="text-gray-400 text-sm mt-1">
                  {historyMonth ? "Loading archived statements for this period..." : "The Maker hasn't uploaded any statements yet for this cycle."}
                </p>
              </div>
            </div>
            <EscrowPeriodsPanel />
          </div>
        </Layout>
      );
    }
    return (
      <Layout title="Escrow Upload">
        <div className="max-w-full mx-auto px-8 pt-4">
          {!historyMonth && statusBanner[workflowStatus] && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
              <Clock size={20} className="text-blue-400 flex-shrink-0" />
              <p className="text-blue-700 text-xs">{statusBanner[workflowStatus]}</p>
            </div>
          )}
          <button onClick={() => navigate(-1)}
            className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all">
            ← Back
          </button>

          {managerConfig?.accounts && Object.keys(managerConfig.accounts).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm w-full mb-6">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowManagerConfig(prev => !prev)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <Landmark size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm">Manager's Setup (Read-Only)</h4>
                    <p className="text-gray-400 text-xs">Accounts, allowed inflow/outflow, and remarks configured by the Manager</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-400">
                  {showManagerConfig ? "▲ Hide" : "▼ Show"}
                </span>
              </div>

              {showManagerConfig && (
                <div className="mt-5 space-y-4">
                  {Object.entries(managerConfig.accounts).map(([accNo, cfg]) => (
                    <div key={accNo} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                      <p className="text-sm font-bold text-gray-800">
                        {managerConfig.accountDescriptions?.[accNo] || cfg.accountName} — {accNo}
                      </p>
                      <p className="text-xs text-gray-400 mb-3">{cfg.accountName}</p>
                      {cfg.remark && (
                        <p className="text-xs text-gray-500 mb-3">
                          <span className="font-bold">Remark:</span> {cfg.remark}
                        </p>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-bold text-green-700 mb-1.5">Allowed Inflow</p>
                          {cfg.allInflowEnabled ? (
                            <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-lg">
                              All accounts allowed
                            </span>
                          ) : cfg.allowedInflow?.length > 0 ? (
                            <ul className="space-y-1">
                              {cfg.allowedInflow.map(otherAcc => (
                                <li key={otherAcc} className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1">
                                  {managerConfig.accountDescriptions?.[otherAcc] || otherAcc} ({otherAcc})
                                  {cfg.inflowRemarks?.[otherAcc] && (
                                    <span className="text-gray-400"> — {cfg.inflowRemarks[otherAcc]}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gray-300">None set</p>
                          )}
                        </div>

                        <div>
                          <p className="text-xs font-bold text-red-700 mb-1.5">Allowed Outflow</p>
                          {cfg.allOutflowEnabled ? (
                            <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded-lg">
                              All accounts allowed
                            </span>
                          ) : cfg.allowedOutflow?.length > 0 ? (
                            <ul className="space-y-1">
                              {cfg.allowedOutflow.map(otherAcc => (
                                <li key={otherAcc} className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1">
                                  {managerConfig.accountDescriptions?.[otherAcc] || otherAcc} ({otherAcc})
                                  {cfg.outflowRemarks?.[otherAcc] && (
                                    <span className="text-gray-400"> — {cfg.outflowRemarks[otherAcc]}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gray-300">None set</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(managerConfig.globalInflowRemarks?.length > 0 || managerConfig.globalOutflowRemarks?.length > 0) && (
                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                      <p className="text-xs font-bold text-gray-600 mb-2">Global Remark Options</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-bold text-green-700 mb-1.5">Inflow Remarks</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(managerConfig.globalInflowRemarks || []).map((tag, i) => (
                              <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{tag}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-red-700 mb-1.5">Outflow Remarks</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(managerConfig.globalOutflowRemarks || []).map((tag, i) => (
                              <span key={i} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">{tag}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {accounts.map((acc) => (
            <AccountSection
              key={acc.accNo}
              account={acc}
              result={results[acc.accNo]}
              onUpdateRemark={() => {}}
              inflowDropdownOptions={inflowDropdownOptions}
              outflowDropdownOptions={outflowDropdownOptions}
              readOnly
              showReviewerColumn={true}
              reviewerEditable={!historyMonth}
              onUpdateReviewerRemark={updateReviewerRemark}
              currentRole={role}
            />
          ))}

          {!historyMonth && (role === "REVIEWER" || role === "MANAGER") && (
            <>
              {reviewerRemarkStatus && (
                <div className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2
                  ${reviewerRemarkStatus.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {reviewerRemarkStatus.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  {reviewerRemarkStatus.message}
                </div>
              )}
              <button onClick={saveReviewerRemarks} disabled={savingReviewerRemarks}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all mb-4
                  ${!savingReviewerRemarks ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                {savingReviewerRemarks ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><CheckCircle size={14} /> Save Comments</>}
              </button>
            </>
          )}

          <button onClick={() => navigate(historyMonth ? `/escrow-summary?month=${historyMonth}` : "/escrow-summary")}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all mb-10">
            <BarChart3 size={14} /> View Account Summary
          </button>
          <EscrowPeriodsPanel />
        </div>
      </Layout>
    );
  }

  if (workflowStatus !== ESCROW_STATUS.MAKER_INPUT) {
    const messages = {
      [ESCROW_STATUS.MANAGER_SETUP]: "Manager has not yet completed the initial setup (bank flow upload and allowed inflow/outflow). Please check back once that's done.",
    };
    return (
      <Layout title="Escrow Upload">
        <div className="max-w-full mx-auto px-4">
          {/* Workflow Status Tracker */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
            <p className="text-xs font-bold text-gray-500 mb-4">Approval Status</p>
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

          <div className="flex items-center justify-center h-64">
            <div className="text-center max-w-md">
              <Clock size={48} className="text-blue-400 mx-auto mb-3" />
              <h3 className="text-gray-700 font-bold text-lg">Not Your Turn Yet</h3>
              <p className="text-gray-400 text-sm mt-1">{messages[workflowStatus]}</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  // Given a transaction's description and the list of "allowed" accounts for
// this direction, finds which account it matches and returns the
// auto-generated remark text "Transferred to <description>". Returns null
// if no match is found.
const getAutoTransferRemark = (description, allowedAccounts) => {
  for (const acc of allowedAccounts) {
    const accNo = (acc.accNo || "").trim();
    const accDesc = (acc.description || "").trim();
    if (accNo && description.includes(accNo)) {
      return `Transferred to ${accDesc || accNo}`;
    }
    if (accDesc && description.toLowerCase().includes(accDesc.toLowerCase())) {
      return `Transferred to ${accDesc}`;
    }
  }
  return null;
};
const getAutoReceivedRemark = (description, allowedAccounts) => {
  for (const acc of allowedAccounts) {
    const accNo = (acc.accNo || "").trim();
    const accDesc = (acc.description || "").trim();
    if (accNo && description.includes(accNo)) {
      return `Received from ${accDesc || accNo}`;
    }
    if (accDesc && description.toLowerCase().includes(accDesc.toLowerCase())) {
      return `Received from ${accDesc}`;
    }
  }
  return null;
};
const EXPECTED_EXCEL_HEADERS = ["date", "narration", "chq./ref.no.", "value dt", "withdrawal amt.", "deposit amt.", "closing balance"];

const processExcelFile = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const allSheetResults = [];

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

          const sheetResult = parseSheetRows(rows, file.name, sheetName);
          if (sheetResult) allSheetResults.push(sheetResult);
        }

        resolve(allSheetResults);
      } catch (err) {
        resolve([{
          valid: false,
          warning: `Error reading Excel file "${file.name}": ${err.message}`,
          accNo: null,
          inflow: [],
          outflow: [],
          allRows: [],
          fileName: file.name,
        }]);
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

        const parseSheetRows = (rows, fileName, sheetName) => {
  try {
    // Step 1 — Find account number from top cells
    let excelAccNo = null;
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      for (let j = 0; j < rows[i].length; j++) {
        const cellVal = String(rows[i][j] || "");
        const match = cellVal.match(/Account No\s*:?\s*([0-9]+)/i);
        if (match) {
          excelAccNo = match[1].trim();
          break;
        }
      }
      if (excelAccNo) break;
    }

    // Step 2 — Find header row by looking for "Date" and "Narration"
    let headerRowIndex = -1;
    let colMap = {};
    for (let i = 0; i < rows.length; i++) {
      const rowLower = rows[i].map(c => String(c || "").toLowerCase().trim());
      if (rowLower.includes("date") && rowLower.includes("narration")) {
        headerRowIndex = i;
        rowLower.forEach((col, idx) => {
          colMap[col] = idx;
        });
        break;
      }
    }

    if (headerRowIndex === -1) return null;

    // Step 3 — Validate headers
    const foundHeaders = Object.keys(colMap);
    const missingHeaders = EXPECTED_EXCEL_HEADERS.filter(h => !foundHeaders.includes(h));
    const isValidFormat = missingHeaders.length === 0;

    if (!isValidFormat) {
      return {
        valid: false,
        warning: `Sheet "${sheetName}" in "${fileName}" doesn't follow the expected format. Missing columns: ${missingHeaders.join(", ")}. Expected: Date, Narration, Chq./Ref.No., Value Dt, Withdrawal Amt., Deposit Amt., Closing Balance.`,
        accNo: excelAccNo,
        inflow: [],
        outflow: [],
        allRows: [],
        fileName: `${fileName} (${sheetName})`,
      };
    }

    // Step 4 — Parse transactions
    const inflow = [];
    const outflow = [];
    const allRows = [];

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => !c)) continue;

      const transactionDate = String(row[colMap["date"]] || "").trim();
      const description = String(row[colMap["narration"]] || "").trim();
      const referenceNo = String(row[colMap["chq./ref.no."]] || "").trim();
      const withdrawalRaw = row[colMap["withdrawal amt."]];
      const depositRaw = row[colMap["deposit amt."]];
      const closingBalRaw = row[colMap["closing balance"]];

      if (!description || !transactionDate) continue;
      if (description.toLowerCase().includes("opening balance")) continue;

      const debit = parseFloat(String(withdrawalRaw || "").replace(/,/g, "")) || 0;
      const credit = parseFloat(String(depositRaw || "").replace(/,/g, "")) || 0;
      const closingBal = parseFloat(String(closingBalRaw || "").replace(/,/g, "")) || 0;

      if (debit === 0 && credit === 0) continue;

      allRows.push({ debit, credit, closing_bal: closingBal });

      if (credit > 0) {
        inflow.push({
          description,
          amount: credit,
          remark: "",
          transactionDate,
          referenceNo,
          category: "red",
        });
      } else if (debit > 0) {
        outflow.push({
          description,
          amount: debit,
          remark: "",
          transactionDate,
          referenceNo,
          category: "red",
        });
      }
    }

    // Step 5 — Calculate opening and closing balance
    let openingBalance = 0;
    let closingBalance = 0;
    if (allRows.length > 0) {
      const firstRow = allRows[0];
      const lastRow = allRows[allRows.length - 1];
      if (firstRow.credit > 0) {
        openingBalance = firstRow.closing_bal - firstRow.credit;
      } else if (firstRow.debit > 0) {
        openingBalance = firstRow.closing_bal + firstRow.debit;
      }
      closingBalance = lastRow.closing_bal;
    }

    return {
      valid: true,
      warning: null,
      accNo: excelAccNo,
      inflow,
      outflow,
      allRows,
      openingBalance,
      closingBalance,
      balanceAsOf: allRows.length > 0 ? String(rows[headerRowIndex + allRows.length][colMap["date"]] || "") : "",
      fileName: `${fileName} (${sheetName})`,
    };
  } catch (err) {
    return {
      valid: false,
      warning: `Error reading sheet "${sheetName}" in "${fileName}": ${err.message}`,
      accNo: null,
      inflow: [],
      outflow: [],
      allRows: [],
      fileName: `${fileName} (${sheetName})`,
    };
  }
};
  const handleSaveMonth = async () => {
    if (!monthInput.trim()) return;
    setSavingMonth(true);
    try {
      await setDoc(doc(db, "projects", projectId, "escrow", "period"), {
        month: monthInput.trim(),
        updatedAt: new Date().toISOString(),
      });
      setEscrowMonth(monthInput.trim());
      await updateActiveHistoryMonth(projectId, monthInput.trim());
    } catch (e) {
      console.error("Could not save escrow month:", e);
    }
    setSavingMonth(false);
  };

  const handleFileSelect = (selectedFiles) => {
   const validFiles = Array.from(selectedFiles).filter(f => 
  f.type === "application/pdf" || 
  f.name.match(/\.(xlsx|xls)$/)
);
if (validFiles.length !== selectedFiles.length) {
  setStatus({ type: "error", message: "Only PDF or Excel files are allowed!" });
  return;
}
setFiles(prev => [...prev, ...validFiles]);
    setStatus(null);
  };

  const handleRemove = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
  if (files.length === 0) {
    setStatus({ type: "error", message: "Please upload at least 1 file." });
    return;
  }
  setUploading(true);
  setStatus(null);

    try {
      const snap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
      const accData = snap.exists() ? snap.data() : {};
      const accountsMap = accData.accounts || {};
      const accountDescriptions = accData.accountDescriptions || {};

      // Build the list of account configs to send to the backend
      const accountsList = Object.entries(accountsMap).map(([accNo, cfg]) => ({
        accNo,
        accountName: cfg.accountName || "",
        description: accountDescriptions[accNo] || "",
        allowedInflow: (cfg.allowedInflow || []).map(a => ({
          accNo: a,
          description: accountDescriptions[a] || ""
        })),
        allowedOutflow: (cfg.allowedOutflow || []).map(a => ({
          accNo: a,
          description: accountDescriptions[a] || ""
        })),
        allInflowEnabled: cfg.allInflowEnabled || false,
        allOutflowEnabled: cfg.allOutflowEnabled || false,
      }));
      setAccounts(accountsList);

      // Load global inflow/outflow remarks
      const inflowRemarksList = Array.isArray(accData.globalInflowRemarks)
        ? accData.globalInflowRemarks
        : (accData.globalInflowRemarks || "").split(",").map(r => r.trim()).filter(r => r);
      const outflowRemarksList = Array.isArray(accData.globalOutflowRemarks)
        ? accData.globalOutflowRemarks
        : (accData.globalOutflowRemarks || "").split(",").map(r => r.trim()).filter(r => r);
      setInflowDropdownOptions(inflowRemarksList);
      setOutflowDropdownOptions(outflowRemarksList);


      const uploadedFiles = [];
const formData = new FormData();
const excelFiles = [];
const pdfFiles = [];

// Separate PDF and Excel files
for (const file of files) {
  if (file.name.match(/\.(xlsx|xls)$/i)) {
    excelFiles.push(file);
  } else {
    pdfFiles.push(file);
    formData.append("files", file);
  }
}

// Upload all files to storage
for (const file of files) {
  const storageRef = ref(storage, `projects/${projectId}/escrow/${Date.now()}_${file.name}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  uploadedFiles.push({ name: file.name, url, uploadedAt: new Date().toISOString() });
}

// Process Excel files on frontend
const excelWarnings = [];
const excelResults = {};

for (const excelFile of excelFiles) {
  const sheetResults = await processExcelFile(excelFile);

  for (const excelData of sheetResults) {
    if (!excelData.valid) {
      excelWarnings.push(excelData.warning);
      continue;
    }

    if (!excelData.accNo) {
      excelWarnings.push(`Could not find account number in "${excelData.fileName}". Please check the file.`);
      continue;
    }

    const matchedAcc = accountsList.find(a => a.accNo === excelData.accNo);
    if (!matchedAcc) {
      excelWarnings.push(`Account number ${excelData.accNo} in "${excelData.fileName}" does not match any account in the Excel config.`);
      continue;
    }

    const categorizedInflow = excelData.inflow.map(row => {
      if (matchedAcc.allInflowEnabled) return { ...row, category: "green" };
      const matched = matchedAcc.allowedInflow.some(allowed =>
        row.description.includes(allowed.accNo) ||
        (allowed.description && row.description.toLowerCase().includes(allowed.description.toLowerCase()))
      );
      return { ...row, category: matched ? "green" : "red" };
    });

    const categorizedOutflow = excelData.outflow.map(row => {
      if (matchedAcc.allOutflowEnabled) return { ...row, category: "green" };
      const matched = matchedAcc.allowedOutflow.some(allowed =>
        row.description.includes(allowed.accNo) ||
        (allowed.description && row.description.toLowerCase().includes(allowed.description.toLowerCase()))
      );
      return { ...row, category: matched ? "green" : "red" };
    });

    for (const inRow of categorizedInflow) {
      const inRef = (inRow.referenceNo || "").trim();
      if (!inRef) continue;
      for (const outRow of categorizedOutflow) {
        const outRef = (outRow.referenceNo || "").trim();
        if (outRef && outRef === inRef && outRow.amount === inRow.amount) {
          inRow.category = "reversal";
          outRow.category = "reversal";
        }
      }
    }

    excelResults[matchedAcc.accNo] = {
      inflow: categorizedInflow,
      outflow: categorizedOutflow,
      matchedFile: excelData.fileName,
      openingBalance: excelData.openingBalance,
      closingBalance: excelData.closingBalance,
      balanceAsOf: excelData.balanceAsOf || "",
    };
  }
}

// Show warnings for invalid Excel files but continue
if (excelWarnings.length > 0) {
  const proceed = window.confirm(
    `Warning:\n\n${excelWarnings.join("\n\n")}\n\nDo you want to continue with the remaining files?`
  );
  if (!proceed) {
    setUploading(false);
    return;
  }
}

// If no PDF files, skip backend call
let pdfResults = {};
if (pdfFiles.length > 0) {
  formData.append("accounts_config", JSON.stringify(accountsList));
  const response = await fetch("http://127.0.0.1:8000/api/escrow/parse-pdf", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  if (data.success) {
    pdfResults = data.results;
  }
}

// Merge PDF and Excel results
const mergedApiResults = { ...pdfResults, ...excelResults };

// Auto-fill blank remarks for transactions that matched a known account
// (e.g. "Transferred to 70% Account"), and collect any new remark phrases
// so they can be added to the global dropdown lists automatically.
const newInflowRemarks = [];
const newOutflowRemarks = [];

for (const [accNo, result] of Object.entries(mergedApiResults)) {
  const matchedAcc = accountsList.find(a => a.accNo === accNo);
  if (!matchedAcc) continue;

  // Auto-remark detection always checks against ALL other known accounts,
  // completely independent of what's ticked as "allowed" — if the
  // transaction matches ANY known account, it's a real transfer and should
  // be labeled, regardless of escrow-mechanism rules.
  const allOtherAccounts = accountsList
    .filter(a => a.accNo !== matchedAcc.accNo)
    .map(a => ({ accNo: a.accNo, description: a.description }));

  result.outflow = result.outflow.map(row => {
    if (row.remark) return row;
    const autoRemark = getAutoTransferRemark(row.description, allOtherAccounts);
    if (autoRemark) {
      if (!newOutflowRemarks.includes(autoRemark)) newOutflowRemarks.push(autoRemark);
      return { ...row, remark: autoRemark };
    }
    return row;
  });

  result.inflow = result.inflow.map(row => {
    if (row.remark) return row;
    const autoRemark = getAutoReceivedRemark(row.description, allOtherAccounts);
    if (autoRemark) {
      if (!newInflowRemarks.includes(autoRemark)) newInflowRemarks.push(autoRemark);
      return { ...row, remark: autoRemark };
    }
    return row;
  });
}

const data = { success: true, results: mergedApiResults };

if (data.success) {
        // Auto-load previous remarks for each matched account/PDF if they exist
        const mergedResults = {};
        for (const [accNo, result] of Object.entries(data.results)) {
          const safeKey = accNo.replace(/[^a-zA-Z0-9]/g, "_");
          let inflow = result.inflow;
          let outflow = result.outflow;
          try {
            const prevSnap = await getDoc(doc(db, "projects", projectId, "escrow", "remarks_" + safeKey));
            if (prevSnap.exists()) {
              const prev = prevSnap.data();
              inflow = inflow.map((row, i) => {
                const savedRemark = prev.inflow?.[i]?.remark;
                return savedRemark ? { ...row, remark: savedRemark } : row;
              });
              outflow = outflow.map((row, i) => {
                const savedRemark = prev.outflow?.[i]?.remark;
                return savedRemark ? { ...row, remark: savedRemark } : row;
              });
            }
          } catch (e) {
            console.error("Could not load previous remarks for", accNo, e);
          }
          mergedResults[accNo] = { ...result, inflow, outflow };
        }

        setResults(mergedResults);

        await setDoc(doc(db, "projects", projectId, "escrow", "documents"), {
          files: uploadedFiles,
          updatedAt: serverTimestamp(),
        });

        // Save the full categorized results so we can restore this exact
        // view later (e.g. when navigating back from Account Summary)
        // without needing to re-upload and re-parse the files.
        await setDoc(doc(db, "projects", projectId, "escrow", "lastResults"), {
          accounts: accountsList,
          results: mergedResults,
          inflowDropdownOptions: inflowRemarksList,
          outflowDropdownOptions: outflowRemarksList,
          savedAt: new Date().toISOString(),
        });
        console.log("Saved lastResults successfully");

        setReadyForAnalysis(true);
        setStatus({ type: "success", message: `PDFs uploaded and parsed successfully! Matched ${Object.keys(data.results).length} of ${accountsList.length} accounts.` });
      } else {
        setStatus({ type: "error", message: "Failed to parse PDFs." });
      }
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
    setUploading(false);
  };

  const updateRemark = (accNo, type, index, value) => {
    setResults(prev => {
      const result = prev[accNo];
      if (!result) return prev;
      const key = type === "inflow" ? "inflow" : "outflow";
      const updatedList = result[key].map((row, i) => i === index ? { ...row, remark: value } : row);
      return { ...prev, [accNo]: { ...result, [key]: updatedList } };
    });
  };

  const saveRemarks = async () => {
    setSavingRemarks(true);
    setRemarkStatus(null);
    try {
      for (const [accNo, result] of Object.entries(results)) {
        const safeKey = accNo.replace(/[^a-zA-Z0-9]/g, "_");
        await setDoc(doc(db, "projects", projectId, "escrow", "remarks_" + safeKey), {
  inflow: result.inflow,
  outflow: result.outflow,
  savedAt: new Date().toISOString(),
  pdfKey: result.matchedFile || accNo,
  openingBalance: result.openingBalance || 0,
  closingBalance: result.closingBalance || 0,
  balanceAsOf: result.balanceAsOf || "",
  accNo: accNo,
});
      }
      // NOTE: status is NOT changed here anymore. The Maker reviews everything
      // on the Account Summary page and explicitly clicks "Send to Reviewer" there.
      setRemarkStatus({ type: "success", message: "Remarks saved successfully!" });
    } catch (err) {
      setRemarkStatus({ type: "error", message: err.message });
    }
    setSavingRemarks(false);
  };

  return (
    <Layout title="Escrow Upload">
      <div className="flex items-center justify-between px-8 pt-2 mb-2">
        <button onClick={() => {
  setShowTables(false);
  navigate("/escrow-upload");
}}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all">
          ← Back
        </button>
        {showTables && (
          <div className="flex justify-end">
      <button
        onClick={() => {
  const wb = XLSX.utils.book_new();

  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E40AF" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const greenRow = { font: { color: { rgb: "166534" } }, fill: { fgColor: { rgb: "F0FDF4" } }, alignment: { horizontal: "left", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const redRow = { font: { color: { rgb: "991B1B" } }, fill: { fgColor: { rgb: "FFF1F2" } }, alignment: { horizontal: "left", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const reversalRow = { font: { color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "EF4444" } }, alignment: { horizontal: "left", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const totalStyle = { font: { bold: true, color: { rgb: "1E3A5F" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "right", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
  const fmt = (v) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  accounts.forEach(acc => {
    const result = results[acc.accNo];
    if (!result) return;

    const headers = ["Transaction Date", "Acc Number", "Acc Name", "Description", "Reference No.", "Amount (₹)", "Remark", "Type"];
    const ws = {};

    // Header row
    headers.forEach((h, i) => {
      ws[`${String.fromCharCode(65 + i)}1`] = { v: h, s: headerStyle };
    });

    let rowIndex = 2;

    // Inflow rows
    result.inflow.forEach(r => {
      const style = r.category === "reversal" ? reversalRow : r.category === "green" ? greenRow : redRow;
      const rowData = [r.transactionDate, acc.accNo, acc.accountName, r.description, r.referenceNo, fmt(r.amount), r.remark, "Inflow"];
      rowData.forEach((val, i) => {
        ws[`${String.fromCharCode(65 + i)}${rowIndex}`] = { v: val || "", s: style };
      });
      rowIndex++;
    });

    // Total Inflow row
    const totalInflowStyle = { ...totalStyle };
    ["", "", "", "", "Total Inflow", fmt(result.inflow.reduce((s, r) => s + r.amount, 0)), "", ""].forEach((val, i) => {
      ws[`${String.fromCharCode(65 + i)}${rowIndex}`] = { v: val, s: totalInflowStyle };
    });
    rowIndex++;
    rowIndex++; // Empty row

    // Outflow rows
    result.outflow.forEach(r => {
      const style = r.category === "reversal" ? reversalRow : r.category === "green" ? greenRow : redRow;
      const rowData = [r.transactionDate, acc.accNo, acc.accountName, r.description, r.referenceNo, fmt(r.amount), r.remark, "Outflow"];
      rowData.forEach((val, i) => {
        ws[`${String.fromCharCode(65 + i)}${rowIndex}`] = { v: val || "", s: style };
      });
      rowIndex++;
    });

    // Total Outflow row
    ["", "", "", "", "Total Outflow", fmt(result.outflow.reduce((s, r) => s + r.amount, 0)), "", ""].forEach((val, i) => {
      ws[`${String.fromCharCode(65 + i)}${rowIndex}`] = { v: val, s: totalInflowStyle };
    });

    ws["!cols"] = [
      { wch: 20 }, { wch: 18 }, { wch: 35 }, { wch: 40 },
      { wch: 25 }, { wch: 18 }, { wch: 25 }, { wch: 10 }
    ];
    ws["!rows"] = [{ hpt: 25 }];
    ws["!ref"] = `A1:H${rowIndex}`;

    const sheetName = (acc.description || acc.accNo).slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, "Escrow_Transactions.xlsx");
}}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl shadow transition-all">
        <FileSpreadsheet size={14} /> Export to Excel
      </button>
    </div>
        )}
      </div>

      {!showTables ? (
        <div className="flex justify-center px-4">
          <div className="w-full max-w-7xl">
            <div className="mb-6 p-4 bg-white border border-gray-200 rounded-2xl flex items-center gap-3 flex-wrap">
              <label className="text-xs font-bold text-gray-600 whitespace-nowrap">Escrow Period (Month):</label>
              <input
                type="text"
                value={monthInput}
                onChange={(e) => setMonthInput(e.target.value)}
                placeholder="e.g. JAN 2026"
                className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                onClick={handleSaveMonth}
                disabled={savingMonth || !monthInput.trim()}
                className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap
                  ${!savingMonth && monthInput.trim() ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                {savingMonth ? "Saving..." : escrowMonth ? "Update" : "Save"}
              </button>
              {escrowMonth && (
                <span className="text-xs text-green-600 font-semibold">✓ Saved: {escrowMonth}</span>
              )}
            </div>

            {rejectionComment && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-700 mb-1">
                    This was rejected by the {rejectionComment.fromRole === "REVIEWER" ? "Reviewer" : "Manager"} and sent back for corrections.
                  </p>
                  {rejectionComment.text && (
                    <p className="text-xs text-red-600 whitespace-pre-wrap">
                      <span className="font-bold">Comment:</span> {rejectionComment.text}
                    </p>
                  )}
                </div>
              </div>
            )}
          {managerConfig?.accounts && Object.keys(managerConfig.accounts).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm w-full mb-6">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowManagerConfig(prev => !prev)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <Landmark size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm">Manager's Setup (Read-Only)</h4>
                    <p className="text-gray-400 text-xs">Accounts, allowed inflow/outflow, and remarks configured by the Manager</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-400">
                  {showManagerConfig ? "▲ Hide" : "▼ Show"}
                </span>
              </div>

              {showManagerConfig && (
                <div className="mt-5 space-y-4">
                  {Object.entries(managerConfig.accounts).map(([accNo, cfg]) => (
                    <div key={accNo} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                      <p className="text-sm font-bold text-gray-800">
                        {managerConfig.accountDescriptions?.[accNo] || cfg.accountName} — {accNo}
                      </p>
                      <p className="text-xs text-gray-400 mb-3">{cfg.accountName}</p>
                      {cfg.remark && (
                        <p className="text-xs text-gray-500 mb-3">
                          <span className="font-bold">Remark:</span> {cfg.remark}
                        </p>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-bold text-green-700 mb-1.5">Allowed Inflow</p>
                          {cfg.allInflowEnabled ? (
                            <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-lg">
                              All accounts allowed
                            </span>
                          ) : cfg.allowedInflow?.length > 0 ? (
                            <ul className="space-y-1">
                              {cfg.allowedInflow.map(otherAcc => (
                                <li key={otherAcc} className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1">
                                  {managerConfig.accountDescriptions?.[otherAcc] || otherAcc} ({otherAcc})
                                  {cfg.inflowRemarks?.[otherAcc] && (
                                    <span className="text-gray-400"> — {cfg.inflowRemarks[otherAcc]}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gray-300">None set</p>
                          )}
                        </div>

                        <div>
                          <p className="text-xs font-bold text-red-700 mb-1.5">Allowed Outflow</p>
                          {cfg.allOutflowEnabled ? (
                            <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded-lg">
                              All accounts allowed
                            </span>
                          ) : cfg.allowedOutflow?.length > 0 ? (
                            <ul className="space-y-1">
                              {cfg.allowedOutflow.map(otherAcc => (
                                <li key={otherAcc} className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1">
                                  {managerConfig.accountDescriptions?.[otherAcc] || otherAcc} ({otherAcc})
                                  {cfg.outflowRemarks?.[otherAcc] && (
                                    <span className="text-gray-400"> — {cfg.outflowRemarks[otherAcc]}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gray-300">None set</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(managerConfig.globalInflowRemarks?.length > 0 || managerConfig.globalOutflowRemarks?.length > 0) && (
                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                      <p className="text-xs font-bold text-gray-600 mb-2">Global Remark Options</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-bold text-green-700 mb-1.5">Inflow Remarks</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(managerConfig.globalInflowRemarks || []).map((tag, i) => (
                              <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{tag}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-red-700 mb-1.5">Outflow Remarks</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(managerConfig.globalOutflowRemarks || []).map((tag, i) => (
                              <span key={i} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">{tag}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-2xl p-10 shadow-sm w-full">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <FileText size={20} className="text-blue-600" />
              </div>
              <div>
                <h4 className="font-bold text-gray-800 text-sm">Escrow PDF Documents</h4>
                <p className="text-gray-400 text-xs">Upload all account statements together — they'll be auto-matched by account number</p>
              </div>
            </div>

            <div
              className="border-2 border-dashed border-gray-300 rounded-2xl p-20 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
              onClick={() => inputRef.current.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}>
              <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls" multiple className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)} />
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
                <FileText size={28} className="text-blue-600" />
              </div>
              <p className="text-gray-700 font-semibold text-sm">Upload PDF Documents</p>
              <p className="text-gray-400 text-xs mt-1">All 7 account statements (or however many you have)</p>
              <div className="mt-4 flex items-center gap-2 bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-lg">
                <Upload size={13} /> Browse Files
              </div>
              <p className="text-gray-300 text-xs mt-2">or drag & drop · PDF or Excel</p>
            </div>

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-blue-600" />
                      <div>
                        <p className="text-blue-700 text-xs font-semibold">{file.name}</p>
                        <p className="text-blue-400 text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button onClick={() => handleRemove(index)}
                      className="w-6 h-6 bg-red-100 hover:bg-red-200 rounded-full flex items-center justify-center">
                      <X size={12} className="text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {status && (
              <div className={`mt-3 p-3 rounded-xl text-xs font-medium flex items-center gap-2
                ${status.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {status.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {status.message}
              </div>
            )}

            {!readyForAnalysis ? (
              <button onClick={handleUpload} disabled={uploading}
                className={`mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
                  ${!uploading ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                {uploading ? <><RefreshCw size={14} className="animate-spin" /> Processing...</> : <><Upload size={14} /> Upload & Parse PDFs</>}
              </button>
            ) : (
              <button onClick={() => setShowTables(true)}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg transition-all">
                <BarChart3 size={14} /> Click here for detailed analysis of Escrow
              </button>
            )}
          </div>

          <EscrowPeriodsPanel />
          </div>
        </div>
      ) : (
        <div className="max-w-full mx-auto px-8">
          {accounts.map((acc) => (
            <AccountSection
              key={acc.accNo}
              account={acc}
              result={results[acc.accNo]}
              onUpdateRemark={updateRemark}
              inflowDropdownOptions={inflowDropdownOptions}
              outflowDropdownOptions={outflowDropdownOptions}
              showReviewerColumn={true}
              reviewerEditable={true}
              onUpdateReviewerRemark={updateReviewerRemark}
              currentRole={role}
            />
          ))}

          {remarkStatus && (
            <div className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2
              ${remarkStatus.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {remarkStatus.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {remarkStatus.message}
            </div>
          )}

          <button onClick={saveRemarks} disabled={savingRemarks}
  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
    ${!savingRemarks ? "bg-green-600 hover:bg-green-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
  {savingRemarks ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><CheckCircle size={14} /> Save Remarks</>}
</button>

{remarkStatus?.type === "success" && (
  <button onClick={() => navigate("/escrow-summary")}
    className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all">
    <BarChart3 size={14} /> Account Summary
  </button>
)}
        </div>
      )}
    </Layout>
  );
}