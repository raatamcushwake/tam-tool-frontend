import { useState, useRef, useEffect } from "react";
import Layout from "../components/common/Layout";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import {
  Upload, FileSpreadsheet, X, CheckCircle, AlertTriangle,
  ArrowRight, Search, MoveRight, ArrowDownRight, ArrowUpRight,
  Send, ThumbsUp, ThumbsDown, Lock, FileText, Info
} from "lucide-react";
import * as XLSX from "xlsx";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../services/firebase";
import {
  submitSanityForReview, getAllSanitySubmissions, getSanitySubmission,
  reviewerApproveSanity, reviewerRejectSanity,
  managerApproveSanity, managerRejectSanity,
  getFrozenSanityMetadata, downloadFrozenSanityAsFile,
  uploadProofDocument, STATUS_CONFIG
} from "../services/misSanitySubmissionService";

function FileUploadBox({ label, subtitle, file, onFileSelect, onClear, accent = "blue" }) {
  const inputRef = useRef(null);
  const colors = {
    blue: { icon: "bg-blue-100 text-blue-600", btn: "bg-blue-600" },
    indigo: { icon: "bg-indigo-100 text-indigo-600", btn: "bg-indigo-600" },
  };
  const c = colors[accent];
  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer
        ${file ? "border-green-400 bg-green-50" : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50"}`}
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
  const fmt = (val) => isArea
    ? `${Number(val || 0).toLocaleString('en-IN')} sft`
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);
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
  const { selectedProject } = useProject();
  const { currentUser } = useAuth();
  const isMaker = selectedProject?.role === "MAKER";
  const isReviewer = selectedProject?.role === "REVIEWER";
  const isManager = selectedProject?.role === "MANAGER";

  const [files, setFiles] = useState({ prev: null, curr: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [monthYear, setMonthYear] = useState("");
  const [currentSubmissionStatus, setCurrentSubmissionStatus] = useState(null);
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [frozenMISMetadata, setFrozenMISMetadata] = useState(null);
  const [frozenFileLoading, setFrozenFileLoading] = useState(false);
  const [frozenFileLoaded, setFrozenFileLoaded] = useState(false);
  const [rejectionInfo, setRejectionInfo] = useState(null);
  const [analysisApproved, setAnalysisApproved] = useState(false);
  const [resolvedPrevFile, setResolvedPrevFile] = useState(null);
  const [passConfirmed, setPassConfirmed] = useState(false);
  const [submissionSanityPassed, setSubmissionSanityPassed] = useState(null);

  const makerCommentRef = useRef("");
  const reviewerCommentRef = useRef("");
  const managerCommentRef = useRef("");
  const [makerProofFiles, setMakerProofFiles] = useState([]);
  const [reviewerProofFiles, setReviewerProofFiles] = useState([]);
  const makerProofInputRef = useRef(null);
  const reviewerProofInputRef = useRef(null);
  // Per-unit remarks and docs — keyed by Unit No.
  const [unitRemarks, setUnitRemarks] = useState({});       // { "A-101": "some remark" }
  const [unitDocs, setUnitDocs] = useState({});             // { "A-101": [File, File] }
  const [unitDocsUploading, setUnitDocsUploading] = useState({});
  const [unitAnomalyType, setUnitAnomalyType] = useState({});   // { "A-101": "TRANSFER" }
  const unitDocInputRefs = useRef({});
  const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

  const getPrevMonthLabel = (my) => {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const parts = String(my || '').trim().toUpperCase().split('-');
    const monIdx = months.indexOf(parts[0]?.substring(0, 3));
    const year = parseInt(parts[1]);
    if (monIdx === -1 || isNaN(year)) return null;
    const prevMonIdx = (monIdx + 11) % 12;
    const prevYear = monIdx === 0 ? year - 1 : year;
    return `${months[prevMonIdx]}-${prevYear}`;
  };

   // Load frozen metadata AND auto-set monthYear AND check approval status on page load
  useEffect(() => {
    const projectId = selectedProject?.projectId;
    const projectName = selectedProject?.projectName || selectedProject?.projectId;
    if (!projectId || !isMaker) return;

    getFrozenSanityMetadata(projectId).then(meta => {
      setFrozenMISMetadata(meta);

      let derivedMonthYear = monthYear;

      if (meta?.monthYear) {
        const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        const parts = meta.monthYear.split('-');
        const monIdx = months.indexOf(parts[0]?.toUpperCase()?.substring(0, 3));
        const year = parseInt(parts[1]);
        if (monIdx !== -1 && !isNaN(year)) {
          const nextMonIdx = (monIdx + 1) % 12;
          const nextYear = monIdx === 11 ? year + 1 : year;
          derivedMonthYear = `${months[nextMonIdx]}-${nextYear}`;
          setMonthYear(derivedMonthYear);
        }
      }

      // Check approval on the FROZEN month (where approval is stored), not the derived next month
// Only auto-unlock if sanityPassed is not already null
// (null means MIS Analysis was approved and cycle reset)
// Also try fetching all submissions to find any pending one
const checkApproval = (my) => {
  if (my) {
    getSanitySubmission(projectId, my).then(data => {
      if (data) {
        setCurrentSubmissionStatus(data.status);
        if (data.status === "APPROVED") {
          localStorage.setItem("sanityPassed", JSON.stringify(true));
          window.dispatchEvent(new Event("storage"));
        }
      } else {
        setCurrentSubmissionStatus(null);
      }
    });
  } else {
    getAllSanitySubmissions(projectId).then(subs => {
      if (subs.length === 0) return;

      // Anchor off the latest APPROVED (truly frozen) submission, not just
      // whatever was submitted most recently — a rejected/deleted draft
      // shouldn't be mistaken for "the current month".
      const latestApproved = subs.find(s => s.status === "APPROVED");

      if (latestApproved?.monthYear) {
        const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        const parts = latestApproved.monthYear.split('-');
        const monIdx = months.indexOf(parts[0]?.toUpperCase()?.substring(0, 3));
        const year = parseInt(parts[1]);
        if (monIdx !== -1 && !isNaN(year)) {
          const nextMonIdx = (monIdx + 1) % 12;
          const nextYear = monIdx === 11 ? year + 1 : year;
          setMonthYear(`${months[nextMonIdx]}-${nextYear}`);
          setCurrentSubmissionStatus(null);   // fresh month, nothing pending
          return;
        }
      }

      // No approved submission at all — fall back to whatever's latest
      const latest = subs[0];
      setCurrentSubmissionStatus(latest.status);
      setMonthYear(latest.monthYear || "");
      if (latest.status === "APPROVED") {
        localStorage.setItem("sanityPassed", JSON.stringify(true));
        window.dispatchEvent(new Event("storage"));
      }
    });
  }
};

// Check BOTH: the derived next month AND the frozen/submitted month
// because failed sanity is stored under the submitted month (e.g. MAR-2026)
// but derivedMonthYear is the next month (APR-2026)
const frozenMonth = meta?.monthYear || null; // e.g. MAR-2026

checkApproval(derivedMonthYear);

// Also check if the frozen month itself has an APPROVED submission (failed sanity approved by manager)
if (frozenMonth) {
  getSanitySubmission(projectId, frozenMonth).then(data => {
    if (data?.status === "APPROVED") {
      localStorage.setItem("sanityPassed", JSON.stringify(true));
      window.dispatchEvent(new Event("storage"));
      setCurrentSubmissionStatus("APPROVED");
    }
  });
}

const interval = setInterval(() => {
  checkApproval(derivedMonthYear);
  if (frozenMonth) {
    getSanitySubmission(projectId, frozenMonth).then(data => {
      if (data?.status === "APPROVED") {
        localStorage.setItem("sanityPassed", JSON.stringify(true));
        window.dispatchEvent(new Event("storage"));
        setCurrentSubmissionStatus("APPROVED");
      }
    });
  }
}, 30000);
return () => clearInterval(interval);
    });
  }, [selectedProject, isMaker]);

  // Re-check status whenever Maker manually changes the month
  useEffect(() => {
    const projectId = selectedProject?.projectId;
    const projectName = selectedProject?.projectName || selectedProject?.projectId;
    if (!projectId || !monthYear || !isMaker) return;
    setPassConfirmed(false);
    getSanitySubmission(projectId, monthYear).then(data => {
  if (data) {
    setCurrentSubmissionStatus(data.status);
    setAnalysisApproved(data.analysisApproved || false);
    setSubmissionSanityPassed(data.sanityCheckPassed ?? null);
    setRejectionInfo({
      rejectionComment: data.rejectionComment || "",
      reviewerComment: data.reviewerComment || "",
      approvedBy: data.approvedBy || "",
      reviewedBy: data.reviewedBy || "",
    });
  } else {
    setCurrentSubmissionStatus(null);
    setAnalysisApproved(false);
    setSubmissionSanityPassed(null);
    setRejectionInfo(null);
  }
});
  }, [selectedProject, monthYear, isMaker]);

  // Load all submissions for Maker/Reviewer/Manager
  useEffect(() => {
    const projectId = selectedProject?.projectId;
    if (!projectId) return;
    setSubmissionsLoading(true);
    getAllSanitySubmissions(projectId).then(data => {
      setAllSubmissions(data);
      setSubmissionsLoading(false);
    });
  }, [selectedProject]);

  const fmt = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

  // KEY FUNCTION: run sanity check
  // If PASSED → unlock MIS Analysis immediately (no approval needed)
  // If FAILED → lock MIS Analysis, needs full Maker→Reviewer→Manager approval
  const runSanityCheck = async () => {
    setIsProcessing(true);
    setResults(null);
    setSelectedSubmission(null);
    setPassConfirmed(false);
    try {
      let prevFile = files.prev;

      if (!prevFile && frozenMISMetadata) {
        setFrozenFileLoading(true);
        const result = await downloadFrozenSanityAsFile(selectedProject.projectId);
        setFrozenFileLoading(false);
        if (!result.success) {
          alert("Failed to load frozen previous month file. Please upload manually.");
          setIsProcessing(false);
          return;
        }
        prevFile = result.file;
        setFrozenFileLoaded(true);
      }

      if (!prevFile || !files.curr) {
        alert("Please upload both Previous and Current Month MIS");
        setIsProcessing(false);
        return;
      }

      setResolvedPrevFile(prevFile);

      const formData = new FormData();
      formData.append("prev_month", prevFile);
      formData.append("curr_month", files.curr);
      const res = await fetch(`${apiUrl}/api/mis-sanity/run`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.status === "error") {
        setResults({ status: "error", message: data.detail || data.message || "Sheet format is invalid." });
        localStorage.setItem("sanityPassed", JSON.stringify(false));
        return;
      }
      setResults(data);
      // NOTE: MIS Analysis is intentionally NOT unlocked here.
      // Maker must click a Submit button (pass or fail) before cycleState is set.
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    } finally {
      setIsProcessing(false);
      setFrozenFileLoading(false);
    }
  };

  // Called when Sanity Check PASSED — Maker explicitly submits to unlock Analysis
  const confirmAndUnlockAnalysis = async () => {
    if (!results || results.status === "error") return;
    setActionLoading(true);
    try {
      let stagedCurrURL = "";
      let stagedPrevURL = "";

      const currRef = ref(storage, `projects/${selectedProject.projectName || selectedProject.projectId}/stagingMIS/${monthYear}_curr.xlsx`);
      await uploadBytes(currRef, files.curr, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      stagedCurrURL = await getDownloadURL(currRef);

      if (frozenMISMetadata?.downloadURL) {
        stagedPrevURL = frozenMISMetadata.downloadURL;
      } else if (resolvedPrevFile) {
        const prevLabel = getPrevMonthLabel(monthYear) || `${monthYear}_prev`;
        const prevRef = ref(storage, `projects/${selectedProject.projectName || selectedProject.projectId}/stagingMIS/${prevLabel}.xlsx`);
        await uploadBytes(prevRef, resolvedPrevFile, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        stagedPrevURL = await getDownloadURL(prevRef);
      }

      const { setCycleState } = await import("../services/cycleStateService");
      await setCycleState(selectedProject.projectId, {
        cycleMonth: monthYear,
        analysisUnlocked: true,
        sanityCheckPassed: true,
        stagedCurrURL,
        stagedPrevURL,
      });

      setPassConfirmed(true);
      alert(`✅ Submitted! MIS Analysis is now unlocked for ${monthYear}.`);
    } catch (err) {
      console.error(err);
      alert("Error submitting: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };
  const handleSubmitForReview = async () => {
    if (!monthYear) { alert('Please enter Current Month & Year before submitting'); return; }
    if (!results || results.status === 'error') { alert('Please run sanity check first'); return; }
    setActionLoading(true);

    let currFileURL = "";
    try {
      const uploadRef = ref(storage, `projects/${selectedProject.projectName || selectedProject.projectId}/pendingSanityMIS/${monthYear}.xlsx`);
      await uploadBytes(uploadRef, files.curr, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      currFileURL = await getDownloadURL(uploadRef);
    } catch (uploadErr) {
      console.error("File upload error:", uploadErr);
    }
    let prevFileURL = "";
try {
  if (frozenMISMetadata?.downloadURL) {
    // Not first cycle — prev came from last month's frozen file
    prevFileURL = frozenMISMetadata.downloadURL;
  } else if (files.prev) {
    // First cycle — Maker manually uploaded prev, upload it to storage too
    const prevLabel = getPrevMonthLabel(monthYear) || `${monthYear}_prev`;
    const prevUploadRef = ref(storage, `projects/${selectedProject.projectName || selectedProject.projectId}/pendingSanityMIS/${prevLabel}.xlsx`);
    await uploadBytes(prevUploadRef, files.prev, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    prevFileURL = await getDownloadURL(prevUploadRef);
  }
} catch (uploadErr) {
  console.error("Prev file upload error:", uploadErr);
}

    // Upload proof documents if any
    // Upload overall proof documents if any
    let makerProofDocuments = [];
    for (const file of makerProofFiles) {
      const uploadResult = await uploadProofDocument(
        selectedProject.projectId, monthYear, file, "maker", selectedProject.projectName
      );
      if (uploadResult.success) {
        makerProofDocuments.push({ fileName: uploadResult.fileName, downloadURL: uploadResult.downloadURL });
      }
    }

    // Upload per-unit docs and build unitAnnotations
    const unitAnnotations = {};
    for (const unitNo of Object.keys(unitRemarks)) {
      unitAnnotations[unitNo] = { makerRemark: unitRemarks[unitNo] || "", makerDocs: [], makerAnomalyType: unitAnomalyType[unitNo] || "" };
    }
    for (const unitNo of Object.keys(unitAnomalyType)) {
      if (!unitAnnotations[unitNo]) unitAnnotations[unitNo] = { makerRemark: "", makerDocs: [], makerAnomalyType: "" };
      unitAnnotations[unitNo].makerAnomalyType = unitAnomalyType[unitNo] || "";
    }
    for (const unitNo of Object.keys(unitDocs)) {
      if (!unitAnnotations[unitNo]) unitAnnotations[unitNo] = { makerRemark: "", makerDocs: [], makerAnomalyType: unitAnomalyType[unitNo] || "" };
      for (const file of (unitDocs[unitNo] || [])) {
        const uploadResult = await uploadProofDocument(
          selectedProject.projectId, monthYear, file, `unit_${unitNo}_maker`
        );
        if (uploadResult.success) {
          unitAnnotations[unitNo].makerDocs.push({ fileName: uploadResult.fileName, downloadURL: uploadResult.downloadURL });
        }
      }
    }

    const result = await submitSanityForReview(selectedProject.projectId, monthYear, {
      submittedBy: currentUser.email,
      monthYear,
      makerComment: makerCommentRef.current,
      makerProofDocuments,
      unitAnnotations,
      currFileURL,
      prevFileURL,
      sanityCheckPassed: results.sanity_check_passed,
      issues: results.issues || [],
      summary: results.summary || {},
      units: results.units || [],
      newBookings: results.new_bookings || [],
      transferredUnits: results.transferred_units || [],
      nameCorrections: results.name_corrections || [],
      cancelledUnits: results.cancelled_units || [],
      duplicateUnits: results.duplicate_units || [],
      anomalyUnits: results.anomaly_units || [],
      decreases: results.decreases || {},
      increases: results.increases || {},
    });

    if (result.success) {
      const { setCycleState } = await import("../services/cycleStateService");
      await setCycleState(selectedProject.projectId, {
        cycleMonth: monthYear,
        analysisUnlocked: true,
        sanityCheckPassed: results.sanity_check_passed,
      });
      setCurrentSubmissionStatus('PENDING_REVIEW');
      makerCommentRef.current = '';
      setUnitRemarks({});
      setUnitDocs({});
      setUnitAnomalyType({});
      alert('✅ Submitted for Review successfully!');
    } else {
      alert('Error submitting: ' + result.error);
    }
    setActionLoading(false);
  };

  const handleReviewerAction = async (approve) => {
    if (!selectedSubmission) return;
    setActionLoading(true);

    // Upload overall reviewer proof documents if any
    let reviewerProofDocuments = [];
    for (const file of reviewerProofFiles) {
      const uploadResult = await uploadProofDocument(
        selectedProject.projectId, selectedSubmission.monthYear, file, "reviewer"
      );
      if (uploadResult.success) {
        reviewerProofDocuments.push({ fileName: uploadResult.fileName, downloadURL: uploadResult.downloadURL });
      }
    }

    // Upload per-unit reviewer docs and build reviewerUnitAnnotations
    const existingAnnotations = selectedSubmission.unitAnnotations || {};
    const reviewerUnitAnnotations = { ...existingAnnotations };
    for (const unitNo of Object.keys(unitRemarks)) {
      if (!reviewerUnitAnnotations[unitNo]) reviewerUnitAnnotations[unitNo] = { makerRemark: "", makerDocs: [] };
      reviewerUnitAnnotations[unitNo].reviewerRemark = unitRemarks[unitNo] || "";
    }
    for (const unitNo of Object.keys(unitDocs)) {
      if (!reviewerUnitAnnotations[unitNo]) reviewerUnitAnnotations[unitNo] = { makerRemark: "", makerDocs: [] };
      reviewerUnitAnnotations[unitNo].reviewerDocs = [];
      for (const file of (unitDocs[unitNo] || [])) {
        const uploadResult = await uploadProofDocument(
          selectedProject.projectId, selectedSubmission.monthYear, file, `unit_${unitNo}_reviewer`
        );
        if (uploadResult.success) {
          reviewerUnitAnnotations[unitNo].reviewerDocs.push({ fileName: uploadResult.fileName, downloadURL: uploadResult.downloadURL });
        }
      }
    }

    if (approve) {
      await reviewerApproveSanity(selectedProject.projectId, selectedSubmission.monthYear, currentUser.email, reviewerCommentRef.current, reviewerProofDocuments, reviewerUnitAnnotations);
      alert('✅ Approved! Sent to Manager.');
    } else {
      await reviewerRejectSanity(selectedProject.projectId, selectedSubmission.monthYear, currentUser.email, reviewerCommentRef.current, reviewerProofDocuments, reviewerUnitAnnotations);
      alert('❌ Rejected. Sent back to Maker.');
    }
    reviewerCommentRef.current = '';
    setReviewerProofFiles([]);
    getAllSanitySubmissions(selectedProject.projectId).then(setAllSubmissions);
    setActionLoading(false);
  };

  const handleManagerAction = async (approve) => {
    if (!selectedSubmission) return;
    setActionLoading(true);
    if (approve) {
      await managerApproveSanity(
        selectedProject.projectId,
        selectedSubmission.monthYear,
        currentUser.email,
        managerCommentRef.current
      );

      // NOTE: The MIS file is intentionally NOT frozen here anymore.
      // Freezing now happens only when MIS Analysis is finally approved
      // (see MISAnalysis.jsx -> handleManagerAction). Sanity approval is
      // just a record/audit step; MIS Analysis was already unlocked when
      // the check ran.
      alert('✅ Sanity approved for record-keeping. This month\'s MIS will be frozen only after MIS Analysis is approved by the Manager.');
    } else {
      await managerRejectSanity(
        selectedProject.projectId,
        selectedSubmission.monthYear,
        currentUser.email,
        managerCommentRef.current
      );
      alert('❌ Rejected. Sent back to Reviewer.');
    }
    managerCommentRef.current = '';
    getAllSanitySubmissions(selectedProject.projectId).then(setAllSubmissions);
    setActionLoading(false);
  };

  const downloadExcel = () => {
    if (!results) return;
    const wb = XLSX.utils.book_new();
    const sheetsConfig = [
      { name: "All Errors", data: (() => {
        const map = new Map();
        const add = (u) => { if (u?.['Unit No.'] && !map.has(u['Unit No.'])) map.set(u['Unit No.'], u); };
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
    ];
    sheetsConfig.forEach(({ name, data }) => {
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Info: "No records" }]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, `Sanity_Check_${monthYear || 'Export'}.xlsx`);
  };

  // Build display data — handles both live API results and loaded Firestore submissions
  const getDisplayData = (r) => {
    if (!r) return [];
    switch (activeTab) {
      case "new": return r.new_bookings || r.newBookings || [];
      case "transfer": return (r.transferred_units || r.transferredUnits || []).filter(u => !u.anomaly_detected);
      case "anomaly": return [
        ...(r.anomaly_units || r.anomalyUnits || []),
        ...(r.transferred_units || r.transferredUnits || []).filter(u => u.anomaly_detected)
      ].filter((u, i, arr) => arr.findIndex(x => x['Unit No.'] === u['Unit No.'] && x.curr_customer === u.curr_customer) === i);
      case "name_correction": return r.name_corrections || r.nameCorrections || [];
      case "cancelled": return r.cancelled_units || r.cancelledUnits || [];
      case "duplicate": return r.duplicate_units || r.duplicateUnits || [];
      case "agreement_change": return [
        ...(r.decreases?.agreement || []),
        ...(r.increases?.agreement || [])
      ];
      case "amount_change": return r.decreases?.amount || [];
      case "demand_change": return r.decreases?.demand || [];
      case "saleable_change": return [
        ...(r.decreases?.saleable || []),
        ...(r.increases?.saleable || [])
      ];
      case "carpet_change": return [
        ...(r.decreases?.carpet || []),
        ...(r.increases?.carpet || [])
      ];
      default: {
        const map = new Map();
        const add = (u) => { if (u?.['Unit No.'] && !map.has(u['Unit No.'])) map.set(u['Unit No.'], u); };
        [
          ...(r.decreases?.amount || []), ...(r.decreases?.demand || []),
          ...(r.decreases?.agreement || []), ...(r.decreases?.saleable || []),
          ...(r.decreases?.carpet || []), ...(r.increases?.agreement || []),
          ...(r.increases?.saleable || []), ...(r.increases?.carpet || []),
          ...(r.duplicate_units || r.duplicateUnits || []),
          ...(r.anomaly_units || r.anomalyUnits || [])
        ].forEach(add);
        return Array.from(map.values());
      }
    }
  };

  // Normalize Firestore camelCase keys to match API snake_case keys
  const normalizeResults = (sub) => ({
    status: "success",
    sanity_check_passed: sub.sanityCheckPassed,
    issues: sub.issues || [],
    summary: sub.summary || {},
    units: sub.units || [],
    new_bookings: sub.newBookings || [],
    transferred_units: sub.transferredUnits || [],
    name_corrections: sub.nameCorrections || [],
    cancelled_units: sub.cancelledUnits || [],
    duplicate_units: sub.duplicateUnits || [],
    anomaly_units: sub.anomalyUnits || [],
    decreases: sub.decreases || {},
    increases: sub.increases || {},
  });

  const activeResults = selectedSubmission
    ? normalizeResults(selectedSubmission)
    : results;

  const displayData = getDisplayData(activeResults);
  const filteredUnits = displayData.filter(unit =>
    Object.values(unit).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
        {unit.from_unit && unit.to_unit && unit.from_unit !== unit.to_unit && (
          <span className="text-gray-400 text-xs font-semibold">{unit.from_unit} → {unit.to_unit}</span>
        )}
        <div className="flex items-center gap-2 text-xs">
          <span className="line-through text-red-400">{unit.prev_customer || 'Unsold'}</span>
          <MoveRight size={12} className="text-gray-400" />
          <span className="text-purple-600 font-bold">{unit.curr_customer}</span>
        </div>
      </div>
    );
    const changes = [];
    const addChange = (delta, prev, curr, label, isArea = false) => {
      if (delta !== 0) changes.push({ delta, prev, curr, label, isArea });
    };
    if (["all", "agreement_change"].includes(activeTab)) addChange(unit.agreement_delta, unit.prev_agreement, unit['Agreement value'], "Agreement Value");
    if (["all", "amount_change"].includes(activeTab)) addChange(unit.amount_received_delta, unit.prev_amount_received, unit['Amount Received excl. Tax'], "Amount Received");
    if (["all", "demand_change"].includes(activeTab)) addChange(unit.demand_delta, unit.prev_demand, unit['Demand Raised as on Current Month excl. tax'], "Demand Raised");
    if (["all", "saleable_change"].includes(activeTab)) addChange(unit.saleable_delta, unit.prev_saleable, unit['Saleable area in sft'], "Saleable Area", true);
    if (["all", "carpet_change"].includes(activeTab)) addChange(unit.carpet_delta, unit.prev_carpet, unit['Carpet area in sft'], "Carpet Area", true);
    if (changes.length === 0) return <span className="text-gray-300">-</span>;
    return (
      <div className="flex flex-col gap-3 py-1">
        {changes.map((item, i) => (
          <div key={i} className="flex flex-col gap-1 border-b border-gray-100 last:border-0 pb-2 last:pb-0">
            <span className="text-[10px] font-black uppercase text-blue-600">{item.label}</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="line-through text-gray-400">
                {item.isArea ? `${item.prev} sft` : fmt(item.prev)}
              </span>
              <MoveRight size={12} className="text-blue-400" />
              <span className="font-bold">
                {item.isArea ? `${item.curr} sft` : fmt(item.curr)}
              </span>
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

  const isFailedUnit = (unit) => {
    if (!activeResults) return false;
    const r = activeResults;
    const allFailedUnitNos = new Set([
      ...(r.decreases?.amount || []),
      ...(r.decreases?.demand || []),
      ...(r.decreases?.agreement || []),
      ...(r.decreases?.saleable || []),
      ...(r.decreases?.carpet || []),
      ...(r.increases?.agreement || []),
      ...(r.increases?.saleable || []),
      ...(r.increases?.carpet || []),
      ...(r.duplicate_units || []),
    ].map(u => u?.['Unit No.']));
    return allFailedUnitNos.has(unit?.['Unit No.']);
  };

  const isAnomalyUnit = (unit) => {
    if (!activeResults) return false;
    const r = activeResults;
    const anomalySet = new Set([
      ...(r.anomaly_units || []),
      ...(r.transferred_units || []).filter(u => u.anomaly_detected)
    ].map(u => u?.['Unit No.']));
    return anomalySet.has(unit?.['Unit No.']);
  };

  const tabs = [
    { id: "all", label: "All Errors", color: "bg-blue-600" },
    { id: "new", label: "New Bookings", color: "bg-purple-600" },
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

  // Shared results render — used by Maker (live) and Reviewer/Manager (from Firestore)
  const renderResults = (r) => (
    <div className="space-y-6">

      {/* Download — only for Maker viewing live results */}
      {isMaker && results && !selectedSubmission && (
        <div className="flex justify-end">
          <button onClick={downloadExcel}
            className="px-6 py-2.5 rounded-lg font-bold text-sm bg-green-600 hover:bg-green-700 text-white shadow flex items-center gap-2 transition-all">
            ⬇ Download Sanity_Check.xlsx
          </button>
        </div>
      )}

      {/* Pass / Fail banner */}
      {r.sanity_check_passed ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle size={22} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-emerald-700">✓ Sanity Check Passed</h3>
            <p className="text-emerald-600 text-sm">No critical issues detected.</p>
          </div>
        </div>
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle size={22} className="text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-red-700">⚠ Sanity Check Failed</h3>
            <p className="text-gray-500 text-sm mb-1">The following issues were found:</p>
            <ul className="list-disc list-inside text-red-600 font-bold text-sm">
              {(r.issues || []).map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Summary count cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'New Bookings', value: r.summary?.new_bookings_count ?? 0, sub: 'New Inventory', accent: 'border-l-purple-500' },
          { label: 'Name Corr.', value: r.summary?.name_correction_count ?? 0, sub: 'Spelling Fixes', accent: 'border-l-teal-500' },
          { label: 'Cancelled', value: r.summary?.cancelled_count ?? 0, sub: 'Unsold/Missing', accent: 'border-l-orange-500' },
          { label: 'Duplicates', value: r.summary?.duplicate_count ?? 0, sub: 'Duplicate Entries', accent: 'border-l-red-500' },
          { label: 'Anomaly', value: r.summary?.anomaly_count ?? 0, sub: 'Resale / Anomaly', accent: 'border-l-purple-500' },
        ].map((card) => (
          <div key={card.label} className={`bg-white p-5 rounded-xl border border-gray-200 border-l-4 ${card.accent} shadow-sm hover:shadow-md transition-shadow`}>
            <p className="text-gray-500 text-[10px] font-bold uppercase mb-2 tracking-widest">{card.label}</p>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{card.value}</h2>
            <span className="text-gray-400 text-[11px]">{card.sub}</span>
          </div>
        ))}
      </div>

      {/* Financial summary boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryBox title="Agreement Value"
          incValue={r.summary?.agreement_inc} decValue={r.summary?.agreement_dec}
          incCount={r.summary?.agreement_inc_count} decCount={r.summary?.agreement_dec_count}
          accentClass="border-l-amber-500" />
        <SummaryBox title="Amount Received"
          decValue={r.summary?.amount_dec} decCount={r.summary?.amount_dec_count}
          accentClass="border-l-cyan-500" showDecreaseOnly />
        <SummaryBox title="Demand Raised"
          decValue={r.summary?.demand_dec} decCount={r.summary?.demand_dec_count}
          accentClass="border-l-rose-500" showDecreaseOnly />
        <SummaryBox title="Saleable Area"
          incValue={r.summary?.saleable_inc} decValue={r.summary?.saleable_dec}
          incCount={r.summary?.saleable_inc_count} decCount={r.summary?.saleable_dec_count}
          isArea accentClass="border-l-emerald-500" />
        <SummaryBox title="Carpet Area"
          incValue={r.summary?.carpet_inc} decValue={r.summary?.carpet_dec}
          incCount={r.summary?.carpet_inc_count} decCount={r.summary?.carpet_dec_count}
          isArea accentClass="border-l-indigo-500" />
      </div>

      {/* Detail table with tabs */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-2 bg-gray-50">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                  ${activeTab === tab.id
                    ? `${tab.color} text-white shadow-sm`
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'}`}>
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
                {columnSequence.map((key) => (
                  <th key={key} className="p-4 whitespace-nowrap">{key}</th>
                ))}
                <th className="p-4 sticky right-0 bg-gray-50 z-20 text-blue-600 min-w-[280px] border-l border-gray-200">Change Highlights</th>
                <th className="p-4 bg-gray-50 text-purple-600 min-w-[260px] border-l border-gray-200">Unit Remarks & Docs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUnits.length > 0 ? filteredUnits.map((unit, idx) => (
                <tr key={idx} className="hover:bg-blue-50/50 text-sm group transition-all">
                  <td className="p-4 text-gray-400 font-mono group-hover:text-blue-600">{idx + 1}</td>
                  {columnSequence.map((key) => (
                    <td key={key} className="p-4 whitespace-nowrap font-medium text-gray-700">
                      {String(unit[key] ?? "-")}
                    </td>
                  ))}
                  <td className="p-4 bg-white sticky right-0 border-l border-gray-100 group-hover:bg-blue-50/50 shadow-[-8px_0_12px_rgba(0,0,0,0.04)]">
                    {renderChange(unit)}
                  </td>
                  <td className="p-4 bg-white border-l border-gray-100 align-top">
                    {(() => {
                      const unitNo = unit?.['Unit No.'];
                      const failed = isFailedUnit(unit);
                      const isAnomaly = isAnomalyUnit(unit);
                      const annotation = (selectedSubmission?.unitAnnotations || {})[unitNo] || (activeResults?.unitAnnotations || {})[unitNo] || {};
                      const canEdit = (isMaker && !selectedSubmission) || isReviewer;

                      return (
                        <div className="flex flex-col gap-2 min-w-[240px]">

                          {/* Anomaly classification — show if saved */}
                          {annotation.makerAnomalyType && (
                            <span className="text-[9px] font-black px-2 py-1 rounded border bg-purple-50 text-purple-600 border-purple-300 uppercase w-fit">
                              {annotation.makerAnomalyType}
                            </span>
                          )}

                          {/* Maker remark — always show if exists */}
                          {annotation.makerRemark && (
                            <div className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                              <span className="font-black uppercase">Maker: </span>{annotation.makerRemark}
                            </div>
                          )}
                          {/* Maker docs */}
                          {annotation.makerDocs?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {annotation.makerDocs.map((d, i) => (
                                <a key={i} href={d.downloadURL} target="_blank" rel="noopener noreferrer"
                                  className="text-[10px] flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-blue-700 font-bold hover:bg-blue-100">
                                  <FileText size={10} />{d.fileName}
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Reviewer remark — show if exists */}
                          {annotation.reviewerRemark && (
                            <div className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1">
                              <span className="font-black uppercase">Reviewer: </span>{annotation.reviewerRemark}
                            </div>
                          )}
                          {/* Reviewer docs */}
                          {annotation.reviewerDocs?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {annotation.reviewerDocs.map((d, i) => (
                                <a key={i} href={d.downloadURL} target="_blank" rel="noopener noreferrer"
                                  className="text-[10px] flex items-center gap-1 bg-purple-50 border border-purple-200 rounded px-2 py-0.5 text-purple-700 font-bold hover:bg-purple-100">
                                  <FileText size={10} />{d.fileName}
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Editable remark input — for failed OR anomaly units + correct role */}
                          {(failed || isAnomaly) && canEdit && (
                            <>
                              {isAnomaly && (
                                <select
                                  value={unitAnomalyType[unitNo] || ""}
                                  onChange={e => setUnitAnomalyType(prev => ({ ...prev, [unitNo]: e.target.value }))}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-400 bg-white">
                                  <option value="">Select type...</option>
                                  <option value="TRANSFER">Transfer</option>
                                  <option value="RESALE">Resale</option>
                                  <option value="OTHER">Other</option>
                                </select>
                              )}
                              <textarea
                                rows={2}
                                placeholder={isReviewer ? "Reviewer remark..." : "Add remark for this unit..."}
                                value={unitRemarks[unitNo] || ""}
                                onChange={e => setUnitRemarks(prev => ({ ...prev, [unitNo]: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-blue-400 resize-none"
                              />
                              <div className="flex items-center gap-2">
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx,.jpg,.jpeg"
                                  multiple
                                  className="hidden"
                                  ref={el => unitDocInputRefs.current[unitNo] = el}
                                  onChange={e => {
                                    const newFiles = Array.from(e.target.files);
                                    setUnitDocs(prev => ({ ...prev, [unitNo]: [...(prev[unitNo] || []), ...newFiles] }));
                                    e.target.value = "";
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => unitDocInputRefs.current[unitNo]?.click()}
                                  className="flex items-center gap-1 border border-dashed border-gray-300 hover:border-blue-400 rounded-lg px-2 py-1 text-[10px] font-bold text-gray-500 hover:text-blue-600 transition">
                                  <Upload size={10} /> Attach
                                </button>
                                {(unitDocs[unitNo] || []).map((f, fi) => (
                                  <div key={fi} className="flex items-center gap-1 bg-gray-100 rounded px-1.5 py-0.5">
                                    <span className="text-[10px] text-gray-600 max-w-[80px] truncate">{f.name}</span>
                                    <button onClick={() => setUnitDocs(prev => ({
                                      ...prev,
                                      [unitNo]: prev[unitNo].filter((_, i) => i !== fi)
                                    }))} className="text-red-400 hover:text-red-600"><X size={9} /></button>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {/* Neither failed nor anomaly — no input needed */}
                          {!failed && !isAnomaly && !annotation.makerRemark && !annotation.reviewerRemark && (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={columnSequence.length + 3} className="p-16 text-center text-gray-400 font-medium italic">
                    No matching records found in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <Layout title="MIS Sanity Check">
      <div className="mb-6">
        <h3 className="text-gray-800 font-bold text-lg">MIS Sanity Check</h3>
        <p className="text-gray-400 text-sm mt-1">
          {isMaker
            ? "Run sanity check and submit for review if issues are found."
            : isReviewer
            ? "Review submitted sanity checks and approve or reject."
            : "Give final approval to sanity check submissions."}
        </p>
      </div>

      {/* ── MAKER VIEW ─────────────────────────────────────────────── */}
      {isMaker && (
        <>
          {/* Month/Year Input */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mb-6">
            <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <FileText className="text-blue-600" size={16} />
              Enter Current Month & Year
            </label>
            <input
              type="text"
              placeholder="e.g., OCT-2024, NOV-2024"
              value={monthYear}
              onChange={(e) => setMonthYear(e.target.value.toUpperCase())}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all text-sm"
            />
            {currentSubmissionStatus && (
              <div className={`mt-3 px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 ${STATUS_CONFIG[currentSubmissionStatus]?.color}`}>
                <Lock size={12} /> {monthYear} Status: {STATUS_CONFIG[currentSubmissionStatus]?.label}
              </div>
            )}
          </div>

          {/* File Upload */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Previous Month MIS</p>
              {frozenMISMetadata ? (
                <div className="border-2 border-dashed border-green-400 bg-green-50 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                  <CheckCircle size={40} className="text-green-500 mb-3" />
                  <p className="text-green-700 font-bold text-sm">Auto-loaded from Frozen Sanity MIS</p>
                  <p className="text-green-600 font-semibold text-xs mt-1">{frozenMISMetadata.monthYear}.xlsx</p>
                  <p className="text-gray-400 text-xs mt-2">
                    Frozen on: {frozenMISMetadata.frozenAt?.seconds
                      ? new Date(frozenMISMetadata.frozenAt.seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '-'}
                  </p>
                  {frozenFileLoading && (
                    <p className="text-blue-500 text-xs mt-2 font-bold animate-pulse">Downloading from Firebase...</p>
                  )}
                  {frozenFileLoaded && (
                    <p className="text-emerald-600 text-xs mt-2 font-bold">✓ Downloaded & Ready</p>
                  )}
                </div>
              ) : (
                <FileUploadBox
                  label="Upload Previous Sheet" subtitle="Last month's MIS Excel file"
                  file={files.prev} accent="blue"
                  onFileSelect={(f) => setFiles(p => ({ ...p, prev: f }))}
                  onClear={() => setFiles(p => ({ ...p, prev: null }))} />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Current Month MIS</p>
              <FileUploadBox
                label="Upload Current Sheet" subtitle="This month's MIS Excel file"
                file={files.curr} accent="indigo"
                onFileSelect={(f) => {
                  // A new current-month file means this is a revision — whatever
                  // was submitted before (passed-FYI or rejected) is now stale.
                  // Reset local submission state so the Submit button and status
                  // badges reflect this as a brand-new, unsubmitted attempt.
                  setFiles(p => ({ ...p, curr: f }));
                  setResults(null);
                  setCurrentSubmissionStatus(null);
                  setSubmissionSanityPassed(null);
                  setRejectionInfo(null);
                }}
                onClear={() => setFiles(p => ({ ...p, curr: null }))} />
            </div>
          </div>

          {/* Approved & frozen notice */}
          {analysisApproved && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3">
              <Lock size={16} className="text-green-600" />
              <div>
                <p className="text-green-700 font-bold text-sm">{monthYear} Sanity is Approved & Frozen</p>
                <p className="text-green-500 text-xs mt-0.5">Change the Month & Year above to submit for the next month.</p>
              </div>
            </div>
          )}

          {/* Submission Status Tracking Card — shown after submission */}
          {(currentSubmissionStatus === 'PENDING_REVIEW' || 
            currentSubmissionStatus === 'PENDING_MANAGER' || 
            currentSubmissionStatus === 'REJECTED_BY_REVIEWER' || 
            currentSubmissionStatus === 'REJECTED_BY_MANAGER') && (
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Your Sanity Submission — {monthYear}</p>
              <div className={`bg-white border rounded-2xl p-5 shadow-sm ${
                submissionSanityPassed === true ? 'border-emerald-300' :
                currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER' 
                  ? 'border-amber-300' : 'border-red-300'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-black text-gray-900 text-base">{monthYear}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Submitted by: {currentUser?.email}</p>
                  </div>
                  {submissionSanityPassed === true ? (
                    <span className="text-xs font-black px-3 py-1.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-300">
                      ✓ Submitted — Sanity Passed
                    </span>
                  ) : (
                    <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${STATUS_CONFIG[currentSubmissionStatus]?.color}`}>
                      {STATUS_CONFIG[currentSubmissionStatus]?.label}
                    </span>
                  )}
                </div>
                {currentSubmissionStatus === 'PENDING_REVIEW' && submissionSanityPassed !== true && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs font-bold text-amber-700">⏳ Waiting for Reviewer to review your sanity submission.</p>
                  </div>
                )}
                {currentSubmissionStatus === 'PENDING_MANAGER' && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-xs font-bold text-blue-700">⏳ Reviewer approved. Waiting for Manager final approval.</p>
                  </div>
                )}
                {(currentSubmissionStatus === 'REJECTED_BY_REVIEWER' || currentSubmissionStatus === 'REJECTED_BY_MANAGER') && (
  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
    <p className="text-xs font-bold text-red-600">
      {currentSubmissionStatus === 'REJECTED_BY_MANAGER'
        ? '⏳ Manager rejected — waiting for Reviewer to review and send back to you.'
        : '❌ Reviewer rejected. Add a reason and resubmit, or upload a revised MIS and re-run.'}
    </p>
    {rejectionInfo?.rejectionComment && (
      <p className="text-xs text-red-500 mt-2 italic">
        💬 {currentSubmissionStatus === 'REJECTED_BY_REVIEWER' ? 'Reviewer' : 'Manager'} comment: "{rejectionInfo.rejectionComment}"
      </p>
    )}
    {rejectionInfo?.reviewerComment && currentSubmissionStatus === 'REJECTED_BY_REVIEWER' && (
      <p className="text-xs text-purple-500 mt-1 italic">
        👁 Reviewer note: "{rejectionInfo.reviewerComment}"
      </p>
    )}
    {currentSubmissionStatus === 'REJECTED_BY_REVIEWER' && (
      <button
        type="button"
        onClick={() => {
          // Starting a revision — the old rejected submission is now stale.
          // Clear the file so the box is ready for a fresh upload, and clear
          // every piece of local state tied to the old submission so the UI
          // doesn't keep showing the old rejected banner/status while the
          // Maker is preparing the new one.
          setFiles(p => ({ ...p, curr: null }));
          setResults(null);
          setCurrentSubmissionStatus(null);
          setSubmissionSanityPassed(null);
          setRejectionInfo(null);
        }}
        className="mt-2 text-xs font-bold text-blue-600 underline">
        Upload a revised Current Month MIS instead →
      </button>
    )}
  </div>
)}
              </div>
            </div>
          )}

          {/* Run Button */}
          <div className="flex justify-center mb-8">
            <button
              onClick={runSanityCheck}
              disabled={(!files.prev && !frozenMISMetadata) || !files.curr || isProcessing || analysisApproved}
              className={`flex items-center gap-3 px-10 py-3.5 rounded-xl font-bold text-sm transition-all
                ${(files.prev || frozenMISMetadata) && files.curr && !isProcessing && !analysisApproved
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 hover:scale-105 active:scale-95"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {isProcessing ? "Analyzing Data..." : "Run Sanity Check"}
              <ArrowRight size={18} />
            </button>
          </div>

          {/* All Your Sanity Submissions — click any month to view it */}
          {allSubmissions.length > 0 && (
            <div className="mb-8">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">All Sanity Submissions</p>
              <div className="space-y-3">
                {allSubmissions.map((sub, idx) => (
                  <div key={idx}
                    onClick={() => {
                      setSelectedSubmission(sub);
                      setMonthYear(sub.monthYear || '');
                      setActiveTab('all');
                      setSearchTerm('');
                    }}
                    className={`bg-white border rounded-2xl p-5 cursor-pointer hover:border-blue-300 transition-all shadow-sm
                      ${selectedSubmission?.monthYear === sub.monthYear ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-gray-900 text-base">{sub.monthYear}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Submitted: {sub.submittedAt?.seconds
                            ? new Date(sub.submittedAt.seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '-'}
                        </p>
                        <div className="mt-2">
                          {sub.sanityCheckPassed
                            ? <span className="text-[10px] font-black px-2 py-1 rounded bg-emerald-100 text-emerald-700 border border-emerald-300">✓ Sanity Passed</span>
                            : <span className="text-[10px] font-black px-2 py-1 rounded bg-red-100 text-red-700 border border-red-300">⚠ Sanity Failed</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {sub.sanityCheckPassed === true ? (
                          <span className="text-xs font-black px-3 py-1.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-300">
                            ✓ Submitted
                          </span>
                        ) : (
                          <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${STATUS_CONFIG[sub.status]?.color}`}>
                            {STATUS_CONFIG[sub.status]?.label}
                          </span>
                        )}
                        {selectedSubmission?.monthYear === sub.monthYear && (
                          <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">Viewing</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Read-only view of a selected past submission */}
          {selectedSubmission && !results && (
            <>
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs text-amber-700 font-bold flex items-center gap-2">
                  <Info size={14} /> Viewing past submission — {selectedSubmission.monthYear}
                </p>
              </div>
              {renderResults(normalizeResults(selectedSubmission))}
            </>
          )}

          {/* Error banner */}
          {results?.status === "error" && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-4">
              <AlertTriangle size={22} className="text-red-600" />
              <div>
                <h3 className="text-base font-bold text-red-700">Invalid Sheet Format</h3>
                <p className="text-red-600 text-sm mt-1">{results.message}</p>
              </div>
            </div>
          )}

          {/* Results section */}
          {results && results.status !== "error" && (
            <>
              {!analysisApproved && !results.sanity_check_passed && (
                <div className="bg-white border rounded-2xl p-5 shadow-sm mb-6 border-red-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Send size={16} className="text-red-500" />
                    <p className="text-sm font-black uppercase text-red-500">
                      Submit Failed Sanity for Review
                    </p>
                    {currentSubmissionStatus && (
                      <span className={`ml-auto text-xs font-black px-3 py-1 rounded-full border ${STATUS_CONFIG[currentSubmissionStatus]?.color}`}>
                        {STATUS_CONFIG[currentSubmissionStatus]?.label}
                      </span>
                    )}
                  </div>
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs font-bold text-amber-700">
                      ⚠ Sanity check failed — MIS Analysis is still unlocked so you can proceed, but this submission requires a remark or attachment for Reviewer/Manager review.
                    </p>
                  </div>
                  {(currentSubmissionStatus === 'REJECTED_BY_REVIEWER' || currentSubmissionStatus === 'REJECTED_BY_MANAGER') && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-xs font-bold text-red-600">
                        Rejected — please fix the issues, re-run sanity, and resubmit.
                      </p>
                    </div>
                  )}
                  <div className="mb-3">
                    <textarea
                      defaultValue=""
                      onChange={e => { makerCommentRef.current = e.target.value; }}
                      placeholder="Explain the issues to the Reviewer (optional)..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-blue-400 resize-none"
                      rows={3}
                      disabled={currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER'}
                    />
                  </div>
                  <button
                    onClick={handleSubmitForReview}
                    disabled={!monthYear || actionLoading || currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER' || currentSubmissionStatus === 'REJECTED_BY_MANAGER'}
                    className={`w-full font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm
                      ${(!monthYear || actionLoading || currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER')
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-red-500 hover:bg-red-600 text-white'}`}>
                    {actionLoading ? 'Submitting...' :
 currentSubmissionStatus === 'PENDING_REVIEW' ? '⏳ Awaiting Review' :
 currentSubmissionStatus === 'PENDING_MANAGER' ? '⏳ Awaiting Manager Approval' :
 currentSubmissionStatus === 'REJECTED_BY_MANAGER' ? '⏳ Awaiting Reviewer Action' :
 <><Send size={14} /> Submit Failed Sanity for Review</>}
                  </button>
                </div>
              )}

              {/* ── Submit for review panel — PASSED sanity: no remark required, just FYI record ── */}
              {!analysisApproved && results.sanity_check_passed && (
                <div className="bg-white border rounded-2xl p-5 shadow-sm mb-6 border-emerald-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Send size={16} className="text-emerald-600" />
                    <p className="text-sm font-black uppercase text-emerald-600">
                      Submit Passed Sanity to Reviewer
                    </p>
                    {currentSubmissionStatus && (
                      <span className="ml-auto text-xs font-black px-3 py-1 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-300">
                        ✓ Submitted — Sanity Passed
                      </span>
                    )}
                  </div>
                  <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <p className="text-xs font-bold text-emerald-700">
                      ✓ Sanity check passed. Submit to unlock the MIS Analysis for {monthYear} — this also creates a visible record for the Reviewer and Manager, though no action is required from them.
                    </p>
                  </div>
                  <div className="mb-3">
                    <textarea
                      defaultValue=""
                      onChange={e => { makerCommentRef.current = e.target.value; }}
                      placeholder="Add a note for the record (optional)..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-blue-400 resize-none"
                      rows={2}
                      disabled={currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER'}
                    />
                  </div>
                  <button
                    onClick={handleSubmitForReview}
                    disabled={!monthYear || actionLoading || currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER' || currentSubmissionStatus === 'APPROVED'}
                    className={`w-full font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm
                      ${(!monthYear || actionLoading || currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER' || currentSubmissionStatus === 'APPROVED')
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                    {actionLoading ? 'Submitting...' :
 currentSubmissionStatus === 'PENDING_REVIEW' ? '✓ Sent to Reviewer' :
 currentSubmissionStatus === 'PENDING_MANAGER' ? '✓ Sent to Manager' :
 currentSubmissionStatus === 'APPROVED' ? '✓ Already Submitted' :
 <><Send size={14} /> Submit Passed Sanity to Reviewer</>}
                  </button>
                </div>
              )}

              {renderResults(results)}
            </>
          )}
        </>
      )}

      {/* ── REVIEWER / MANAGER VIEW ────────────────────────────────── */}
      {(isReviewer || isManager) && (
        <>
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">
              {isReviewer ? 'Sanity Submissions — Pending Review' : 'Sanity Submissions — Pending Approval'}
            </p>
            {submissionsLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                <p className="text-gray-400 text-sm">Loading submissions...</p>
              </div>
            ) : allSubmissions.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <FileSpreadsheet size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-semibold">No submissions yet</p>
                <p className="text-gray-400 text-sm mt-1">Waiting for Maker to submit a failed sanity check.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allSubmissions.map((sub, idx) => (
                  <div key={idx}
                    onClick={() => {
                      setSelectedSubmission(sub);
                      setMonthYear(sub.monthYear || '');
                      setActiveTab('all');
                      setSearchTerm('');
                    }}
                    className={`bg-white border rounded-2xl p-5 cursor-pointer hover:border-blue-300 transition-all shadow-sm
                      ${selectedSubmission?.monthYear === sub.monthYear ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-gray-900 text-base">{sub.monthYear}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Submitted by: {sub.submittedBy} · {sub.submittedAt?.seconds
                            ? new Date(sub.submittedAt.seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '-'}
                        </p>
                        {sub.makerComment && (
                          <p className="text-xs text-blue-600 mt-1 italic">💬 "{sub.makerComment}"</p>
                        )}
                        {sub.reviewerComment && (
                          <p className="text-xs text-purple-600 mt-1 italic">👁 Reviewer: "{sub.reviewerComment}"</p>
                        )}
                        {sub.rejectionComment && (
                          <p className="text-xs text-red-500 mt-1 italic">❌ Rejected: "{sub.rejectionComment}"</p>
                        )}
                        <div className="mt-2">
                          {sub.sanityCheckPassed
                            ? <span className="text-[10px] font-black px-2 py-1 rounded bg-emerald-100 text-emerald-700 border border-emerald-300">✓ Sanity Passed</span>
                            : <span className="text-[10px] font-black px-2 py-1 rounded bg-red-100 text-red-700 border border-red-300">⚠ Sanity Failed</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {sub.sanityCheckPassed === true ? (
                          <span className="text-xs font-black px-3 py-1.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-300">
                            ✓ Sanity Check Passed
                          </span>
                        ) : (
                          <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${STATUS_CONFIG[sub.status]?.color}`}>
                            {STATUS_CONFIG[sub.status]?.label}
                          </span>
                        )}
                        {selectedSubmission?.monthYear === sub.monthYear && (
                          <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">Viewing</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action panel + results for selected submission */}
          {selectedSubmission && (
            <>
              {/* Approve / Reject actions — shown only for correct role + status */}
              {selectedSubmission.sanityCheckPassed === false &&
               ((isReviewer && (selectedSubmission.status === 'PENDING_REVIEW' || selectedSubmission.status === 'REJECTED_BY_MANAGER')) ||
                (isManager && selectedSubmission.status === 'PENDING_MANAGER')) && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
                  <p className="text-sm font-black uppercase text-gray-400 mb-1">
                    {isReviewer ? '👁 Reviewer Action' : '✅ Manager Final Action'} — {selectedSubmission.monthYear}
                  </p>
                  {isManager && (
  <p className="text-xs text-amber-600 font-semibold mb-3">
    ⚠ If you approve, MIS Analysis will be unlocked for the Maker.
    If you reject, it goes back to Reviewer with your comments.
  </p>
)}
                  {isReviewer && selectedSubmission.status === 'REJECTED_BY_MANAGER' && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-xs font-bold text-red-600">
                        ❌ Manager rejected this submission.
                      </p>
                      {selectedSubmission.rejectionComment && (
                        <p className="text-xs text-red-500 mt-1 italic">
                          💬 Manager's reason: "{selectedSubmission.rejectionComment}"
                        </p>
                      )}
                      <p className="text-xs text-amber-600 mt-2 font-semibold">
                        You can re-send to Manager with your comment, or reject back to Maker.
                      </p>
                    </div>
                  )}

                  {/* Maker proof documents — visible to Reviewer and Manager */}
                  {selectedSubmission.makerProofDocuments?.length > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                      <p className="text-xs font-black uppercase text-blue-600 mb-2">📎 Maker Attached Documents</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedSubmission.makerProofDocuments.map((doc, i) => (
                          <a key={i} href={doc.downloadURL} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 bg-white border border-blue-300 rounded-lg px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition">
                            <FileText size={12} /> {doc.fileName}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reviewer proof documents — visible to Manager only */}
                  {isManager && selectedSubmission.reviewerProofDocuments?.length > 0 && (
                    <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-xl">
                      <p className="text-xs font-black uppercase text-purple-600 mb-2">📎 Reviewer Attached Documents</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedSubmission.reviewerProofDocuments.map((doc, i) => (
                          <a key={i} href={doc.downloadURL} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 bg-white border border-purple-300 rounded-lg px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition">
                            <FileText size={12} /> {doc.fileName}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mb-3">
                    <textarea
                      defaultValue=""
                      onChange={e => {
                        if (isReviewer) reviewerCommentRef.current = e.target.value;
                        else managerCommentRef.current = e.target.value;
                      }}
                      placeholder="Add your comment (optional)..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-blue-400 resize-none"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => isReviewer ? handleReviewerAction(true) : handleManagerAction(true)}
                      disabled={actionLoading}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
                      <ThumbsUp size={15} />
                      {isReviewer
                        ? selectedSubmission.status === 'REJECTED_BY_MANAGER'
                          ? 'Re-send to Manager'
                          : 'Approve → Send to Manager'
                        : 'Final Approve & Unlock MIS Analysis'}
                    </button>
                    <button
                      onClick={() => isReviewer ? handleReviewerAction(false) : handleManagerAction(false)}
                      disabled={actionLoading}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
                      <ThumbsDown size={15} />
                      {isReviewer ? 'Reject → Back to Maker' : 'Reject → Back to Reviewer'}
                    </button>
                  </div>
                </div>
              )}

              {/* Approved & frozen badge */}
              {selectedSubmission.status === 'APPROVED' && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
                  <Lock size={16} className="text-green-600" />
                  <div>
                    <p className="text-green-700 font-bold text-sm">This month's Sanity is Approved & Frozen</p>
                    <p className="text-green-500 text-xs">
                      Approved by {selectedSubmission.approvedBy} on {selectedSubmission.approvedAt?.seconds
                        ? new Date(selectedSubmission.approvedAt.seconds * 1000).toLocaleDateString('en-GB')
                        : '-'}
                    </p>
                  </div>
                </div>
              )}

              {/* Read-only notice */}
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs text-amber-700 font-bold flex items-center gap-2">
                  <Info size={14} /> Read-only view — {selectedSubmission.monthYear} submitted by {selectedSubmission.submittedBy}
                </p>
              </div>

              {renderResults(normalizeResults(selectedSubmission))}
            </>
          )}
        </>
      )}
    </Layout>
  );
}