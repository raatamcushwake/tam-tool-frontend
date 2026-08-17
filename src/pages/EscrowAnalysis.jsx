import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import Layout from "../components/common/Layout";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  Landmark, Upload, FileSpreadsheet, CheckCircle,
  AlertCircle, RefreshCw, X, Clock
} from "lucide-react";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../services/escrow";
import { getEscrowStatus, setEscrowStatus, ESCROW_STATUS, getEscrowHistoryList, ensureActiveHistoryEntry, getEscrowHistoryMonth } from "../services/escrow";


export default function EscrowAnalysis() {
  const { userProfile } = useAuth();
  const { selectedProject } = useProject();
  const projectId = selectedProject?.projectId;
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [searchParams] = useSearchParams();
  const historyMonth = searchParams.get("month");
  const [historyConfig, setHistoryConfig] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(!!historyMonth);

  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  // All accounts parsed from the Excel (no more "100% only" filtering)
  const [accounts, setAccounts] = useState([]);

  // Per-account configuration, keyed by accNo:
  // { description, remark, allowedInflow: [], allowedOutflow: [], inflowRemarks: {}, outflowRemarks: {} }
  const [configs, setConfigs] = useState({});

  // Tracks which Allowed Inflow/Outflow dropdowns are expanded, keyed like "accNo_inflow" / "accNo_outflow"
  const [openDropdowns, setOpenDropdowns] = useState({});
  const [globalInflowRemarks, setGlobalInflowRemarks] = useState([]);
const [globalOutflowRemarks, setGlobalOutflowRemarks] = useState([]);
const [inflowInput, setInflowInput] = useState("");
const [outflowInput, setOutflowInput] = useState("");

  // Workflow status — decides whether Manager sees the real form or a status message
  const [workflowStatus, setWorkflowStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [pastEscrows, setPastEscrows] = useState([]);
  const [viewConfig, setViewConfig] = useState(null);

  useEffect(() => {
    const loadViewConfig = async () => {
      if (!projectId) return;
      try {
        const snap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
        setViewConfig(snap.exists() ? snap.data() : null);
      } catch (e) {
        console.error("Could not load escrow setup for viewing:", e);
      }
    };
    loadViewConfig();
  }, [projectId]);

  useEffect(() => {
    const loadStatus = async () => {
      if (!projectId) return;
      setStatusLoading(true);
      const status = await getEscrowStatus(projectId);
      setWorkflowStatus(status);
      setStatusLoading(false);
    };
    loadStatus();
  }, [projectId]);

  useEffect(() => {
    const loadHistorySnapshot = async () => {
      if (!projectId || !historyMonth) return;
      setHistoryLoading(true);
      const snap = await getEscrowHistoryMonth(projectId, historyMonth);
      setHistoryConfig(snap);
      setHistoryLoading(false);
    };
    loadHistorySnapshot();
  }, [projectId, historyMonth]);

  const handleRecallSetup = async () => {
    const confirmed = window.confirm(
      "Recall this setup and go back to editing? The Maker will lose access until you save again."
    );
    if (!confirmed) return;
    try {
      await setEscrowStatus(projectId, ESCROW_STATUS.MANAGER_SETUP, userProfile?.email || "");
      setWorkflowStatus(ESCROW_STATUS.MANAGER_SETUP);
    } catch (e) {
      alert("Could not recall setup: " + e.message);
    }
  };

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

  const toggleDropdown = (accNo, type) => {
    const key = `${accNo}_${type}`;
    setOpenDropdowns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const role = userProfile?.projectRoles?.find(r => r.projectId === projectId)?.role;

  const PastEscrowsPanel = () => (
    pastEscrows.length > 0 && (
      <div className="max-w-full mx-auto px-8 pt-2 mb-6">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Escrow Periods</p>
        <div className="space-y-2">
          {pastEscrows.map(item => {
            const isClickable = ["COMPLETED", "REJECTED_BY_REVIEWER", "REJECTED_BY_MANAGER", "PENDING"].includes(item.status);
            const badge =
              item.status === "COMPLETED" ? { label: "Completed", cls: "text-green-700 bg-green-50 border-green-200" } :
              item.status === "REJECTED_BY_REVIEWER" ? { label: "Rejected by Reviewer", cls: "text-red-700 bg-red-50 border-red-200" } :
              item.status === "REJECTED_BY_MANAGER" ? { label: "Rejected by Manager", cls: "text-red-700 bg-red-50 border-red-200" } :
              { label: "Pending", cls: "text-amber-700 bg-amber-50 border-amber-200" };
            const canScrollToLive = !isClickable && role === "REVIEWER";
            const handleClick = () => {
              if (isClickable) {
                if (item.status === "PENDING") {
                  navigate("/escrow-upload");
                } else {
                  navigate(`/escrow-analysis?month=${item.id}`);
                }
              } else if (canScrollToLive) {
                document.getElementById("live-cycle-anchor")?.scrollIntoView({ behavior: "smooth" });
              }
            };
            return (
              <div
                key={item.id}
                onClick={handleClick}
                className={`flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl shadow-sm transition-all
                  ${(isClickable || canScrollToLive) ? "hover:border-indigo-300 hover:shadow-md cursor-pointer" : ""}`}>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{item.monthKey || "Untitled Period"}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {item.status === "COMPLETED"
                      ? `Completed ${new Date(item.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
                      : `Updated ${new Date(item.updatedAt || item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                  </p>
                  {canScrollToLive && (
                    <p className="text-indigo-400 text-xs mt-0.5">↓ This is the current cycle — shown below</p>
                  )}
                  {item.finalComment?.text && (
                    <p className="text-indigo-500 text-xs italic mt-1">"{item.finalComment.text}"</p>
                  )}
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

  if (historyMonth) {
    if (!["MANAGER", "MAKER", "REVIEWER"].includes(role)) {
      return (
        <Layout title="Escrow Analysis">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
              <h3 className="text-gray-700 font-bold text-lg">Access Denied</h3>
            </div>
          </div>
        </Layout>
      );
    }
    if (historyLoading) {
      return (
        <Layout title="Escrow Analysis">
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-400 text-sm">Loading archived setup...</p>
          </div>
        </Layout>
      );
    }
    return (
      <Layout title="Escrow Analysis">
        <div className="max-w-full mx-auto px-8">
          <button onClick={() => navigate("/escrow-history")}
            className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all">
            ← Back to History
          </button>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <p className="text-xs font-bold text-gray-500">Approval Status</p>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
                Escrow Period: {historyConfig?.monthKey || historyMonth.replace(/_/g, " ")}
              </span>
              <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
                Completed &amp; Archived
              </span>
            </div>
          </div>

          {!historyConfig?.accounts || Object.keys(historyConfig.accounts).length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-gray-400 text-sm">No setup data found for this period.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-10">
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Landmark size={20} className="text-indigo-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 text-sm">Manager's Setup</h4>
                  <p className="text-gray-400 text-xs">Accounts, allowed inflow/outflow, and remarks configured by the Manager</p>
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(historyConfig.accounts).map(([accNo, cfg]) => (
                  <div key={accNo} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <p className="text-sm font-bold text-gray-800">
                      {historyConfig.accountDescriptions?.[accNo] || cfg.accountName} — {accNo}
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
                                {historyConfig.accountDescriptions?.[otherAcc] || otherAcc} ({otherAcc})
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
                                {historyConfig.accountDescriptions?.[otherAcc] || otherAcc} ({otherAcc})
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

                {(historyConfig.globalInflowRemarks?.length > 0 || historyConfig.globalOutflowRemarks?.length > 0) && (
                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <p className="text-xs font-bold text-gray-600 mb-2">Global Remark Options</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-bold text-green-700 mb-1.5">Inflow Remarks</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(historyConfig.globalInflowRemarks || []).map((tag, i) => (
                            <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{tag}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-red-700 mb-1.5">Outflow Remarks</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(historyConfig.globalOutflowRemarks || []).map((tag, i) => (
                            <span key={i} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={() => navigate(`/escrow-upload?month=${historyMonth}`)}
                className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all">
                View Maker's Details →
              </button>
            </div>
          )}
        </div>
      </Layout>
    );
  }

  if (statusLoading) {
    return (
      <Layout title="Escrow Analysis">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </Layout>
    );
  }

  if (!["MANAGER", "REVIEWER"].includes(role)) {
    return (
      <Layout title="Escrow Analysis">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
            <h3 className="text-gray-700 font-bold text-lg">Access Denied</h3>
            <p className="text-gray-400 text-sm mt-1">Only Managers and Reviewers can access this step of Escrow Analysis.</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Reviewer: always a read-only view of the Manager's setup, regardless of workflow stage.
  // Reviewer never sees/uses the editable Excel-upload form below — that stays Manager-only.
  if (role === "REVIEWER") {
    return (
      <Layout title="Escrow Analysis">
        <div id="live-cycle-anchor" className="max-w-full mx-auto px-8">
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
                    {!isLast && <div className={`flex-1 h-0.5 mx-2 mb-5 ${isDone ? "bg-green-400" : "bg-gray-200"}`} />}
                  </div>
                );
              })}
            </div>
          </div>

          {workflowStatus === ESCROW_STATUS.MANAGER_SETUP ? (
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <Clock size={40} className="text-blue-400 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Manager hasn't completed the setup yet.</p>
              </div>
            </div>
          ) : !viewConfig?.accounts || Object.keys(viewConfig.accounts).length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-gray-400 text-sm">No setup data found.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-10">
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Landmark size={20} className="text-indigo-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 text-sm">Manager's Setup</h4>
                  <p className="text-gray-400 text-xs">Accounts, allowed inflow/outflow, and remarks configured by the Manager</p>
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(viewConfig.accounts).map(([accNo, cfg]) => (
                  <div key={accNo} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <p className="text-sm font-bold text-gray-800">
                      {viewConfig.accountDescriptions?.[accNo] || cfg.accountName} — {accNo}
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
                                {viewConfig.accountDescriptions?.[otherAcc] || otherAcc} ({otherAcc})
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
                                {viewConfig.accountDescriptions?.[otherAcc] || otherAcc} ({otherAcc})
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

                {(viewConfig.globalInflowRemarks?.length > 0 || viewConfig.globalOutflowRemarks?.length > 0) && (
                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <p className="text-xs font-bold text-gray-600 mb-2">Global Remark Options</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-bold text-green-700 mb-1.5">Inflow Remarks</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(viewConfig.globalInflowRemarks || []).map((tag, i) => (
                            <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{tag}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-red-700 mb-1.5">Outflow Remarks</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(viewConfig.globalOutflowRemarks || []).map((tag, i) => (
                            <span key={i} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={() => navigate("/escrow-upload")}
                className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all">
                View Maker's Details →
              </button>
            </div>
          )}
        </div>

        <PastEscrowsPanel />
      </Layout>
    );
  }

  if (workflowStatus !== ESCROW_STATUS.MANAGER_SETUP) {
    const messages = {
      [ESCROW_STATUS.MAKER_INPUT]: "You've completed setup. Maker is currently uploading statements and tagging transactions.",
      [ESCROW_STATUS.REVIEWER_APPROVAL]: "This is currently with the Reviewer for approval.",
      [ESCROW_STATUS.MANAGER_APPROVAL]: "This is ready for your final approval.",
      [ESCROW_STATUS.COMPLETED]: "This escrow analysis has been completed and approved.",
    };
    return (
      <Layout title="Escrow Analysis">
        <div className="max-w-full mx-auto px-8">
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
                    {!isLast && <div className={`flex-1 h-0.5 mx-2 mb-5 ${isDone ? "bg-green-400" : "bg-gray-200"}`} />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center h-64">
            <div className="text-center max-w-md">
              <Clock size={48} className="text-blue-400 mx-auto mb-3" />
              <h3 className="text-gray-700 font-bold text-lg">Setup Already Completed</h3>
              <p className="text-gray-400 text-sm mt-1">{messages[workflowStatus]}</p>
              {workflowStatus === ESCROW_STATUS.MANAGER_APPROVAL && (
                <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
                  <button onClick={() => navigate("/escrow-upload")}
                    className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 shadow-sm transition-all">
                    View Full Details — Transactions
                  </button>
                  <button onClick={() => navigate("/escrow-summary")}
                    className="px-5 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all">
                    Go to Summary for Approval
                  </button>
                </div>
              )}
              {workflowStatus === ESCROW_STATUS.MAKER_INPUT && (
                <button onClick={handleRecallSetup}
                  className="mt-4 px-5 py-2.5 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-600 text-white shadow-lg transition-all">
                  Recall Setup — Edit Again
                </button>
              )}
              {(workflowStatus === ESCROW_STATUS.REVIEWER_APPROVAL) && (
                <button onClick={() => navigate("/escrow-upload")}
                  className="mt-4 px-5 py-2.5 rounded-xl font-bold text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 shadow-sm transition-all">
                  View Details Uploaded So Far
                </button>
              )}
            </div>
          </div>
        </div>
        <PastEscrowsPanel />
      </Layout>
    );
  }

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
      setStatus({ type: "error", message: "Only Excel files (.xlsx / .xls) are allowed!" });
      return;
    }
    setFile(selectedFile);
    setStatus(null);
    parseExcel(selectedFile);
  };

const emptyConfig = () => ({
  description: "",
  remark: "",
  allowedInflow: [],
  allowedOutflow: [],
  inflowRemarks: {},
  outflowRemarks: {},
  allInflowEnabled: false,
  allOutflowEnabled: false,
});

  const parseExcel = (excelFile) => {
    setParsing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        const parsedAccounts = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const accNo = String(row[2] || "").trim();
          const accName = String(row[3] || "").trim();
          const desc = String(row[4] || "").trim();

          if (!accNo || !accName) continue;
          if (accNo === "Total (A)" || accNo === "") continue;

          // Every account row is now kept - not just the "100%" one
          parsedAccounts.push({ accNo, accName, description: desc });
        }

        if (parsedAccounts.length === 0) {
          setStatus({ type: "error", message: "No accounts found in Excel. Please check the file!" });
          setParsing(false);
          return;
        }

        setAccounts(parsedAccounts);

        // Build default configs for every account
        const defaultConfigs = {};
        parsedAccounts.forEach(acc => {
          defaultConfigs[acc.accNo] = emptyConfig();
        });

        setStatus({ type: "success", message: `Excel parsed successfully! Found ${parsedAccounts.length} accounts.` });

        // Auto-load previous saved data if it exists
        try {
          const snap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
          if (snap.exists()) {
            const prev = snap.data();
            setGlobalInflowRemarks(prev.globalInflowRemarks || []);
            setGlobalOutflowRemarks(prev.globalOutflowRemarks || []);
            const prevAccounts = prev.accounts || {};

            parsedAccounts.forEach(acc => {
              if (prevAccounts[acc.accNo]) {
                defaultConfigs[acc.accNo] = {
                  description: prevAccounts[acc.accNo].description || "",
                  remark: prevAccounts[acc.accNo].remark || "",
                  allowedInflow: prevAccounts[acc.accNo].allowedInflow || [],
                  allowedOutflow: prevAccounts[acc.accNo].allowedOutflow || [],
                  inflowRemarks: prevAccounts[acc.accNo].inflowRemarks || {},
                  outflowRemarks: prevAccounts[acc.accNo].outflowRemarks || {},
                  allInflowEnabled: prevAccounts[acc.accNo].allInflowEnabled || false,
                  allOutflowEnabled: prevAccounts[acc.accNo].allOutflowEnabled || false,
                };
              }
            });
          }
        } catch (e) {
          console.error("Could not load previous escrow data:", e);
        }

        setConfigs(defaultConfigs);
      } catch (err) {
        setStatus({ type: "error", message: "Error reading Excel: " + err.message });
      }
      setParsing(false);
    };
    reader.readAsArrayBuffer(excelFile);
  };

  // ---- Per-account config helpers ----

  const updateConfigField = (accNo, field, value) => {
    setConfigs(prev => ({
      ...prev,
      [accNo]: { ...(prev[accNo] || emptyConfig()), [field]: value }
    }));
  };

  const toggleFlow = (accNo, type, otherAccNo) => {
    const key = type === "inflow" ? "allowedInflow" : "allowedOutflow";
    setConfigs(prev => {
      const cfg = prev[accNo] || emptyConfig();
      const list = cfg[key] || [];
      const updatedList = list.includes(otherAccNo)
        ? list.filter(a => a !== otherAccNo)
        : [...list, otherAccNo];
      return { ...prev, [accNo]: { ...cfg, [key]: updatedList } };
    });
  };

  const toggleAllFlag = (accNo, type) => {
  const key = type === "inflow" ? "allInflowEnabled" : "allOutflowEnabled";
  setConfigs(prev => {
    const cfg = prev[accNo] || emptyConfig();
    return { ...prev, [accNo]: { ...cfg, [key]: !cfg[key] } };
  });
};
const updateFlowRemark = (accNo, type, otherAccNo, value) => {
    const key = type === "inflow" ? "inflowRemarks" : "outflowRemarks";
    setConfigs(prev => {
      const cfg = prev[accNo] || emptyConfig();
      return {
        ...prev,
        [accNo]: { ...cfg, [key]: { ...(cfg[key] || {}), [otherAccNo]: value } }
      };
    });
  };

const handleSave = async () => {
  if (accounts.length === 0) {
    setStatus({ type: "error", message: "Please upload Excel first!" });
    return;
  }

  // Validation: every account must have at least 1 ticked inflow account
  // (or "All" enabled) and at least 1 ticked outflow account (or "All" enabled).
  for (const acc of accounts) {
    const cfg = configs[acc.accNo] || emptyConfig();
    const inflowOk = cfg.allInflowEnabled || cfg.allowedInflow.length > 0;
    const outflowOk = cfg.allOutflowEnabled || cfg.allowedOutflow.length > 0;
    if (!inflowOk) {
      alert(`Please select at least one Allowed Inflow account (or click "All") for ${acc.description || acc.accName} before continuing.`);
      return;
    }
    if (!outflowOk) {
      alert(`Please select at least one Allowed Outflow account (or click "All") for ${acc.description || acc.accName} before continuing.`);
      return;
    }
  }

  setSaving(true);
  setStatus(null);
  try {
      const accountsData = {};
      const accountDescriptions = {};

      accounts.forEach(acc => {
        const cfg = configs[acc.accNo] || emptyConfig();
        accountsData[acc.accNo] = {
          accountName: acc.accName,
          description: cfg.description,
          remark: cfg.remark,
          allowedInflow: cfg.allowedInflow,
          allowedOutflow: cfg.allowedOutflow,
          inflowRemarks: cfg.inflowRemarks,
          outflowRemarks: cfg.outflowRemarks,
          allInflowEnabled: cfg.allInflowEnabled,
          allOutflowEnabled: cfg.allOutflowEnabled,
        };
        accountDescriptions[acc.accNo] = acc.description;
      });

      await setDoc(doc(db, "projects", projectId, "escrow", "accounts"), {
        accounts: accountsData,
        accountDescriptions,
        globalInflowRemarks,
        globalOutflowRemarks,
        updatedAt: new Date().toISOString(),
      });

      // Hand off to Maker — this is what unlocks EscrowUpload.jsx for them
      await setEscrowStatus(projectId, ESCROW_STATUS.MAKER_INPUT, userProfile?.email || "");
      // Start tracking this cycle in History as "Pending"
      await ensureActiveHistoryEntry(projectId);
      // Clean up removed remarks from all transaction docs
      try {
        const docsSnap = await getDoc(doc(db, "projects", projectId, "escrow", "documents"));
        if (docsSnap.exists()) {
          const filesData = docsSnap.data();
          const uploadedFiles = filesData.files || [];

          const validInflowRemarks = globalInflowRemarks;
          const validOutflowRemarks = globalOutflowRemarks;

          for (const fileInfo of uploadedFiles) {
            const safeKey = (fileInfo.name || "").replace(/[^a-zA-Z0-9]/g, "_");
            try {
              const remarksSnap = await getDoc(doc(db, "projects", projectId, "escrow", "remarks_" + safeKey));
              if (remarksSnap.exists()) {
                const remarksData = remarksSnap.data();
                const cleanedInflow = (remarksData.inflow || []).map(row => ({
                  ...row,
                  remark: validInflowRemarks.includes(row.remark) ? row.remark : ""
                }));
                const cleanedOutflow = (remarksData.outflow || []).map(row => ({
                  ...row,
                  remark: validOutflowRemarks.includes(row.remark) ? row.remark : ""
                }));
                await setDoc(doc(db, "projects", projectId, "escrow", "remarks_" + safeKey), {
                  ...remarksData,
                  inflow: cleanedInflow,
                  outflow: cleanedOutflow,
                });
              }
            } catch (e) {
              console.error("Could not clean remarks for", fileInfo.name, e);
            }
          }
        }
      } catch (e) {
        console.error("Could not clean up remarks:", e);
      }
      setStatus({ type: "success", message: "Details saved successfully!" });
      setTimeout(() => {
        window.location.href = "/escrow-analysis";
      }, 1000);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
    setSaving(false);
  };

  return (
    <Layout title="Escrow Analysis">

      <div className="max-w-full mx-auto px-8">

        {/* Step 1 - Excel Upload */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet size={20} className="text-blue-600" />
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-sm">Upload Bank Statement Flow</h4>
              <p className="text-gray-400 text-xs">Upload Excel to fetch account details</p>
            </div>
          </div>

          <div
            className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center text-center cursor-pointer transition-all
              ${file ? "border-green-400 bg-green-50" : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50"}`}
            onClick={() => !file && inputRef.current.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => handleFileSelect(e.target.files[0])} />

            {file ? (
              <>
                <CheckCircle size={40} className="text-green-500 mb-3" />
                <p className="text-green-700 font-semibold text-sm">{file.name}</p>
                <p className="text-green-500 text-xs mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setAccounts([]); setConfigs({}); }}
                  className="mt-3 flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                  <X size={12} /> Remove
                </button>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
                  <FileSpreadsheet size={28} className="text-blue-600" />
                </div>
                <p className="text-gray-700 font-semibold text-sm">Upload Excel File</p>
                <p className="text-gray-400 text-xs mt-1">Bank Statement Flow Excel</p>
                <div className="mt-4 flex items-center gap-2 bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-lg">
                  <Upload size={13} /> Browse File
                </div>
                <p className="text-gray-300 text-xs mt-2">or drag & drop · .xlsx / .xls only</p>
              </>
            )}
          </div>

          {status && (
            <div className={`mt-3 p-3 rounded-xl text-xs font-medium flex items-center gap-2
              ${status.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {status.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {status.message}
            </div>
          )}
        </div>

        {/* Global Inflow / Outflow Remark Definitions */}
{accounts.length > 0 && (
  <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
    <div className="grid grid-cols-2 gap-6">
      <div>
        <label className="text-xs font-bold text-green-700 mb-2 block">Define remarks for Inflows</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {globalInflowRemarks.map((tag, i) => (
            <span key={i} className="flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full border border-green-300">
              {tag}
              <button onClick={() => setGlobalInflowRemarks(prev => prev.filter((_, idx) => idx !== i))}
                className="ml-1 text-green-500 hover:text-red-500 font-bold">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={inflowInput}
            onChange={(e) => setInflowInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inflowInput.trim()) {
                setGlobalInflowRemarks(prev => [...prev, inflowInput.trim()]);
                setInflowInput("");
              }
            }}
            placeholder="Type a remark and click Add"
            className="flex-1 border border-green-200 rounded-xl px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-300"
          />
          <button
            onClick={() => {
              if (inflowInput.trim()) {
                setGlobalInflowRemarks(prev => [...prev, inflowInput.trim()]);
                setInflowInput("");
              }
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl">
            Add
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-red-700 mb-2 block">Define remarks for Outflows</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {globalOutflowRemarks.map((tag, i) => (
            <span key={i} className="flex items-center gap-1 bg-red-100 text-red-700 text-xs font-semibold px-3 py-1 rounded-full border border-red-300">
              {tag}
              <button onClick={() => setGlobalOutflowRemarks(prev => prev.filter((_, idx) => idx !== i))}
                className="ml-1 text-red-500 hover:text-red-700 font-bold">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={outflowInput}
            onChange={(e) => setOutflowInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && outflowInput.trim()) {
                setGlobalOutflowRemarks(prev => [...prev, outflowInput.trim()]);
                setOutflowInput("");
              }
            }}
            placeholder="Type a remark and click Add"
            className="flex-1 border border-red-200 rounded-xl px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          <button
            onClick={() => {
              if (outflowInput.trim()) {
                setGlobalOutflowRemarks(prev => [...prev, outflowInput.trim()]);
                setOutflowInput("");
              }
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl">
            Add
          </button>
        </div>
      </div>
    </div>
  </div>
)}

{/* Step 2 - One Configure block per account found in the Excel */}
        {accounts.map((acc) => {
          const cfg = configs[acc.accNo] || emptyConfig();
          const otherAccounts = accounts.filter(a => a.accNo !== acc.accNo);

          return (
            <div key={acc.accNo} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">

              {/* Auto-fetched account header */}
              <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-blue-700 text-xs font-bold mb-2 flex items-center gap-2">
                  <Landmark size={14} />
                  {acc.description ? `${acc.description} — Auto Fetched` : "Account — Auto Fetched"}
                </p>
                <p className="text-blue-800 text-xs font-semibold">{acc.accNo}</p>
                <p className="text-blue-600 text-xs mt-1 mb-3">{acc.accName}</p>
                <label className="text-xs font-bold text-blue-700 mb-1 block">Remark</label>
                <input
                  type="text"
                  value={cfg.remark}
                  onChange={(e) => updateConfigField(acc.accNo, "remark", e.target.value)}
                  placeholder="As per Bank Statement"
                  className="w-full border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Landmark size={20} className="text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 text-sm">Configure Escrow Details</h4>
                  <p className="text-gray-400 text-xs">Set description and allowed flows</p>
                </div>
              </div>

              {/* Description */}
              <div className="mb-5">
                <label className="text-xs font-bold text-gray-600 mb-1 block">Description</label>
                <textarea
                  value={cfg.description}
                  onChange={(e) => updateConfigField(acc.accNo, "description", e.target.value)}
                  placeholder="Enter description..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                />
              </div>

              {/* Allowed Inflow - tick from the other accounts */}
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between cursor-pointer"
                  onClick={() => toggleDropdown(acc.accNo, "inflow")}>
                  <label className="text-xs font-bold text-gray-600">Allowed Inflow</label>
                  <span className="text-xs text-gray-400">
                    {openDropdowns[`${acc.accNo}_inflow`] ? "▲ Hide" : "▼ Show"}
                  </span>
                </div>
                {openDropdowns[`${acc.accNo}_inflow`] && (
                <div className="space-y-2">
                  {otherAccounts.map((other) => (
                    <div key={other.accNo}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all
                        ${cfg.allowedInflow.includes(other.accNo)
                          ? "bg-green-50 border-green-300"
                          : "bg-gray-50 border-gray-200"}`}>
                      <div className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => toggleFlow(acc.accNo, "inflow", other.accNo)}>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all
                          ${cfg.allowedInflow.includes(other.accNo) ? "bg-green-500 border-green-500" : "border-gray-300"}`} />
                        <div>
                          <p className="text-xs font-semibold text-gray-700">{other.accNo}</p>
                          <p className="text-xs text-gray-400">{other.description || other.accName}</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs font-bold text-gray-500">Remark</label>
                        <input
                          type="text"
                          value={cfg.inflowRemarks[other.accNo] || ""}
                          onChange={(e) => updateFlowRemark(acc.accNo, "inflow", other.accNo, e.target.value)}
                          placeholder="As per ESCROW Mechanism"
                          onClick={(e) => e.stopPropagation()}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-300 w-52"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                )}
                <button
                  onClick={() => toggleAllFlag(acc.accNo, "inflow")}
                  className={`mt-3 px-4 py-2 rounded-lg text-xs font-bold transition-all
                    ${cfg.allInflowEnabled
                      ? "bg-green-600 text-white shadow-md"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {cfg.allInflowEnabled ? "✓ All (Inflow) — ON" : "All"}
                </button>
              </div>

              {/* Allowed Outflow - tick from the other accounts */}
              <div className="mb-2">
                <div className="mb-2 flex items-center justify-between cursor-pointer"
                  onClick={() => toggleDropdown(acc.accNo, "outflow")}>
                  <label className="text-xs font-bold text-gray-600">Allowed Outflow</label>
                  <span className="text-xs text-gray-400">
                    {openDropdowns[`${acc.accNo}_outflow`] ? "▲ Hide" : "▼ Show"}
                  </span>
                </div>
                {openDropdowns[`${acc.accNo}_outflow`] && (
                <div className="space-y-2">
                  {otherAccounts.map((other) => (
                    <div key={other.accNo}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all
                        ${cfg.allowedOutflow.includes(other.accNo)
                          ? "bg-red-50 border-red-300"
                          : "bg-gray-50 border-gray-200"}`}>
                      <div className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => toggleFlow(acc.accNo, "outflow", other.accNo)}>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all
                          ${cfg.allowedOutflow.includes(other.accNo) ? "bg-red-500 border-red-500" : "border-gray-300"}`} />
                        <div>
                          <p className="text-xs font-semibold text-gray-700">{other.accNo}</p>
                          <p className="text-xs text-gray-400">{other.description || other.accName}</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs font-bold text-gray-500">Remark</label>
                        <input
                          type="text"
                          value={cfg.outflowRemarks[other.accNo] || ""}
                          onChange={(e) => updateFlowRemark(acc.accNo, "outflow", other.accNo, e.target.value)}
                          placeholder="As per ESCROW Mechanism"
                          onClick={(e) => e.stopPropagation()}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300 w-52"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                )}
                <button
                  onClick={() => toggleAllFlag(acc.accNo, "outflow")}
                  className={`mt-3 px-4 py-2 rounded-lg text-xs font-bold transition-all
                    ${cfg.allOutflowEnabled
                      ? "bg-red-600 text-white shadow-md"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {cfg.allOutflowEnabled ? "✓ All (Outflow) — ON" : "All"}
                </button>
              </div>
            </div>
          );
        })}

        {/* Single Save button for all account configs */}
        {accounts.length > 0 && (
          <button onClick={handleSave} disabled={saving}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all mb-10
              ${!saving ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><CheckCircle size={14} /> Save & Continue</>}
          </button>
        )}
      </div>

      <PastEscrowsPanel />
    </Layout>
  );
}