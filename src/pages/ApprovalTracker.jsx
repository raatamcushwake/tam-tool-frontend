import React, { useState, useEffect, useRef } from "react";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/common/Layout";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../services/firebase";
import {
  Upload, Send, ThumbsUp, ThumbsDown, Lock,
  Info, Building2, FileSpreadsheet, CheckCircle,
  AlertCircle, Clock, Filter
} from "lucide-react";
import {
  APPROVAL_STATUS_CONFIG,
  uploadRequiredApprovalsList,
  getRequiredApprovalsMetadata,
  submitApprovalForReview,
  getAllApprovalSubmissions,
  reviewerApproveApproval,
  reviewerRejectApproval,
  managerApproveApproval,
  managerRejectApproval,
} from "../services/ApprovalTrackerService";

const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function ApprovalTracker() {
  const { selectedProject } = useProject();
  const { currentUser } = useAuth();

  const isMaker    = selectedProject?.role === "MAKER";
  const isReviewer = selectedProject?.role === "REVIEWER";
  const isManager  = selectedProject?.role === "MANAGER";

  const projectId = selectedProject?.projectId;
  const projectStorageKey = selectedProject?.projectName || projectId;

  // ── State ──
  const [requiredMeta, setRequiredMeta]     = useState(null);
  const [requiredFile, setRequiredFile]     = useState(null);
  const [reqUploading, setReqUploading]     = useState(false);

  const [filledFile, setFilledFile]         = useState(null);
  const [parsedData, setParsedData]         = useState(null);
  const [parsing, setParsing]               = useState(false);

  const [periodLabel, setPeriodLabel]       = useState("");
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [selectedSub, setSelectedSub]       = useState(null);
  const [subData, setSubData]               = useState(null);
  const [actionLoading, setActionLoading]   = useState(false);
  const [subsLoading, setSubsLoading]       = useState(false);
  const [currentStatus, setCurrentStatus]   = useState(null);
  const [missingApprovals, setMissingApprovals] = useState([]);
  const [activeFilter, setActiveFilter] = useState(null);

  const makerCommentRef    = useRef("");
  const reviewerCommentRef = useRef("");
  const managerCommentRef  = useRef("");

  // ── Load on mount ──
  useEffect(() => {
    if (!projectId) return;
    getRequiredApprovalsMetadata(projectId).then(setRequiredMeta);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setSubsLoading(true);
    getAllApprovalSubmissions(projectId).then(subs => {
      setAllSubmissions(subs);
      setSubsLoading(false);
      if (isMaker && subs.length > 0) {
        setCurrentStatus(subs[0].status);
        setPeriodLabel(subs[0].period);
      }
    });
  }, [projectId, isMaker]);

  // ── Manager: upload required list ──
  const handleRequiredUpload = async () => {
    if (!requiredFile || !projectId) return;
    setReqUploading(true);
    try {
      // Parse first to validate
      const formData = new FormData();
      formData.append("file", requiredFile);
      const res = await fetch(`${apiUrl}/api/approval/parse-required`, {
        method: "POST", body: formData
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.detail);

      // Upload to Storage + save metadata to Firestore
      const uploadResult = await uploadRequiredApprovalsList(projectId, requiredFile);
      if (uploadResult.success) {
        alert(`✅ Required approvals list uploaded! ${result.total} items.`);
        getRequiredApprovalsMetadata(projectId).then(setRequiredMeta);
        setRequiredFile(null);
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setReqUploading(false);
    }
  };

  // ── Maker: parse filled sheet ──
  const handleParseFilledSheet = async () => {
    if (!filledFile) return;
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", filledFile);
      const res = await fetch(`${apiUrl}/api/approval/parse-filled`, {
        method: "POST", body: formData
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.detail);
      setParsedData(result);

      if (requiredMeta?.fileUrl && filledFile) {
  try {
    const reqRes = await fetch(requiredMeta.fileUrl, { mode: "cors" });
    const reqBlob = await reqRes.blob();
    const formData2 = new FormData();
    formData2.append("required_file", new File([reqBlob], "required.xlsx"));
    formData2.append("filled_file", filledFile);
    const compareRes = await fetch(`${apiUrl}/api/approval/compare`, {
      method: "POST", body: formData2
    });
    const compareResult = await compareRes.json();
    if (compareRes.ok) setMissingApprovals(compareResult.missing_approvals || []);
  } catch (e) {
    console.warn("Compare failed:", e);
  }
}
    } catch (e) {
      alert("Parse error: " + e.message);
    } finally {
      setParsing(false);
    }
  };

  // ── Maker: submit for review ──
  const handleSubmit = async () => {
    if (!parsedData || !periodLabel) {
      alert("Parse the sheet and enter a period label first.");
      return;
    }
    setActionLoading(true);
    try {
      // Upload xlsx to Storage
      let approvalFileUrl = "";
      const fileRef = ref(storage,
        `projects/${projectStorageKey}/pendingApprovalBills/${periodLabel.replace(/\s+/g,"_")}.xlsx`);
      await uploadBytes(fileRef, filledFile);
      approvalFileUrl = await getDownloadURL(fileRef);

      // Upload JSON to Storage
      const jsonBlob = new Blob([JSON.stringify(parsedData)], { type: "application/json" });
      const jsonRef = ref(storage,
        `projects/${projectStorageKey}/pendingApprovalData/${periodLabel.replace(/\s+/g,"_")}.json`);
      await uploadBytes(jsonRef, jsonBlob);
      const approvalDataUrl = await getDownloadURL(jsonRef);

      const result = await submitApprovalForReview(projectId, periodLabel, {
        submittedBy: currentUser.email,
        makerComment: makerCommentRef.current,
        approvalDataUrl,
        approvalFileUrl,
        summary: parsedData.summary,
      });

      if (result.success) {
        setCurrentStatus("PENDING_REVIEW");
        alert("✅ Submitted for Review!");
        getAllApprovalSubmissions(projectId).then(setAllSubmissions);
      }
    } catch (e) {
      alert("Submit error: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Load submission data from Storage ──
  const loadSubmissionData = async (sub) => {
  setSelectedSub(sub);
  setSubData(null);
  setMissingApprovals([]);
  setActiveFilter(null);
  try {
    const res = await fetch(sub.approvalDataUrl, { mode: "cors" });
    const json = await res.json();
    setSubData(json);

    // Compare with required list — only if approvalFileUrl still exists (pending submissions)
    if (requiredMeta?.fileUrl && sub.approvalFileUrl && sub.status !== "APPROVED") {
      try {
        const reqRes = await fetch(requiredMeta.fileUrl, { mode: "cors" });
        const reqBlob = await reqRes.blob();
        const filledRes = await fetch(sub.approvalFileUrl, { mode: "cors" });
        const filledBlob = await filledRes.blob();

        const formData = new FormData();
        formData.append("required_file", new File([reqBlob], "required.xlsx"));
        formData.append("filled_file", new File([filledBlob], "filled.xlsx"));

        const compareRes = await fetch(`${apiUrl}/api/approval/compare`, {
          method: "POST", body: formData
        });
        const compareResult = await compareRes.json();
        if (compareRes.ok) {
          setMissingApprovals(compareResult.missing_approvals || []);
        }
      } catch (e) {
        console.warn("Compare failed:", e);
      }
    }
  } catch (e) {
    alert("Failed to load submission data.");
  }
};

  // ── Reviewer actions ──
  const handleReviewerAction = async (approve) => {
    if (!selectedSub) return;
    setActionLoading(true);
    if (approve) {
      await reviewerApproveApproval(projectId, selectedSub.period, currentUser.email, reviewerCommentRef.current);
      alert("✅ Approved! Sent to Manager.");
    } else {
      await reviewerRejectApproval(projectId, selectedSub.period, currentUser.email, reviewerCommentRef.current);
      alert("❌ Rejected.");
    }
    reviewerCommentRef.current = "";
    getAllApprovalSubmissions(projectId).then(setAllSubmissions);
    setActionLoading(false);
  };

  // ── Manager actions ──
  const handleManagerAction = async (approve) => {
    if (!selectedSub) return;
    setActionLoading(true);
    try {
      const periodKey = selectedSub.period.replace(/\s+/g, "_");
      if (approve) {
        // Fetch JSON from pending
        const res = await fetch(selectedSub.approvalDataUrl);
        const jsonData = await res.json();

        // Upload to approvedApprovalData
        const jsonBlob = new Blob([JSON.stringify(jsonData)], { type: "application/json" });
        const approvedRef = ref(storage, `projects/${projectStorageKey}/approvedApprovalData/${periodKey}.json`);
        await uploadBytes(approvedRef, jsonBlob);
        const approvedDataUrl = await getDownloadURL(approvedRef);

        // Delete from pending
        try {
          await deleteObject(ref(storage, `projects/${projectStorageKey}/pendingApprovalData/${periodKey}.json`));
          await deleteObject(ref(storage, `projects/${projectStorageKey}/pendingApprovalBills/${periodKey}.xlsx`));
        } catch (e) { console.warn("Delete pending failed:", e); }

        await managerApproveApproval(projectId, selectedSub.period, currentUser.email, managerCommentRef.current, approvedDataUrl);
        alert("✅ Final Approved & Frozen!");
      } else {
        await managerRejectApproval(projectId, selectedSub.period, currentUser.email, managerCommentRef.current);
        alert("❌ Rejected.");
      }
      managerCommentRef.current = "";
      getAllApprovalSubmissions(projectId).then(setAllSubmissions);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Status badge color ──
  const getStatusColor = (status) => {
    const map = {
      "Valid": "bg-green-100 text-green-700",
      "Expired": "bg-red-100 text-red-700",
      "Expiring Soon": "bg-amber-100 text-amber-700",
      "NA": "bg-gray-100 text-gray-500",
    };
    return map[status] || "bg-gray-100 text-gray-500";
  };

  // ── Render approval items table ──
  const renderApprovalTable = (items, missing = []) => (
  <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm mt-4">
    {missing.length > 0 && (
      <div className="bg-red-50 border-b border-red-200 p-3">
        <p className="text-xs font-bold text-red-600 mb-1">
          ⚠ {missing.length} approval(s) from required list are MISSING in this submission:
        </p>
        <ul className="list-disc list-inside space-y-0.5">
          {missing.map((name, i) => (
            <li key={i} className="text-xs text-red-500 capitalize">{name}</li>
          ))}
        </ul>
      </div>
    )}
    <table className="w-full text-[13px] text-left border-collapse">
      <thead className="bg-gray-50">
        <tr>
          {["Sr No","Approval Name","Authority","Approval Document","Coverage","Approval Date","Validity","Expiry Date","Status","Key Observation","Provided by Developer","CWI Comments"].map(h => (
            <th key={h} className="px-4 py-3 border-b border-gray-200 font-bold text-gray-500 text-xs uppercase whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {items.map((item, i) => {
          const isMissing = missing.includes(item.approval_name?.toLowerCase());
          return (
            <tr key={i} className={isMissing ? "bg-red-50" : "hover:bg-gray-50"}>
              <td className="px-4 py-3">{item.sr_no}</td>
              <td className="px-4 py-3 font-semibold">
                {item.approval_name}
                {isMissing && <span className="ml-2 text-xs text-red-500 font-bold">⚠ Missing</span>}
              </td>
              <td className="px-4 py-3">{item.authority_name}</td>
              <td className="px-4 py-3">{item.approval_document}</td>
              <td className="px-4 py-3">{item.coverage}</td>
              <td className="px-4 py-3">{item.approval_date}</td>
              <td className="px-4 py-3">{item.validity_period}</td>
              <td className="px-4 py-3">{item.expiry_date}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(item.status)}`}>
                  {item.status}
                </span>
              </td>
              <td className="px-4 py-3">{item.key_observation}</td>
              <td className="px-4 py-3">{item.provided_by_developer}</td>
              <td className="px-4 py-3 text-gray-500">{item.cwi_comments}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

  // ── Render submissions list ──
  const renderSubmissionsList = () => (
    <div className="mb-6">
      <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">
        {isMaker ? "My Submissions" : isReviewer ? "Approval Submissions — Pending Review" : "Approval Submissions — Pending Approval"}
      </p>
      {subsLoading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      ) : allSubmissions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <FileSpreadsheet size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold">No submissions yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allSubmissions.map((sub, idx) => (
            <div key={idx}
              onClick={() => loadSubmissionData(sub)}
              className={`bg-white border rounded-2xl p-5 cursor-pointer hover:border-indigo-300 transition-all shadow-sm
                ${selectedSub?.id === sub.id ? "border-indigo-500 bg-indigo-50/30" : "border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-gray-900 text-base">{sub.period}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    By: {sub.submittedBy} · {new Date(sub.submittedAt).toLocaleDateString("en-GB")}
                  </p>
                  {sub.makerComment && <p className="text-xs text-blue-600 mt-1 italic">💬 "{sub.makerComment}"</p>}
                  {sub.reviewerComment && <p className="text-xs text-purple-600 mt-1 italic">👁 "{sub.reviewerComment}"</p>}
                  {sub.rejectionComment && <p className="text-xs text-red-500 mt-1 italic">❌ "{sub.rejectionComment}"</p>}
                  {sub.summary && (
                    <div className="flex gap-3 mt-2">
                      <span className="text-xs text-green-600 font-bold">✓ {sub.summary.valid} Valid</span>
                      <span className="text-xs text-red-600 font-bold">✗ {sub.summary.expired} Expired</span>
                      <span className="text-xs text-amber-600 font-bold">⚠ {sub.summary.expiring_soon} Expiring</span>
                      <span className="text-xs text-gray-500 font-bold">— {sub.summary.na} NA</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${APPROVAL_STATUS_CONFIG[sub.status]?.color}`}>
                    {APPROVAL_STATUS_CONFIG[sub.status]?.label}
                  </span>
                  {selectedSub?.id === sub.id && (
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-lg">Viewing</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── RENDER ───
  return (
    <Layout title="Approval Tracker">
      <div className="mb-6">
        <h3 className="text-gray-800 font-bold text-lg">Approval Tracker</h3>
        <p className="text-gray-400 text-sm mt-1">
          {isMaker ? "Upload filled approvals and submit for review." :
           isReviewer ? "Review submitted approvals." :
           "Upload required approvals list and give final approval."}
        </p>
      </div>

      {/* ── MANAGER ── */}
      {isManager && (
        <>
  
          {/* Required list upload */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Required Approvals List</p>
            <div className={`p-4 rounded-xl border mb-4 ${requiredMeta ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              {requiredMeta ? (
                <>
                  <p className="text-xs text-green-600 font-semibold">{requiredMeta.fileName}</p>
                  <p className="text-xs text-gray-400">Uploaded: {new Date(requiredMeta.uploadedAt).toLocaleDateString("en-GB")} · By: {requiredMeta.uploadedBy}</p>
                </>
              ) : (
                <p className="text-xs text-red-500 font-semibold">⚠ No required approvals list uploaded yet</p>
              )}
            </div>
            <label className="h-24 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center cursor-pointer hover:border-indigo-400 transition-colors mb-3">
              {requiredFile
                ? <span className="text-indigo-600 text-sm font-bold">{requiredFile.name}</span>
                : <span className="text-gray-400 text-sm">Click to upload Required Approvals List (.xlsx)</span>}
              <input type="file" className="hidden" accept=".xlsx,.xls"
                onChange={e => e.target.files[0] && setRequiredFile(e.target.files[0])} />
            </label>
            <button onClick={handleRequiredUpload} disabled={!requiredFile || reqUploading}
              className={`w-full py-3 rounded-xl font-bold text-sm ${requiredFile && !reqUploading ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {reqUploading ? "Uploading..." : "Upload Required List"}
            </button>
          </div>

          {renderSubmissionsList()}

          {selectedSub && (
            <>
              {selectedSub.status === "PENDING_MANAGER" && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
                  <p className="text-sm font-black uppercase text-gray-400 mb-3">Manager Final Action — {selectedSub.period}</p>
                  <textarea onChange={e => { managerCommentRef.current = e.target.value; }}
                    placeholder="Add comment (optional)..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none resize-none mb-3" rows={2}/>
                  <div className="flex gap-3">
                    <button onClick={() => handleManagerAction(true)} disabled={actionLoading}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                      <ThumbsUp size={15}/> Final Approve & Freeze
                    </button>
                    <button onClick={() => handleManagerAction(false)} disabled={actionLoading}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                      <ThumbsDown size={15}/> Reject
                    </button>
                  </div>
                </div>
              )}
              {subData && renderApprovalTable(subData.items || [], missingApprovals)}
            </>
          )}
        </>
      )}

      {/* ── REVIEWER ── */}
      {isReviewer && (
        <>
          {renderSubmissionsList()}
          {selectedSub && (
            <>
              {selectedSub.status === "PENDING_REVIEW" && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
                  <p className="text-sm font-black uppercase text-gray-400 mb-3">Reviewer Action — {selectedSub.period}</p>
                  <textarea onChange={e => { reviewerCommentRef.current = e.target.value; }}
                    placeholder="Add comment (optional)..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none resize-none mb-3" rows={2}/>
                  <div className="flex gap-3">
                    <button onClick={() => handleReviewerAction(true)} disabled={actionLoading}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                      <ThumbsUp size={15}/> Approve → Send to Manager
                    </button>
                    <button onClick={() => handleReviewerAction(false)} disabled={actionLoading}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                      <ThumbsDown size={15}/> Reject → Back to Maker
                    </button>
                  </div>
                </div>
              )}
              {subData && renderApprovalTable(subData.items || [], missingApprovals)}
            </>
          )}
        </>
      )}

      {/* ── MAKER ── */}
      {isMaker && (
        <>
          {renderSubmissionsList()}

{/* Show filter boxes + table when maker clicks a submission */}
{selectedSub && subData && (
  <>
    <div className="grid grid-cols-5 gap-4 mb-2 mt-4">
      {[
        { label: "Valid", key: "Valid", val: (subData.items||[]).filter(i=>i.status==="Valid").length, color: "text-green-600 border-green-200 bg-green-50", activeColor: "ring-2 ring-green-400" },
        { label: "Expired", key: "Expired", val: (subData.items||[]).filter(i=>i.status==="Expired").length, color: "text-red-600 border-red-200 bg-red-50", activeColor: "ring-2 ring-red-400" },
        { label: "Expiring Soon", key: "Expiring Soon", val: (subData.items||[]).filter(i=>i.status==="Expiring Soon").length, color: "text-amber-600 border-amber-200 bg-amber-50", activeColor: "ring-2 ring-amber-400" },
        { label: "NA", key: "NA", val: (subData.items||[]).filter(i=>i.status==="NA").length, color: "text-gray-600 border-gray-200 bg-gray-50", activeColor: "ring-2 ring-gray-400" },
        { label: "Missing", key: "Missing", val: missingApprovals.length, color: "text-red-700 border-red-300 bg-red-100", activeColor: "ring-2 ring-red-600" },
      ].map(({ label, key, val, color, activeColor }) => (
        <div key={label}
          onClick={() => setActiveFilter(activeFilter === key ? null : key)}
          className={`border rounded-xl p-4 cursor-pointer transition-all ${color} ${activeFilter === key ? activeColor : "hover:opacity-80"}`}>
          <p className="text-xs font-black uppercase">{label}</p>
          <p className="text-2xl font-black">{val}</p>
          {activeFilter === key && <p className="text-xs mt-1 font-bold">● Filtering</p>}
        </div>
      ))}
    </div>

    {activeFilter === "Missing" ? (
      <div className="border border-red-200 rounded-xl bg-red-50 p-4 mt-4">
        <p className="text-xs font-black uppercase text-red-700 mb-3">
          ⚠ {missingApprovals.length} Missing Approval(s)
        </p>
        {missingApprovals.length === 0 ? (
          <p className="text-sm text-green-600 font-semibold">✅ No missing approvals!</p>
        ) : (
          <ul className="space-y-2">
            {missingApprovals.map((name, i) => (
              <li key={i} className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-4 py-3">
                <span className="text-red-500 font-black text-sm">✗</span>
                <span className="text-sm font-semibold text-red-700 capitalize">{name}</span>
                <span className="ml-auto text-xs text-red-400 font-bold">NOT SUBMITTED</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    ) : (
      renderApprovalTable(
        activeFilter
          ? (subData.items || []).filter(item => item.status === activeFilter)
          : (subData.items || []),
        missingApprovals
      )
    )}
  </>
)}

{/* Required list status */}
<div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Required Approvals Status</p>
            <div className={`p-4 rounded-xl border ${requiredMeta ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              {requiredMeta ? (
                <p className="text-xs text-green-600 font-semibold">✅ {requiredMeta.fileName} — uploaded by manager</p>
              ) : (
                <p className="text-xs text-red-500 font-semibold">⚠ Manager hasn't uploaded required approvals list yet</p>
              )}
            </div>
          </div>

          {/* Period label */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mb-6">
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Period Label</label>
            <input type="text" placeholder='e.g., "MAY 2026"' value={periodLabel}
              onChange={e => setPeriodLabel(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"/>
            {currentStatus && (
              <div className={`mt-3 px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 ${APPROVAL_STATUS_CONFIG[currentStatus]?.color}`}>
                <Lock size={12}/> {periodLabel} Status: {APPROVAL_STATUS_CONFIG[currentStatus]?.label}
              </div>
            )}
          </div>

          {/* Upload filled sheet */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
            <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-4">
              <Upload className="text-emerald-500" size={20}/>
              <h3 className="text-lg font-bold text-gray-900">Upload Filled Approvals Sheet</h3>
            </div>
            <label className="h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 transition-colors">
              {filledFile
                ? <span className="text-emerald-600 text-sm font-bold">{filledFile.name}</span>
                : <span className="text-gray-400 text-sm">Click to upload Filled Approvals (.xlsx)</span>}
              <input type="file" className="hidden" accept=".xlsx,.xls"
                onChange={e => { if(e.target.files[0]) { setFilledFile(e.target.files[0]); setParsedData(null); }}} />
            </label>
            {filledFile && !parsedData && (
              <button onClick={handleParseFilledSheet} disabled={parsing}
                className="w-full mt-4 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700">
                {parsing ? "Parsing..." : "Parse & Preview"}
              </button>
            )}
          </div>

          {/* Preview parsed data */}
          {parsedData && (
            <>
              <div className="grid grid-cols-5 gap-4 mb-6">
  {[
    { label: "Valid", key: "Valid", val: parsedData.summary.valid, color: "text-green-600 border-green-200 bg-green-50", activeColor: "ring-2 ring-green-400" },
    { label: "Expired", key: "Expired", val: parsedData.summary.expired, color: "text-red-600 border-red-200 bg-red-50", activeColor: "ring-2 ring-red-400" },
    { label: "Expiring Soon", key: "Expiring Soon", val: parsedData.summary.expiring_soon, color: "text-amber-600 border-amber-200 bg-amber-50", activeColor: "ring-2 ring-amber-400" },
    { label: "NA", key: "NA", val: parsedData.summary.na, color: "text-gray-600 border-gray-200 bg-gray-50", activeColor: "ring-2 ring-gray-400" },
    { label: "Missing", key: "Missing", val: missingApprovals.length, color: "text-red-700 border-red-300 bg-red-100", activeColor: "ring-2 ring-red-600" },
  ].map(({ label, key, val, color, activeColor }) => (
    <div key={label}
      onClick={() => setActiveFilter(activeFilter === key ? null : key)}
      className={`border rounded-xl p-4 cursor-pointer transition-all ${color} ${activeFilter === key ? activeColor : "hover:opacity-80"}`}>
      <p className="text-xs font-black uppercase">{label}</p>
      <p className="text-2xl font-black">{val}</p>
      {activeFilter === key && <p className="text-xs mt-1 font-bold">● Filtering</p>}
    </div>
  ))}
</div>

              {activeFilter === "Missing" ? (
  <div className="border border-red-200 rounded-xl bg-red-50 p-4 mt-4">
    <p className="text-xs font-black uppercase text-red-700 mb-3">
      ⚠ {missingApprovals.length} Missing Approval(s) — Present in Required List but NOT in your submission
    </p>
    {missingApprovals.length === 0 ? (
      <p className="text-sm text-green-600 font-semibold">✅ No missing approvals!</p>
    ) : (
      <ul className="space-y-2">
        {missingApprovals.map((name, i) => (
          <li key={i} className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-4 py-3">
            <span className="text-red-500 font-black text-sm">✗</span>
            <span className="text-sm font-semibold text-red-700 capitalize">{name}</span>
            <span className="ml-auto text-xs text-red-400 font-bold">NOT SUBMITTED</span>
          </li>
        ))}
      </ul>
    )}
  </div>
) : (
  renderApprovalTable(
    activeFilter
      ? parsedData.items.filter(item => item.status === activeFilter)
      : parsedData.items,
    missingApprovals
  )
)}

              {/* Submit */}
              <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Send size={16} className="text-indigo-600"/>
                  <p className="text-sm font-black uppercase text-indigo-600">Submit for Review</p>
                </div>
                <textarea onChange={e => { makerCommentRef.current = e.target.value; }}
                  placeholder="Add comment for reviewer (optional)..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none resize-none mb-3"
                  rows={2}
                  disabled={currentStatus === "PENDING_REVIEW" || currentStatus === "PENDING_MANAGER"}/>
                <button onClick={handleSubmit}
                  disabled={!periodLabel || actionLoading || currentStatus === "PENDING_REVIEW" || currentStatus === "PENDING_MANAGER"}
                  className={`w-full font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm
                    ${(!periodLabel || actionLoading || currentStatus === "PENDING_REVIEW" || currentStatus === "PENDING_MANAGER")
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}>
                  {actionLoading ? "Submitting..." :
                   currentStatus === "PENDING_REVIEW" ? "⏳ Awaiting Review" :
                   currentStatus === "PENDING_MANAGER" ? "⏳ Awaiting Manager" :
                   <><Send size={14}/> Submit for Review</>}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  );
}