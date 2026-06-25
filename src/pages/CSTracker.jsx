import React, { useState, useEffect, useRef } from "react";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/common/Layout";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../services/firebase";
import { Upload, Send, ThumbsUp, ThumbsDown, FileSpreadsheet } from "lucide-react";
import {
  CS_STATUS_CONFIG,
  submitCSTrackerForReview,
  getAllCSSubmissions,
  reviewerApproveCS,
  reviewerRejectCS,
  managerApproveCS,
  managerRejectCS,
} from "../services/CSTrackerService";

const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function CSTracker() {
  const { selectedProject } = useProject();
  const { currentUser } = useAuth();

  const isMaker    = selectedProject?.role === "MAKER";
  const isReviewer = selectedProject?.role === "REVIEWER";
  const isManager  = selectedProject?.role === "MANAGER";

  const projectId = selectedProject?.projectId;
  const projectStorageKey = selectedProject?.projectName || projectId;

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
  const [activeFilter, setActiveFilter]     = useState(null);
  const [rowComments, setRowComments]           = useState({});
  const [rowAttachments, setRowAttachments]     = useState({});
  const [rowAttachmentUrls, setRowAttachmentUrls] = useState({});

  const makerCommentRef    = useRef("");
  const reviewerCommentRef = useRef("");
  const managerCommentRef  = useRef("");

  useEffect(() => {
    if (!projectId) return;
    setSubsLoading(true);
    getAllCSSubmissions(projectId).then(subs => {
      setAllSubmissions(subs);
      setSubsLoading(false);
      if (isMaker && subs.length > 0) {
        setCurrentStatus(subs[0].status);
        setPeriodLabel(subs[0].period);
      }
    });
  }, [projectId, isMaker]);

  const handleParseSheet = async () => {
    if (!filledFile) return;
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", filledFile);
      const res = await fetch(`${apiUrl}/api/cs-tracker/parse`, { method: "POST", body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.detail);
      setParsedData(result);
      setActiveFilter(null);
    } catch (e) {
      alert("Parse error: " + e.message);
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async () => {
    if (!parsedData || !periodLabel) {
      alert("Parse the sheet and enter a period label first.");
      return;
    }
    const missingRemarks = (parsedData.items || [])
      .filter(item => item.computed_status === "Pending" && !(rowComments[item.sr_no] || "").trim());
    if (missingRemarks.length > 0) {
      alert(`Please add a remark for all Pending rows before submitting. Missing remark for row(s): ${missingRemarks.map(m => m.sr_no).join(", ")}`);
      return;
    }
    setActionLoading(true);
    try {
      const fileRef = ref(storage, `projects/${projectStorageKey}/pendingCSBills/${periodLabel.replace(/\s+/g,"_")}.xlsx`);
      await uploadBytes(fileRef, filledFile);
      const csFileUrl = await getDownloadURL(fileRef);

      // Upload attachments first and collect URLs
      const attachmentUrls = {};
      for (const [srNo, files] of Object.entries(rowAttachments)) {
  const urls = [];
  const names = [];
  for (const file of files) {
    try {
      const attRef = ref(storage, `projects/${projectStorageKey}/pendingCSAttachments/${periodLabel.replace(/\s+/g,"_")}_row${srNo}_${file.name}`);
      await uploadBytes(attRef, file);
      urls.push(await getDownloadURL(attRef));
      names.push(file.name);
    } catch(e) { console.error("Attachment upload failed:", e); }
  }
  attachmentUrls[srNo] = { urls, names };
}

      // Merge comments and attachment urls into items
      const enrichedItems = (parsedData.items || []).map((item) => ({
        ...item,
        comment: rowComments[item.sr_no] || "",
        attachment_urls: attachmentUrls[item.sr_no]?.urls || [],
        attachment_names: attachmentUrls[item.sr_no]?.names || [],
      }));
      const enrichedData = { ...parsedData, items: enrichedItems };

      const jsonBlob = new Blob([JSON.stringify(enrichedData)], { type: "application/json" });
      const jsonRef = ref(storage, `projects/${projectStorageKey}/pendingCSData/${periodLabel.replace(/\s+/g,"_")}.json`);
      await uploadBytes(jsonRef, jsonBlob);
      const csDataUrl = await getDownloadURL(jsonRef);

      const result = await submitCSTrackerForReview(projectId, periodLabel, {
        submittedBy: currentUser.email,
        makerComment: makerCommentRef.current,
        csDataUrl,
        csFileUrl,
        summary: parsedData.summary,
      });

      if (result.success) {
        setCurrentStatus("PENDING_REVIEW");
        setRowComments({});
        setRowAttachments({});
        setRowAttachmentUrls({});
        alert("✅ Submitted for Review!");
        getAllCSSubmissions(projectId).then(setAllSubmissions);
      }
    } catch (e) {
      alert("Submit error: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const loadSubmissionData = async (sub) => {
    setSelectedSub(sub);
    setSubData(null);
    setActiveFilter(null);
    try {
      const res = await fetch(sub.csDataUrl, { mode: "cors" });
      const json = await res.json();
      setSubData(json);
    } catch (e) {
      alert("Failed to load submission data.");
    }
  };

  const handleReviewerAction = async (approve) => {
    if (!selectedSub) return;
    setActionLoading(true);
    if (approve) {
      await reviewerApproveCS(projectId, selectedSub.period, currentUser.email, reviewerCommentRef.current);
      alert("✅ Approved! Sent to Manager.");
    } else {
      await reviewerRejectCS(projectId, selectedSub.period, currentUser.email, reviewerCommentRef.current);
      alert("❌ Rejected.");
    }
    reviewerCommentRef.current = "";
    getAllCSSubmissions(projectId).then(setAllSubmissions);
    setActionLoading(false);
  };

  const handleManagerAction = async (approve) => {
    if (!selectedSub) return;
    setActionLoading(true);
    try {
      const periodKey = selectedSub.period.replace(/\s+/g, "_");
      if (approve) {
        const res = await fetch(selectedSub.csDataUrl);
        const jsonData = await res.json();
        const jsonBlob = new Blob([JSON.stringify(jsonData)], { type: "application/json" });
        const approvedRef = ref(storage, `projects/${projectStorageKey}/approvedCSData/${periodKey}.json`);
        await uploadBytes(approvedRef, jsonBlob);
        const approvedDataUrl = await getDownloadURL(approvedRef);
        try {
          await deleteObject(ref(storage, `projects/${projectStorageKey}/pendingCSData/${periodKey}.json`));
          await deleteObject(ref(storage, `projects/${projectStorageKey}/pendingCSBills/${periodKey}.xlsx`));
        } catch (e) { console.warn("Delete pending failed:", e); }
        await managerApproveCS(projectId, selectedSub.period, currentUser.email, managerCommentRef.current, approvedDataUrl);
        alert("✅ Final Approved & Frozen!");
      } else {
        await managerRejectCS(projectId, selectedSub.period, currentUser.email, managerCommentRef.current);
        alert("❌ Rejected.");
      }
      managerCommentRef.current = "";
      getAllCSSubmissions(projectId).then(setAllSubmissions);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status) => ({
    "Pending":  "bg-yellow-100 text-yellow-700",
    "On Going": "bg-blue-100 text-blue-700",
    "Closed":   "bg-green-100 text-green-700",
    "NA":       "bg-gray-100 text-gray-500",
}[status] || "bg-gray-100 text-gray-500");

  const renderSummaryBoxes = (summary, items) => {
    const boxes = [
  { label: "Pending",  key: "Pending",  val: summary.pending,  overdueVal: summary.pending_overdue, color: "text-yellow-700 border-yellow-300 bg-yellow-50", activeColor: "ring-2 ring-yellow-500" },
  { label: "On Going", key: "On Going", val: summary.on_going, color: "text-blue-700 border-blue-300 bg-blue-50",    activeColor: "ring-2 ring-blue-500" },
  { label: "Closed",   key: "Closed",   val: summary.closed,   color: "text-green-700 border-green-300 bg-green-50", activeColor: "ring-2 ring-green-500" },
  { label: "NA",       key: "NA",       val: summary.na,       color: "text-gray-600 border-gray-300 bg-gray-50",    activeColor: "ring-2 ring-gray-400" },
];
    return (
      <div className="grid grid-cols-5 gap-3 mb-4 mt-4">
        {boxes.map(({ label, key, val, overdueVal, color, activeColor }) => (
          <div key={key}
  onClick={() => setActiveFilter(activeFilter === key ? null : key)}
  className={`border rounded-xl p-3 cursor-pointer transition-all ${color} ${activeFilter === key ? activeColor : "hover:opacity-80"}`}>
  <p className="text-xs font-black uppercase">{label}</p>
  <p className="text-2xl font-black">{val}</p>
  {label === "Pending" && overdueVal > 0 && (
    <p className="text-xs font-bold text-red-600 mt-1">⚠ {overdueVal} Overdue</p>
  )}
  {activeFilter === key && <p className="text-xs mt-1 font-bold">● Filtering</p>}
</div>
        ))}
      </div>
    );
  };

  const renderTable = (items) => {
    const filtered = activeFilter
  ? activeFilter === "Pending"
    ? items.filter(i => i.computed_status === "Pending" || i.computed_status === "Overdue")
    : items.filter(i => i.computed_status === activeFilter)
  : items;
    return (
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm mt-2">
        <table className="w-full text-[13px] text-left border-collapse">
          <thead className="bg-gray-50">
            <tr>
              {["Sr No", "Description", "Due Date", "Compliance Date", "Status", "Overdue Days", "Remarks", "Comments", "Attachment"].map(h => (
        <th key={h} className="px-4 py-3 border-b border-gray-200 font-bold text-gray-500 text-xs uppercase whitespace-nowrap">{h}</th>
      ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((item, i) => (
              <tr key={i} className={item.computed_status === "Overdue" ? "bg-red-50" : "hover:bg-gray-50"}>
                <td className="px-4 py-3">{item.sr_no}</td>
                <td className="px-4 py-3 max-w-xs">{item.description}</td>
                <td className="px-4 py-3 whitespace-nowrap">{item.due_date}</td>
                <td className="px-4 py-3 whitespace-pre-line text-xs">{item.compliance_date}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap ${getStatusColor(item.computed_status)}`}>
                    {item.computed_status}
                </span>
                </td>
                <td className="px-4 py-3">
  {item.computed_status === "Pending" && Number(item.overdue_days) > 0
    ? <span className="text-red-600 font-bold">{Number(item.overdue_days)} days overdue</span>
    : "—"}
</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{item.remarks}</td>
                <td className="px-4 py-3 min-w-[200px]">
                  {isMaker && !selectedSub ? (
                    <textarea
                      value={rowComments[item.sr_no] || ""}
                      onChange={e => setRowComments(p => ({ ...p, [item.sr_no]: e.target.value }))}
                      placeholder="Add comment..."
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs resize-none focus:outline-none focus:border-indigo-400"
                      rows={2}
                    />
                  ) : (
                    <span className="text-xs text-gray-600">{item.comment || "—"}</span>
                  )}
                </td>
                <td className="px-4 py-3 min-w-[180px]">
                  {isMaker && !selectedSub ? (
  <div className="flex flex-col gap-1">
    <label className="cursor-pointer text-xs text-indigo-600 font-bold border border-indigo-300 rounded-lg px-2 py-1 hover:bg-indigo-50 text-center">
      📎 Attach File(s)
      <input type="file" className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
        multiple
        onChange={e => {
          const files = Array.from(e.target.files);
          setRowAttachments(p => ({
            ...p,
            [item.sr_no]: [...(p[item.sr_no] || []), ...files]
          }));
        }} />
    </label>
    {(rowAttachments[item.sr_no] || []).map((file, fi) => (
      <div key={fi} className="flex items-center gap-1">
        <span className="text-xs text-gray-600 truncate max-w-[120px]">{file.name}</span>
        <button onClick={() => setRowAttachments(p => ({
          ...p,
          [item.sr_no]: p[item.sr_no].filter((_, idx) => idx !== fi)
        }))} className="text-red-400 text-xs">✕</button>
      </div>
    ))}
  </div>
                  ) : (item.attachment_urls?.length > 0) ? (
  <div className="flex flex-col gap-1">
    {item.attachment_urls.map((url, ui) => (
      <a key={ui} href={url} target="_blank" rel="noreferrer"
        className="text-xs text-indigo-600 font-bold underline">
        📎 {item.attachment_names?.[ui] || `File ${ui + 1}`}
      </a>
    ))}
  </div>
) : (
  <span className="text-xs text-gray-400">—</span>
)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No items</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSubmissionsList = () => (
    <div className="mb-6">
      <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">
        {isMaker ? "My Submissions" : isReviewer ? "Submissions — Pending Review" : "Submissions — Pending Approval"}
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
                  <p className="text-xs text-gray-400 mt-0.5">By: {sub.submittedBy} · {new Date(sub.submittedAt).toLocaleDateString("en-GB")}</p>
                  {sub.makerComment    && <p className="text-xs text-blue-600 mt-1 italic">💬 "{sub.makerComment}"</p>}
                  {sub.reviewerComment && <p className="text-xs text-purple-600 mt-1 italic">👁 "{sub.reviewerComment}"</p>}
                  {sub.rejectionComment && <p className="text-xs text-red-500 mt-1 italic">❌ "{sub.rejectionComment}"</p>}
                  {sub.summary && (
                    <div className="flex gap-3 mt-2 flex-wrap">
                      <span className="text-xs text-yellow-700 font-bold">⏳ {sub.summary.pending} Pending {sub.summary.pending_overdue > 0 ? `(⚠ ${sub.summary.pending_overdue} Overdue)` : ""}</span>
                      <span className="text-xs text-blue-600 font-bold">🔄 {sub.summary.on_going} On Going</span>
                      <span className="text-xs text-green-600 font-bold">✓ {sub.summary.closed} Closed</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${CS_STATUS_CONFIG[sub.status]?.color}`}>
                    {CS_STATUS_CONFIG[sub.status]?.label}
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

  return (
    <Layout title="CS Tracker">
      <div className="mb-6">
        <h3 className="text-gray-800 font-bold text-lg">CS Tracker</h3>
        <p className="text-gray-400 text-sm mt-1">
          {isMaker ? "Upload CS tracker sheet and submit for review." :
           isReviewer ? "Review submitted CS tracker." :
           "Review and give final approval on CS tracker."}
        </p>
      </div>

      {/* ── MAKER ── */}
      {isMaker && (
        <>
          {renderSubmissionsList()}

          {/* Viewed submission */}
          {selectedSub && subData && (
            <>
              {renderSummaryBoxes(subData.summary, subData.items || [])}
              {renderTable(subData.items || [])}
            </>
          )}

          {/* Period label */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mb-6 mt-6">
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Period Label</label>
            <input type="text" placeholder='e.g., "JUNE 2026"' value={periodLabel}
              onChange={e => setPeriodLabel(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"/>
            {currentStatus && (
              <div className={`mt-3 px-4 py-2 rounded-xl border text-xs font-bold ${CS_STATUS_CONFIG[currentStatus]?.color}`}>
                {periodLabel} Status: {CS_STATUS_CONFIG[currentStatus]?.label}
              </div>
            )}
          </div>

          {/* Upload sheet */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
            <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-4">
              <Upload className="text-emerald-500" size={20}/>
              <h3 className="text-lg font-bold text-gray-900">Upload CS Tracker Sheet</h3>
            </div>
            <label className="h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 transition-colors">
              {filledFile
                ? <span className="text-emerald-600 text-sm font-bold">{filledFile.name}</span>
                : <span className="text-gray-400 text-sm">Click to upload CS Tracker (.xlsx)</span>}
              <input type="file" className="hidden" accept=".xlsx,.xls"
                onChange={e => { if(e.target.files[0]) { setFilledFile(e.target.files[0]); setParsedData(null); }}} />
            </label>
            {filledFile && !parsedData && (
              <button onClick={handleParseSheet} disabled={parsing}
                className="w-full mt-4 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700">
                {parsing ? "Parsing..." : "Parse & Preview"}
              </button>
            )}
          </div>

          {/* Parsed preview */}
          {parsedData && (
            <>
              {renderSummaryBoxes(parsedData.summary, parsedData.items)}
              {renderTable(parsedData.items)}

              <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Send size={16} className="text-indigo-600"/>
                  <p className="text-sm font-black uppercase text-indigo-600">Submit for Review</p>
                </div>
                <textarea onChange={e => { makerCommentRef.current = e.target.value; }}
                  placeholder="Add comment for reviewer (optional)..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none resize-none mb-3" rows={2}
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
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none mb-3" rows={2}/>
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
              {subData && (
                <>
                  {renderSummaryBoxes(subData.summary, subData.items || [])}
                  {renderTable(subData.items || [])}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── MANAGER ── */}
      {isManager && (
        <>
          {renderSubmissionsList()}
          {selectedSub && (
            <>
              {selectedSub.status === "PENDING_MANAGER" && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
                  <p className="text-sm font-black uppercase text-gray-400 mb-3">Manager Final Action — {selectedSub.period}</p>
                  <textarea onChange={e => { managerCommentRef.current = e.target.value; }}
                    placeholder="Add comment (optional)..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none mb-3" rows={2}/>
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
              {subData && (
                <>
                  {renderSummaryBoxes(subData.summary, subData.items || [])}
                  {renderTable(subData.items || [])}
                </>
              )}
            </>
          )}
        </>
      )}
    </Layout>
  );
}
