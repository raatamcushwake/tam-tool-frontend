import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/common/Layout";
import {
  Upload, ChevronDown, ChevronUp, Filter, Target, TrendingUp,
  FileSpreadsheet, X, CheckCircle, Send, ThumbsUp, ThumbsDown,
  Lock, Info, Download, Building2, ArrowLeft
} from "lucide-react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../services/firebase";
import {
  uploadCostBPFile, getCostBPMetadata,
  submitCostForReview, getAllCostSubmissions,
  reviewerApproveCost, reviewerRejectCost,
  managerApproveCost, managerRejectCost,
  saveApprovedCostBills,
  COST_STATUS_CONFIG
} from "../services/CostAnalysisService";

// ─── Period helpers (same logic as old CostComparisonPage) ───

const getTargetMonthsForPeriod = (periodKey, allQuarterData) => {
  if (!periodKey || !allQuarterData[periodKey]) return [];
  const periodInfo = allQuarterData[periodKey];
  const label = periodKey.toLowerCase().trim();
  const mOrder = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

  if (periodInfo.is_quarterly) {
    const parts = label.split(" ");
    const yearPart = parts[parts.length - 1];
    const monthRange = parts[0];
    if (monthRange.includes("-")) {
      const [startM, endM] = monthRange.split("-");
      const startIdx = mOrder.indexOf(startM.substring(0, 3));
      const endIdx = mOrder.indexOf(endM.substring(0, 3));
      if (startIdx !== -1 && endIdx !== -1) {
        const months = [];
        if (startIdx <= endIdx) {
          for (let i = startIdx; i <= endIdx; i++) months.push(`${mOrder[i]}-${yearPart}`);
        } else {
          for (let i = startIdx; i < 12; i++) months.push(`${mOrder[i]}-${yearPart}`);
          for (let i = 0; i <= endIdx; i++) months.push(`${mOrder[i]}-${parseInt(yearPart)+1}`);
        }
        return months;
      }
    }
  }

  let cleanLabel = label.replace("'", "-");
  const parts = cleanLabel.split("-");
  if (parts.length === 2) {
    const monthPart = parts[0].substring(0, 3);
    let yearPart = parts[1];
    if (yearPart.length === 2) yearPart = "20" + yearPart;
    return [`${monthPart}-${yearPart}`];
  }
  return [label];
};

const getAllMonthsUntilPeriod = (selectedPeriod, availableQuarters, allQuarterData) => {
  if (!selectedPeriod || !availableQuarters.length) return [];
  const selectedData = allQuarterData[selectedPeriod];
  if (!selectedData) return [];
  const quarterlyOnly = availableQuarters.filter(q => allQuarterData[q.label]?.is_quarterly === true);
  const allMonths = [];

  if (selectedData.is_quarterly) {
    for (const quarter of quarterlyOnly) {
      const months = getTargetMonthsForPeriod(quarter.label, allQuarterData);
      allMonths.push(...months);
      if (quarter.label === selectedPeriod) break;
    }
  } else {
    const parentQuarter = selectedData.period;
    const targetMonths = getTargetMonthsForPeriod(selectedPeriod, allQuarterData);
    for (const quarter of quarterlyOnly) {
      if (quarter.label === parentQuarter) {
        const quarterMonths = getTargetMonthsForPeriod(quarter.label, allQuarterData);
        for (const m of quarterMonths) {
          allMonths.push(m);
          if (targetMonths.map(t => t.toLowerCase()).includes(m.toLowerCase())) break;
        }
        break;
      }
      allMonths.push(...getTargetMonthsForPeriod(quarter.label, allQuarterData));
    }
  }
  return allMonths;
};

const buildMergedPeriods = (allBillMonths, budgetByPeriod = {}) => {
  if (!allBillMonths || allBillMonths.length === 0) return { periods: [], periodDataMap: {} };

  const quarterMap = [
    { name: "Jan-Mar", months: ["jan","feb","mar"] },
    { name: "Apr-Jun", months: ["apr","may","jun"] },
    { name: "Jul-Sep", months: ["jul","aug","sep"] },
    { name: "Oct-Dec", months: ["oct","nov","dec"] },
  ];

  const parsed = allBillMonths.map(m => {
    const [mon, yr] = m.split("-");
    return { label: m, mon: mon.toLowerCase().substring(0,3), yr };
  });

  // Last incomplete quarter months — find how many months of the last quarter exist
  // Group all months into quarters first
  const quarterBuckets = {};
  const quarterOrder = [];
  parsed.forEach(({ label, mon, yr }) => {
    const q = quarterMap.find(q => q.months.includes(mon));
    if (!q) return;
    const key = `${q.name} ${yr}`;
    if (!quarterBuckets[key]) {
      quarterBuckets[key] = { months: [], yr, qName: q.name };
      quarterOrder.push(key);
    }
    quarterBuckets[key].months.push(label);
  });

  // Last quarter — check if it has less than 3 months
  const lastQKey = quarterOrder[quarterOrder.length - 1];
  const lastQMonths = quarterBuckets[lastQKey]?.months || [];
  
  // "Last 3 individual months" = all months of the last quarter (1, 2, or 3)
  const last3Set = new Set(lastQMonths.map(m => m.toLowerCase()));
  const before3Keys = quarterOrder.slice(0, -1); // all quarters except last

  const periods = [];
  const periodDataMap = {};

  // Add full quarters with their months underneath
  before3Keys.forEach(key => {
    const val = quarterBuckets[key];
    const budgetVal = Object.entries(budgetByPeriod).find(([bKey]) =>
      bKey.toLowerCase().replace(/\s+/g,"") === key.toLowerCase().replace(/\s+/g,"")
    )?.[1] || 0;

    // Add the quarter option
    periods.push({ label: key, display_label: key, is_sub: false });
    periodDataMap[key] = {
      is_quarterly: true,
      constituent_months: val.months,
      planned_budget: budgetVal,
      period: key
    };

    // Add each month under the quarter
    val.months.forEach(m => {
      periods.push({ label: m, display_label: `   ${m}`, is_sub: true });
      periodDataMap[m] = {
        is_quarterly: false,
        constituent_months: [m],
        planned_budget: budgetVal / 3,  // divide quarter budget by 3
        period: key,
        parentQuarter: key
      };
    });
  });

  // Add last quarter's months as individual (last 1, 2, or 3 months)
  lastQMonths.forEach(m => {
    const budgetVal = Object.entries(budgetByPeriod).find(([bKey]) =>
      bKey.toLowerCase().replace(/\s+/g,"") === lastQKey.toLowerCase().replace(/\s+/g,"")
    )?.[1] || 0;

    periods.push({ label: m, display_label: m, is_sub: false });
    periodDataMap[m] = {
      is_quarterly: false,
      constituent_months: [m],
      planned_budget: budgetVal / 3,
      period: lastQKey,
      parentQuarter: lastQKey
    };
  });

  return { periods, periodDataMap };
};

const buildDisplayColumns = (monthsToUse, allQuarterData, availableQuarters, expandedQuarters, selectedPeriod) => {
  const quarterMap = [
    { name: "Jan-Mar", months: ["jan","feb","mar"] },
    { name: "Apr-Jun", months: ["apr","may","jun"] },
    { name: "Jul-Sep", months: ["jul","aug","sep"] },
    { name: "Oct-Dec", months: ["oct","nov","dec"] },
  ];

  if (!monthsToUse || monthsToUse.length === 0) return [];

  // Determine the selected month's quarter
  const selectedMonth = selectedPeriod || monthsToUse[monthsToUse.length - 1] || "";
  const [selMon, selYr] = selectedMonth.split("-");
  const selectedQ = selMon ? quarterMap.find(q => q.months.includes(selMon.toLowerCase().substring(0,3))) : null;
  const selectedQKey = selectedQ ? `${selectedQ.name} ${selYr}` : "";

  // "Current quarter months" = only months in selected period's quarter that exist in monthsToUse
  const currentQMonths = new Set(
    monthsToUse
      .filter(m => {
        const [mon, yr] = m.split("-");
        const q = quarterMap.find(q => q.months.includes(mon.toLowerCase().substring(0,3)));
        return q && `${q.name} ${yr}` === selectedQKey;
      })
      .map(m => m.toLowerCase())
  );

  // Group non-current-quarter months into collapsed quarter buckets
  const quarterBuckets = {};
  const quarterOrder = [];

  monthsToUse.forEach(month => {
    if (currentQMonths.has(month.toLowerCase())) return;
    const [mon, yr] = month.split("-");
    const q = quarterMap.find(q => q.months.includes(mon.toLowerCase().substring(0,3)));
    if (!q) return;
    const key = `${q.name} ${yr}`;
    if (!quarterBuckets[key]) {
      quarterBuckets[key] = { key, label: key, months: [], yr };
      quarterOrder.push(key);
    }
    quarterBuckets[key].months.push(month);
  });

  const columns = [];

  // Add previous quarter columns (collapsed or expanded)
  quarterOrder.forEach(qKey => {
    const qData = quarterBuckets[qKey];
    if (expandedQuarters.has(qKey)) {
      qData.months.forEach(m => {
        columns.push({ type: "month", label: m, parentQuarter: qKey });
      });
    } else {
      columns.push({ type: "quarter", label: qKey, months: qData.months });
    }
  });

  // Add current quarter's individual months
  monthsToUse
    .filter(m => currentQMonths.has(m.toLowerCase()))
    .forEach(m => {
      columns.push({ type: "month", label: m, parentQuarter: null });
    });

  return columns;
};
// ─── Main Component ───────────────────────────────────────────

export default function CostAnalysis() {
  const navigate = useNavigate();
  const { selectedProject } = useProject();
  const { currentUser } = useAuth();

  const isMaker    = selectedProject?.role === "MAKER";
  const isReviewer = selectedProject?.role === "REVIEWER";
  const isManager  = selectedProject?.role === "MANAGER";

  const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

  // ── BP metadata ──
  const [bpMetadata, setBpMetadata] = useState(null);
  const [bpFile, setBpFile] = useState(null);
  const [bpUploading, setBpUploading] = useState(false);

  // ── Analysis state ──
  const [clearedBillsFile, setClearedBillsFile] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── Period / BP stats ──
  const [availableQuarters, setAvailableQuarters] = useState([]);
  const [allQuarterData, setAllQuarterData] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  // ── Table state ──
  const [expandedCell, setExpandedCell] = useState(null);
  const [expandedQuarters, setExpandedQuarters] = useState(new Set());
  const [activeTab, setActiveTab] = useState("summary");
  const [drillDownFilters, setDrillDownFilters] = useState({
    Tranche: "", Particular: "", Supplier: "", VendorName: "", Month: ""
  });
  const [extractedFilters, setExtractedFilters] = useState({
    Tranche: "", Month: "", "Costing Particular": ""
  });

  // ── Submission / approval state ──
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [currentStatus, setCurrentStatus] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [selectedPeriodLabel, setSelectedPeriodLabel] = useState("");

  const makerCommentRef    = useRef("");
  const reviewerCommentRef = useRef("");
  const managerCommentRef  = useRef("");

  const projectId = selectedProject?.projectId;
  const projectStorageKey = selectedProject?.projectName || projectId;


  // ── Load BP metadata on mount ──
  useEffect(() => {
    if (!projectId) return;
    getCostBPMetadata(projectId).then(setBpMetadata);
  }, [projectId]);

  // ── Maker: load latest submission status + all submissions on mount ──
useEffect(() => {
  if (!projectId || !isMaker) return;
  setSubmissionsLoading(true);
  getAllCostSubmissions(projectId).then(submissions => {
    setAllSubmissions(submissions);       // ← ADD THIS
    setSubmissionsLoading(false);         // ← ADD THIS
    if (submissions.length > 0) {
      const latest = submissions[0];
      setCurrentStatus(latest.status);
      setSelectedPeriodLabel(latest.period);
    }
  });
}, [projectId, isMaker]);

  // ── Load submissions for Reviewer/Manager ──
  useEffect(() => {
    if (!projectId || isMaker) return;
    setSubmissionsLoading(true);
    getAllCostSubmissions(projectId).then(data => {
      setAllSubmissions(data);
      setSubmissionsLoading(false);
    });
  }, [projectId, isMaker]);

  // ── Manager: upload BP ──
  const handleBPUpload = async () => {
    if (!bpFile || !projectId) return;
    setBpUploading(true);
    try {
      const result = await uploadCostBPFile(projectId, bpFile);
      if (result.success) {
        alert("✅ Cost Budget uploaded successfully!");
        getCostBPMetadata(projectId).then(setBpMetadata);
        setBpFile(null);
      } else {
        alert("Error: " + result.error);
      }
    } finally {
      setBpUploading(false);
    }
  };

  // ── Maker: run analysis ──
  const handleRunAnalysis = async () => {
    if (!clearedBillsFile) { alert("Please upload All Cleared Bills file."); return; }
    if (!projectId) { alert("No project selected."); return; }
    // Reset status so submit button shows for new period
    if (currentStatus === "APPROVED") setCurrentStatus(null);
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("cleared_bills", clearedBillsFile);
    formData.append("project_id", projectId);
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/cost/run`, {
        method: "POST",
        body: formData
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Analysis failed");
      setData(result);

      if (result.all_bill_months) {
  const budgetByPeriod = result.bp_stats?.budget_by_period || {};
  const { periods, periodDataMap } = buildMergedPeriods(result.all_bill_months, budgetByPeriod);
  setAvailableQuarters(periods);
  setAllQuarterData(periodDataMap);
  // Default to last period (most recent individual month)
  if (periods.length > 0) {
    setSelectedPeriod(periods[periods.length - 1].label);
  }
}
      setExpandedCell(null);
    } catch (err) {
      alert("Analysis failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Maker: submit for review ──
  const handleSubmitForReview = async () => {
    if (!data || !selectedPeriodLabel) {
      alert("Run analysis and select a period before submitting.");
      return;
    }
    setActionLoading(true);
    try {
      // Upload cleared bills to Storage
      let clearedBillsUrl = "";
      try {
        const fileRef = ref(storage,
          `projects/${projectStorageKey}/pendingCostBills/${selectedPeriodLabel.replace(/\s+/g,"_")}.xlsx`);
        await uploadBytes(fileRef, clearedBillsFile);
        clearedBillsUrl = await getDownloadURL(fileRef);
      } catch (e) {
        console.error("File upload error:", e);
      }

      // Upload rawRows as JSON to Storage (avoids Firestore 1MB limit)
      let rawRowsUrl = "";
      try {
        const jsonBlob = new Blob(
          [JSON.stringify({ raw_rows: data.raw_rows, all_bill_months: data.all_bill_months, revised_ctc_headers: data.revised_ctc_headers || [], bp_ctc_header: data.bp_ctc_header || "CTC As Per BP" })],
          { type: "application/json" }
        );
        const jsonRef = ref(storage,
          `projects/${projectStorageKey}/pendingCostData/${selectedPeriodLabel.replace(/\s+/g,"_")}.json`);
        await uploadBytes(jsonRef, jsonBlob);
        rawRowsUrl = await getDownloadURL(jsonRef);
      } catch (e) {
        console.error("rawRows JSON upload error:", e);
      }

      const result = await submitCostForReview(projectId, selectedPeriodLabel, {
        submittedBy: currentUser.email,
        makerComment: makerCommentRef.current,
        rawRows: [],
        allBillMonths: data.all_bill_months,
        bpStats: data.bp_stats,
        clearedBillsUrl,
        rawRowsUrl,
      });

      if (result.success) {
        setCurrentStatus("PENDING_REVIEW");
        makerCommentRef.current = "";
        alert("✅ Submitted for Review successfully!");
      } else {
        alert("Error: " + result.error);
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ── Reviewer actions ──
  const handleReviewerAction = async (approve) => {
    if (!selectedSubmission) return;
    setActionLoading(true);
    if (approve) {
      await reviewerApproveCost(projectId, selectedSubmission.period,
        currentUser.email, reviewerCommentRef.current);
      alert("✅ Approved! Sent to Manager.");
    } else {
      await reviewerRejectCost(projectId, selectedSubmission.period,
        currentUser.email, reviewerCommentRef.current);
      alert("❌ Rejected. Sent back to Maker.");
    }
    reviewerCommentRef.current = "";
    getAllCostSubmissions(projectId).then(setAllSubmissions);
    setActionLoading(false);
  };

  // ── Manager actions ──
  const handleManagerAction = async (approve) => {
    if (!selectedSubmission) return;
    setActionLoading(true);
    // REPLACE WITH
if (approve) {
  try {
    const periodKey = selectedSubmission.period.replace(/\s+/g, "_");

    // 1. Fetch the JSON from pendingCostData
    const pendingUrl = selectedSubmission.rawRowsUrl;
    const res = await fetch(pendingUrl);
    const jsonData = await res.json();

    // 2. Upload same JSON to approvedCostData/
    const jsonBlob = new Blob([JSON.stringify(jsonData)], { type: "application/json" });
    const approvedJsonRef = ref(storage,
      `projects/${projectStorageKey}/approvedCostData/${periodKey}.json`
    );
    await uploadBytes(approvedJsonRef, jsonBlob);
    const approvedRawRowsUrl = await getDownloadURL(approvedJsonRef);

    // 3. Also move the xlsx if it exists
    let approvedBillsUrl = "";
    if (selectedSubmission.clearedBillsUrl) {
      const xlsxRes = await fetch(selectedSubmission.clearedBillsUrl);
      const xlsxBlob = await xlsxRes.blob();
      const approvedXlsxRef = ref(storage,
        `projects/${projectStorageKey}/approvedCostBills/${periodKey}.xlsx`
      );
      await uploadBytes(approvedXlsxRef, xlsxBlob);
      approvedBillsUrl = await getDownloadURL(approvedXlsxRef);
    }

    // 4. Delete from pendingCostData & pendingCostBills
    try {
      const { deleteObject } = await import("firebase/storage");
      const pendingJsonRef = ref(storage,
        `projects/${projectStorageKey}/pendingCostData/${periodKey}.json`
      );
      await deleteObject(pendingJsonRef);

      if (selectedSubmission.clearedBillsUrl) {
        const pendingXlsxRef = ref(storage,
          `projects/${projectStorageKey}/pendingCostBills/${periodKey}.xlsx`
        );
        await deleteObject(pendingXlsxRef);
      }
    } catch (delErr) {
      console.warn("Delete from pending failed (non-critical):", delErr);
    }

    // 5. Update Firestore with new approved URLs
    await managerApproveCost(projectId, selectedSubmission.period,
      currentUser.email, managerCommentRef.current);

    await saveApprovedCostBills(
      projectId,
      selectedSubmission.period,
      approvedRawRowsUrl,       // now points to approvedCostData/
      approvedBillsUrl,
      selectedSubmission.allBillMonths || []
    );

    alert("✅ Final Approved & Frozen!");

  } catch (e) {
    console.error("Manager approve error:", e);
    alert("Error during approval: " + e.message);
  }
} else {
      await managerRejectCost(projectId, selectedSubmission.period,
        currentUser.email, managerCommentRef.current);
      alert("❌ Rejected. Sent back to Reviewer.");
    }
    managerCommentRef.current = "";
    getAllCostSubmissions(projectId).then(setAllSubmissions);
    setActionLoading(false);
  };

  // ── Computed table ──
  const computedTable = useMemo(() => {
    if (!data || !data.raw_rows || !selectedPeriod) return null;
    const allMonths = data.all_bill_months || [];
const selectedPeriodData = allQuarterData[selectedPeriod];
let monthsToUse = allMonths;

if (selectedPeriodData) {
  if (selectedPeriodData.is_quarterly) {
    // Quarterly selection — show all months up to end of this quarter
    const constituentMonths = selectedPeriodData.constituent_months || [];
    const lastMonthOfQuarter = constituentMonths[constituentMonths.length - 1];
    const lastIdx = allMonths.findIndex(m => m.toLowerCase() === lastMonthOfQuarter?.toLowerCase());
    monthsToUse = lastIdx >= 0 ? allMonths.slice(0, lastIdx + 1) : allMonths;
  } else {
    // Individual month — show all months up to and including selected month
    const idx = allMonths.findIndex(m => m.toLowerCase() === selectedPeriod?.toLowerCase());
    monthsToUse = idx >= 0 ? allMonths.slice(0, idx + 1) : allMonths;
  }
}

    const rows = data.raw_rows.map(row => {
      const preRaw = row.pre_val * 10000000;
      const bpCtcRaw = row.bp_ctc * 10000000;
      const revisedCtcRaw = row.revised_ctc * 10000000;
      const allRevisedCtcs = row.all_revised_ctcs || [{ label: "Revised CTC", value: row.revised_ctc }];
      let postSum = 0;
const monthCells = {};
const quarterCells = {};
monthsToUse.forEach(month => {
  const monthData = row.per_month_bills[month] || { amount: 0, transactions: [] };
  postSum += monthData.amount;
  monthCells[month] = monthData;
});
const qMap = [
  { name: "Jan-Mar", months: ["jan","feb","mar"] },
  { name: "Apr-Jun", months: ["apr","may","jun"] },
  { name: "Jul-Sep", months: ["jul","aug","sep"] },
  { name: "Oct-Dec", months: ["oct","nov","dec"] },
];
monthsToUse.forEach(month => {
  const [mon, yr] = month.split("-");
  const q = qMap.find(q => q.months.includes(mon.toLowerCase().substring(0,3)));
  if (!q) return;
  const key = `${q.name} ${yr}`;
  if (!quarterCells[key]) quarterCells[key] = { amount: 0, transactions: [] };
  quarterCells[key].amount += monthCells[month]?.amount || 0;
  quarterCells[key].transactions.push(...(monthCells[month]?.transactions || []));
});
      const totalCostIncurred = preRaw + postSum;
      let escalation = 0;
if (row.bp_ctc === row.revised_ctc) {
  escalation = row.bp_ctc - (totalCostIncurred / 10000000);
} else {
  escalation = row.revised_ctc - row.bp_ctc;
}
      const balanceBP = bpCtcRaw - totalCostIncurred;
      const balanceCTC = revisedCtcRaw - totalCostIncurred;
      const balancePct = revisedCtcRaw > 0 ? (balanceCTC / revisedCtcRaw) * 100 : 0;
      const nearBudget = revisedCtcRaw > 0 && balancePct < 25;
      return {
        particular: row.particular, bp_ctc: row.bp_ctc, revised_ctc: row.revised_ctc,
        all_revised_ctcs: allRevisedCtcs,
        pre_val: row.pre_val, monthCells, quarterCells, postTotal: postSum, totalCostIncurred,
        escalation, balanceBP, balanceCTC, balancePct, nearBudget
      };
    });

    const totals = rows.reduce((acc, r) => {
      acc.pre_val += r.pre_val; acc.bp_ctc += r.bp_ctc; acc.revised_ctc += r.revised_ctc;
      acc.postTotal += r.postTotal; acc.totalCostIncurred += r.totalCostIncurred;
      acc.escalation += r.escalation > 0 ? r.escalation : 0;
      acc.balanceBP += r.balanceBP > 0 ? r.balanceBP : 0;
      acc.balanceCTC += r.balanceCTC > 0 ? r.balanceCTC : 0;
      monthsToUse.forEach(m => {
        acc.monthTotals[m] = (acc.monthTotals[m] || 0) + (r.monthCells[m]?.amount || 0);
      });
      Object.entries(r.quarterCells || {}).forEach(([qKey, qVal]) => {
  acc.quarterTotals[qKey] = (acc.quarterTotals[qKey] || 0) + qVal.amount;
});
      (r.all_revised_ctcs || []).forEach((rv, i) => {
        acc.all_revised_ctcs[i] = (acc.all_revised_ctcs[i] || 0) + rv.value;
      });
      return acc;
    }, { bp_ctc:0, revised_ctc:0, all_revised_ctcs:[], pre_val:0, postTotal:0, totalCostIncurred:0,
  escalation:0, balanceBP:0, balanceCTC:0, monthTotals:{}, quarterTotals:{} });

    return { rows, totals, activeMonths: monthsToUse };
  }, [data, selectedPeriod, allQuarterData, availableQuarters]);

  const fmt = (val) => ((parseFloat(val) || 0) / 10000000).toFixed(2);

  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === "None" || dateStr === "nan") return "";
    try {
      const date = new Date(dateStr);
      if (isNaN(date)) return dateStr;
      return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
    } catch { return dateStr; }
  };

  // ── Budget Overview card ──
  const getBPValue = () => {
    if (!selectedPeriod || !allQuarterData[selectedPeriod]) return 0;
    return allQuarterData[selectedPeriod].planned_budget || 0;
  };

  const getActualValue = () => {
    if (!data?.extracted_bills?.data) return null;
    const targetMonths = getTargetMonthsForPeriod(selectedPeriod, allQuarterData);
    if (!targetMonths.length) return null;
    const normalizedTargets = targetMonths.map(m => m.toLowerCase().trim());
    const hasData = normalizedTargets.some(m =>
      data.extracted_bills.data.some(b => String(b["Month"]||"").toLowerCase().trim() === m)
    );
    if (!hasData) return null;
    return data.extracted_bills.data
      .filter(b => normalizedTargets.includes(String(b["Month"]||"").toLowerCase().trim()))
      .reduce((s, b) => s + parseFloat(b["Payment cleared"] || 0), 0);
  };

  // ── DrillDown ──
  const DrillDownSection = ({ transactions }) => {
    const uniqueTranches  = [...new Set(transactions.map(t => t.Tranche))].sort();
    const uniqueParticulars = [...new Set(transactions.map(t => t["Costing Particular"]))].sort();
    const uniqueSuppliers = [...new Set(transactions.map(t => t["Supplier/ Vendor/Customer/Salaries/Others"]))].sort();
    const uniqueVendorNames = [...new Set(transactions.map(t => t["Name"]))].filter(Boolean).sort();
    const uniqueMonths    = [...new Set(transactions.map(t => t.Month))].filter(Boolean).sort();

    const filtered = transactions.filter(t =>
      (drillDownFilters.Tranche === "" || t.Tranche === drillDownFilters.Tranche) &&
      (drillDownFilters.Particular === "" || t["Costing Particular"] === drillDownFilters.Particular) &&
      (drillDownFilters.Supplier === "" || t["Supplier/ Vendor/Customer/Salaries/Others"] === drillDownFilters.Supplier) &&
      (drillDownFilters.VendorName === "" || t["Name"] === drillDownFilters.VendorName) &&
      (drillDownFilters.Month === "" || t.Month === drillDownFilters.Month)
    );
    const totalPayment = filtered.reduce((s, t) => s + parseFloat(t["Payment cleared"] || 0), 0);

    return (
      <div className="p-6 bg-amber-50 border-t-2 border-amber-400">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white border border-amber-200 rounded-xl p-4">
            <span className="text-[11px] text-indigo-600 font-bold uppercase">Total Payment</span>
            <div className="text-2xl font-black text-gray-900">₹{(totalPayment/10000000).toFixed(2)} Cr</div>
            <span className="text-xs text-gray-500">(₹{totalPayment.toLocaleString("en-IN", {maximumFractionDigits:0})})</span>
          </div>
          <div className="bg-white border border-amber-300 rounded-xl p-4">
            <span className="text-[11px] text-purple-600 font-bold uppercase">No. of Bills</span>
            <div className="text-2xl font-black text-gray-900">{filtered.length}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mb-4 bg-amber-100 p-4 rounded-xl border border-amber-300">
          <Filter size={16} className="text-indigo-600 mt-2" />
          {[
            { label: "All Tranches", key: "Tranche", opts: uniqueTranches },
            { label: "All Particulars", key: "Particular", opts: uniqueParticulars },
            { label: "All Suppliers", key: "Supplier", opts: uniqueSuppliers },
            { label: "All Vendors", key: "VendorName", opts: uniqueVendorNames },
            { label: "All Months", key: "Month", opts: uniqueMonths },
          ].map(({ label, key, opts }) => (
            <select key={key}
              className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-[13px] outline-none"
              value={drillDownFilters[key]}
              onChange={e => setDrillDownFilters(p => ({ ...p, [key]: e.target.value }))}>
              <option value="">{label}</option>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          <button className="text-gray-400 text-xs underline"
            onClick={() => setDrillDownFilters({ Tranche:"", Particular:"", Supplier:"", VendorName:"", Month:"" })}>
            Reset
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-[13px] text-left border-collapse">
            <thead className="bg-amber-100 text-amber-800 uppercase text-[11px] font-black">
              <tr>
                <th className="px-4 py-3 border-r border-gray-200">Tranche</th>
                <th className="px-4 py-3 border-r border-gray-200">Date</th>
                <th className="px-4 py-3 border-r border-gray-200">Particular</th>
                <th className="px-4 py-3 border-r border-gray-200">Vendor</th>
                <th className="px-4 py-3 border-r border-gray-200">Supplier</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {filtered.map((t, idx) => (
                <tr key={idx} className="hover:bg-amber-100">
                  <td className="px-4 py-3 border-r border-gray-100">{t.Tranche}</td>
                  <td className="px-4 py-3 border-r border-gray-100">{formatDate(t["Payment Clearance date"])}</td>
                  <td className="px-4 py-3 border-r border-gray-100">{t["Costing Particular"]}</td>
                  <td className="px-4 py-3 border-r border-gray-100">{t["Name"]}</td>
                  <td className="px-4 py-3 border-r border-gray-100">{t["Supplier/ Vendor/Customer/Salaries/Others"]}</td>
                  <td className="px-4 py-3 text-right font-bold">
                    {parseFloat(t["Payment cleared"]).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Main summary table ──
  const renderSummaryTable = (tableData) => {
  if (!tableData) return null;
  const { rows, totals, activeMonths } = tableData;
  const displayCols = buildDisplayColumns(activeMonths, allQuarterData, availableQuarters, expandedQuarters, selectedPeriod);

  return (
    <div className="overflow-x-auto w-full border border-gray-200 rounded-xl bg-white shadow-sm">
      <table className="w-full text-[13px] text-left text-gray-700 border-collapse">
        <thead className="bg-gray-50 sticky top-0 z-20">
          <tr>
            <th className="px-4 py-3 border border-gray-200 text-indigo-600 font-black uppercase text-[12px]" rowSpan={2}>Particulars</th>
            <th className="px-4 py-3 border border-gray-200 text-center text-indigo-600 font-black uppercase text-[12px]" colSpan={2 + (data?.revised_ctc_headers?.length || 1)}>Pre</th>
            <th className="px-4 py-3 border border-gray-200 text-center text-indigo-600 font-black uppercase text-[12px]" colSpan={displayCols.length + 1}>Post Disbursement</th>
            <th className="px-4 py-3 border border-gray-200 text-center text-indigo-600 font-black uppercase text-[12px]">Total Cost Incurred</th>
            <th className="px-4 py-3 border border-gray-200 text-center text-indigo-600 font-black uppercase text-[12px]">Escalation</th>
            <th className="px-4 py-3 border border-gray-200 text-center text-indigo-600 font-black uppercase text-[12px]">Balance against Business Plan W/O Escalation</th>
            <th className="px-4 py-3 border border-gray-200 text-center text-indigo-600 font-black uppercase text-[12px]">Balance CTC incl. Escalation</th>
          </tr>
          <tr className="bg-indigo-50">
            <th className="px-3 py-2 border border-gray-200 text-[11px] text-gray-500 font-bold text-center whitespace-nowrap">{data?.bp_ctc_header || "CTC As Per BP"}</th>
            {(data?.revised_ctc_headers || ["Revised CTC"]).map((hdr, i) => (
              <th key={i} className="px-3 py-2 border border-gray-200 text-[11px] text-gray-500 font-bold text-center whitespace-nowrap">{hdr}</th>
            ))}
            <th className="px-3 py-2 border border-gray-200 text-[11px] text-gray-500 font-bold text-center whitespace-nowrap">Pre Expenses</th>
            {displayCols.map((col, i) => (
              col.type === "quarter" ? (
                <th key={i}
                  className="px-3 py-2 border border-gray-200 text-[11px] text-indigo-500 font-bold text-center whitespace-nowrap cursor-pointer hover:bg-indigo-100 select-none"
                  onClick={() => {
                    setExpandedQuarters(prev => {
                      const next = new Set(prev);
                      next.has(col.label) ? next.delete(col.label) : next.add(col.label);
                      return next;
                    });
                  }}>
                  {col.label} {expandedQuarters.has(col.label) ? "▲" : "▼"}
                </th>
              ) : (
                <th key={i} className={`px-3 py-2 border border-gray-200 text-[11px] font-bold text-center whitespace-nowrap ${col.parentQuarter ? "text-purple-500 bg-purple-50 cursor-pointer hover:bg-purple-100" : "text-gray-500"}`}
                  onClick={() => {
                    if (col.parentQuarter) {
                      setExpandedQuarters(prev => {
                        const next = new Set(prev);
                        next.delete(col.parentQuarter);
                        return next;
                      });
                    }
                  }}>
                  {col.parentQuarter ? `▲ ${col.label}` : col.label}
                </th>
              )
            ))}
            <th className="px-3 py-2 border border-gray-200 text-[11px] text-gray-500 font-bold text-center whitespace-nowrap">Total Post</th>
            <th className="px-3 py-2 border border-gray-200 text-[11px] text-gray-500 font-bold text-center"></th>
            <th className="px-3 py-2 border border-gray-200 text-[11px] text-gray-500 font-bold text-center"></th>
            <th className="px-3 py-2 border border-gray-200 text-[11px] text-gray-500 font-bold text-center"></th>
            <th className="px-3 py-2 border border-gray-200 text-[11px] text-gray-500 font-bold text-center"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, rowIdx) => (
            <React.Fragment key={rowIdx}>
              <tr className={expandedCell?.startsWith(`${rowIdx}-`) ? "bg-amber-50" : "hover:bg-indigo-50"}>
                <td className="px-4 py-3 border border-gray-100 font-bold">{row.particular}</td>
                <td className="px-4 py-3 border border-gray-100 text-right">{row.bp_ctc.toFixed(2)}</td>
                {(row.all_revised_ctcs || [{ label: "Revised CTC", value: row.revised_ctc }]).map((r, i) => (
                  <td key={i} className="px-4 py-3 border border-gray-100 text-right">{r.value.toFixed(2)}</td>
                ))}
                <td className="px-4 py-3 border border-gray-100 text-right">{row.pre_val.toFixed(2)}</td>
                {displayCols.map((col, colIdx) => {
                  if (col.type === "quarter") {
                    const qData = row.quarterCells?.[col.label];
                    const amt = qData?.amount || 0;
                    const hasTx = qData?.transactions?.length > 0;
                    const cellKey = `${rowIdx}-q-${col.label}`;
                    const isExp = expandedCell === cellKey;
                    return (
                      <td key={colIdx}
                        className={`px-4 py-3 border border-gray-100 text-right bg-indigo-50 ${hasTx ? "cursor-pointer text-indigo-600 hover:bg-amber-100" : ""} ${isExp ? "bg-amber-200" : ""}`}
                        onClick={() => hasTx && setExpandedCell(isExp ? null : cellKey)}>
                        <div className="flex items-center justify-end gap-1">
                          {hasTx && (isExp ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)}
                          {fmt(amt)}
                        </div>
                      </td>
                    );
                  } else {
                    const cellData = row.monthCells[col.label];
                    const hasTx = cellData?.transactions?.length > 0;
                    const cellKey = `${rowIdx}-${col.label}`;
                    const isExp = expandedCell === cellKey;
                    return (
                      <td key={colIdx}
                        className={`px-4 py-3 border border-gray-100 text-right ${col.parentQuarter ? "bg-purple-50" : ""} ${hasTx ? "cursor-pointer text-indigo-600 hover:bg-amber-100" : ""} ${isExp ? "bg-amber-200" : ""}`}
                        onClick={() => hasTx && setExpandedCell(isExp ? null : cellKey)}>
                        <div className="flex items-center justify-end gap-1">
                          {hasTx && (isExp ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)}
                          {fmt(cellData?.amount || 0)}
                        </div>
                      </td>
                    );
                  }
                })}
                <td className="px-4 py-3 border border-gray-100 text-right">{fmt(row.postTotal)}</td>
                <td className="px-4 py-3 border border-gray-100 text-right">{fmt(row.totalCostIncurred)}</td>
                <td className="px-4 py-3 border border-gray-100 text-right">{row.escalation.toFixed(2)}</td>
                <td className="px-4 py-3 border border-gray-100 text-right">{fmt(row.balanceBP)}</td>
                <td className="px-4 py-3 border border-gray-100 text-right">
                  {row.nearBudget ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-bold">{fmt(row.balanceCTC > 0 ? row.balanceCTC : 0)}</span>
                      <span className="text-[10px] bg-rose-500 text-white px-2 py-0.5 rounded font-black animate-pulse">Near CTC Budget</span>
                      <span className="text-[9px] text-gray-500">{row.balancePct.toFixed(2)}% remaining</span>
                    </div>
                  ) : fmt(row.balanceCTC > 0 ? row.balanceCTC : 0)}
                </td>
              </tr>
              {expandedCell?.startsWith(`${rowIdx}-`) && (
                <tr>
                  <td colSpan={4 + displayCols.length + 6} className="p-0 border-none">
                    <DrillDownSection
                      transactions={
                        expandedCell.includes("-q-")
                          ? (row.quarterCells?.[expandedCell.replace(`${rowIdx}-q-`, "")]?.transactions || [])
                          : (row.monthCells[expandedCell.replace(`${rowIdx}-`, "")]?.transactions || [])
                      }
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          <tr className="bg-indigo-100 font-black text-gray-900 text-[14px]">
            <td className="px-4 py-4 border border-gray-200">TOTAL</td>
            <td className="px-4 py-4 border border-gray-200 text-right">{totals.bp_ctc.toFixed(2)}</td>
            {(totals.all_revised_ctcs || [totals.revised_ctc]).map((val, i) => (
              <td key={i} className="px-4 py-4 border border-gray-200 text-right">{(val || 0).toFixed(2)}</td>
            ))}
            <td className="px-4 py-4 border border-gray-200 text-right">{totals.pre_val.toFixed(2)}</td>
            {displayCols.map((col, i) => (
              <td key={i} className="px-4 py-4 border border-gray-200 text-right">
                {col.type === "quarter"
                  ? fmt(totals.quarterTotals?.[col.label] || 0)
                  : fmt(totals.monthTotals?.[col.label] || 0)}
              </td>
            ))}
            <td className="px-4 py-4 border border-gray-200 text-right">{fmt(totals.postTotal)}</td>
            <td className="px-4 py-4 border border-gray-200 text-right">{fmt(totals.totalCostIncurred)}</td>
            <td className="px-4 py-4 border border-gray-200 text-right">{totals.escalation.toFixed(2)}</td>
            <td className="px-4 py-4 border border-gray-200 text-right">{fmt(totals.balanceBP)}</td>
            <td className="px-4 py-4 border border-gray-200 text-right">{fmt(totals.balanceCTC)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

  // ── Extracted Bills Tab ──
  const filteredExtractedBills = useMemo(() => {
    if (!data) return [];
    return data.extracted_bills.data.filter(bill =>
      Object.keys(extractedFilters).every(key =>
        extractedFilters[key] === "" || String(bill[key] || "") === extractedFilters[key]
      )
    );
  }, [data, extractedFilters]);

  const getExtractedOptions = (key) => {
    if (!data) return [];
    return [...new Set(data.extracted_bills.data.map(b => b[key]))].filter(Boolean).sort();
  };

  const renderExtractedTab = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 bg-indigo-50 p-4 rounded-xl border border-indigo-200">
        <Filter size={16} className="text-indigo-600" />
        {[
          { label: "Tranche", key: "Tranche" },
          { label: "Month", key: "Month" },
          { label: "Particular", key: "Costing Particular" },
          { label: "Vendor", key: "Name" }
        ].map(item => (
          <select key={item.key}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs outline-none"
            value={extractedFilters[item.key] || ""}
            onChange={e => setExtractedFilters(p => ({ ...p, [item.key]: e.target.value }))}>
            <option value="">All {item.label}s</option>
            {getExtractedOptions(item.key).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <button className="text-gray-400 text-xs underline"
          onClick={() => setExtractedFilters({ Tranche:"", Month:"", "Costing Particular":"" })}>
          Reset
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <span className="text-[11px] text-indigo-600 font-bold uppercase">Total Bills</span>
          <div className="text-2xl font-black">{filteredExtractedBills.length}</div>
        </div>
        <div className="bg-white border border-amber-300 rounded-xl p-4">
          <span className="text-[11px] text-purple-600 font-bold uppercase">Total Value</span>
          <div className="text-2xl font-black">
            ₹{(filteredExtractedBills.reduce((s,b) => s + parseFloat(b["Payment cleared"]||0),0)/10000000).toFixed(2)} Cr
          </div>
        </div>
      </div>
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm">
        <table className="w-full text-[13px] text-left border-collapse">
          <thead className="bg-gray-50">
            <tr>
              {data.extracted_bills.columns.map((col, i) => (
                <th key={i} className="px-4 py-4 border-b border-gray-200 font-bold uppercase text-gray-500 text-xs">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredExtractedBills.map((row, i) => (
              <tr key={i} className="hover:bg-indigo-50">
                {data.extracted_bills.columns.map((col, j) => (
                  <td key={j} className="px-4 py-3 border-r border-gray-100">
                    {col === "Payment cleared"
                      ? parseFloat(row[col]||0).toLocaleString("en-IN", {minimumFractionDigits:2})
                      : col === "Payment Clearance date"
                        ? formatDate(row[col])
                        : row[col]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Full analysis UI (shared: Maker after run, Reviewer/Manager read-only) ──
  const renderAnalysis = (tableData) => {
    const bpValue = getBPValue();
    const actualValue = getActualValue();
    const selectedOption = availableQuarters.find(q => q.label === selectedPeriod);

    return (
      <div className="space-y-6">
        {/* Budget vs Actual Overview */}
        {availableQuarters.length > 0 && (
          <div className="mb-4 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
              <span className="text-sm font-black uppercase tracking-widest text-gray-700">Budget vs Actual Overview</span>
              <select
                value={selectedPeriod || ""}
                onChange={e => { setSelectedPeriod(e.target.value); setExpandedCell(null); }}
                className="bg-white border border-gray-300 text-gray-800 px-4 py-2 rounded-lg font-bold text-sm outline-none">
                {availableQuarters.map((q, i) => (
                <option key={i} value={q.label}
                  style={{ paddingLeft: q.is_sub ? "20px" : "0", color: q.is_sub ? "#6366f1" : "#111" }}>
                  {q.display_label || q.label}
                </option>
              ))}
              </select>
            </div>
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="px-6 py-5 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-cyan-600">
                  <Target size={16} />
                  <span className="text-xs font-black uppercase tracking-widest">Planned Budget (BP)</span>
                </div>
                <span className="text-2xl font-black text-gray-900">₹{bpValue.toFixed(2)} Cr</span>
                <span className="text-xs text-gray-500">(₹{(bpValue*10000000).toLocaleString("en-IN", {maximumFractionDigits:0})})</span>
                <span className="text-[10px] text-gray-400 uppercase font-bold">For: {selectedOption?.display_label || selectedPeriod}</span>
              </div>
              <div className="px-6 py-5 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-purple-600">
                  <TrendingUp size={16} />
                  <span className="text-xs font-black uppercase tracking-widest">Actual Expenses</span>
                </div>
                <span className={`text-2xl font-black ${actualValue === null ? "text-gray-400" : "text-emerald-600"}`}>
                  {actualValue === null ? "N/A" : `₹${(actualValue/10000000).toFixed(2)} Cr`}
                </span>
                {actualValue !== null && (
                  <span className="text-xs text-gray-500">(₹{actualValue.toLocaleString("en-IN", {maximumFractionDigits:0})})</span>
                )}
                <span className="text-[10px] text-gray-400 uppercase font-bold">For: {selectedPeriod}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 p-1.5 bg-gray-100 rounded-xl border border-gray-200 w-fit">
          <button onClick={() => setActiveTab("summary")}
            className={`px-8 py-2.5 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === "summary" ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 hover:text-gray-700"}`}>
            Summary
          </button>
          <button onClick={() => setActiveTab("extracted")}
            className={`px-8 py-2.5 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === "extracted" ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 hover:text-gray-700"}`}>
            Detailed Bills
          </button>
        </div>

        {activeTab === "summary" ? renderSummaryTable(tableData) : renderExtractedTab()}
      </div>
    );
  };

  // ── Submissions list for Reviewer/Manager ──
  const renderSubmissionsList = () => (
    <div className="mb-6">
      <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">
  {isReviewer ? "Cost Submissions — Pending Review" 
   : isManager ? "Cost Submissions — Pending Approval"
   : "My Submissions"}
</p>
      {submissionsLoading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">Loading submissions...</p>
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
              onClick={async () => {
                setSelectedSubmission(sub);
                // Set basic data first so UI shows loading state
                setData(null);
                const budgetByPeriod = sub.bpStats?.budget_by_period || {};
                const { periods: mergedPeriods, periodDataMap: mergedMap } = buildMergedPeriods(sub.allBillMonths || [], budgetByPeriod);
                setAvailableQuarters(mergedPeriods);
                setAllQuarterData(mergedMap);
                if (mergedPeriods.length > 0) setSelectedPeriod(mergedPeriods[mergedPeriods.length - 1].label);

                // Fetch rawRows from Storage URL
                try {
                  if (sub.rawRowsUrl) {
                    const res = await fetch(sub.rawRowsUrl, { mode: "cors" });
                    const json = await res.json();
                    const rawRows = json.raw_rows || [];
                    const cols = ["Tranche","Payment Clearance date","Month","Costing Particular","Supplier/ Vendor/Customer/Salaries/Others","Name","Payment cleared"];
                    const allTransactions = [];
                    rawRows.forEach(row => {
                      Object.values(row.per_month_bills || {}).forEach(monthData => {
                        (monthData.transactions || []).forEach(t => allTransactions.push(t));
                      });
                    });
                    setData({
  raw_rows: rawRows,
  all_bill_months: sub.allBillMonths || [],
  revised_ctc_headers: json.revised_ctc_headers || null,
  bp_ctc_header: json.bp_ctc_header || "CTC As Per BP",
  extracted_bills: { columns: cols, data: allTransactions },
  bp_stats: sub.bpStats || {}
});
                  } else {
                    // Fallback for old submissions that had rawRows in Firestore
                    const cols = ["Tranche","Payment Clearance date","Month","Costing Particular","Supplier/ Vendor/Customer/Salaries/Others","Name","Payment cleared"];
                    const allTransactions = [];
                    (sub.rawRows || []).forEach(row => {
                      Object.values(row.per_month_bills || {}).forEach(monthData => {
                        (monthData.transactions || []).forEach(t => allTransactions.push(t));
                      });
                    });
                    setData({
                      raw_rows: sub.rawRows || [],
                      all_bill_months: sub.allBillMonths || [],
                      revised_ctc_headers: null,
                      extracted_bills: { columns: cols, data: allTransactions },
                      bp_stats: sub.bpStats || {}
                    });
                  }
                } catch (e) {
                  console.error("Failed to fetch rawRows from Storage:", e);
                  alert("Failed to load submission data. Please try again.");
                }
              }}
              className={`bg-white border rounded-2xl p-5 cursor-pointer hover:border-indigo-300 transition-all shadow-sm
                ${selectedSubmission?.id === sub.id ? "border-indigo-500 bg-indigo-50/30" : "border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-gray-900 text-base">{sub.period}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Submitted by: {sub.submittedBy} · {new Date(sub.submittedAt).toLocaleDateString("en-GB", {day:"2-digit",month:"short",year:"numeric"})}
                  </p>
                  {sub.makerComment && <p className="text-xs text-blue-600 mt-1 italic">💬 "{sub.makerComment}"</p>}
                  {sub.reviewerComment && <p className="text-xs text-purple-600 mt-1 italic">👁 Reviewer: "{sub.reviewerComment}"</p>}
                  {sub.rejectionComment && <p className="text-xs text-red-500 mt-1 italic">❌ "{sub.rejectionComment}"</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${COST_STATUS_CONFIG[sub.status]?.color}`}>
                    {COST_STATUS_CONFIG[sub.status]?.label}
                  </span>
                  {selectedSubmission?.id === sub.id && (
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

  // ─── RENDER ───────────────────────────────────────────────────
  return (
    <Layout title="Cost Analysis">
      <button onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="mb-6">
        <h3 className="text-gray-800 font-bold text-lg">Cost Analysis</h3>
        <p className="text-gray-400 text-sm mt-1">
          {isMaker ? "Upload cleared bills, run analysis and submit for review." :
           isReviewer ? "Review submitted cost analysis and approve or reject." :
           "Upload Cost Budget and give final approval to cost submissions."}
        </p>
      </div>

      {/* BP Upload moved to Reference Upload page */}

      {/* ── MANAGER: Approval Panel ── */}
      {isManager && renderSubmissionsList()}
      {isManager && selectedSubmission && (
        <>
          {selectedSubmission.status === "PENDING_MANAGER" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
              <p className="text-sm font-black uppercase text-gray-400 mb-3">
                ✅ Manager Final Action — {selectedSubmission.period}
              </p>
              <textarea
                onChange={e => { managerCommentRef.current = e.target.value; }}
                placeholder="Add your comment (optional)..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-indigo-400 resize-none mb-3"
                rows={2}
              />
              <div className="flex gap-3">
                <button onClick={() => handleManagerAction(true)} disabled={actionLoading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  <ThumbsUp size={15}/> Final Approve & Freeze
                </button>
                <button onClick={() => handleManagerAction(false)} disabled={actionLoading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  <ThumbsDown size={15}/> Reject → Back to Reviewer
                </button>
              </div>
            </div>
          )}
          {selectedSubmission.status === "APPROVED" && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
              <Lock size={16} className="text-green-600" />
              <p className="text-green-700 font-bold text-sm">This submission is Approved & Frozen</p>
            </div>
          )}
          {computedTable && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-700 font-bold flex items-center gap-2">
                <Info size={14}/> Read-only view — {selectedSubmission.period} submitted by {selectedSubmission.submittedBy}
              </p>
            </div>
          )}
          {computedTable && renderAnalysis(computedTable)}
        </>
      )}

      {/* ── REVIEWER: Panel ── */}
      {isReviewer && renderSubmissionsList()}
      {isReviewer && selectedSubmission && (
        <>
          {selectedSubmission.status === "PENDING_REVIEW" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
              <p className="text-sm font-black uppercase text-gray-400 mb-3">
                👁 Reviewer Action — {selectedSubmission.period}
              </p>
              <textarea
                onChange={e => { reviewerCommentRef.current = e.target.value; }}
                placeholder="Add your comment (optional)..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-indigo-400 resize-none mb-3"
                rows={2}
              />
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
          {computedTable && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-700 font-bold flex items-center gap-2">
                <Info size={14}/> Read-only view — {selectedSubmission.period}
              </p>
            </div>
          )}
          {computedTable && renderAnalysis(computedTable)}
        </>
      )}

      {/* ── MAKER: Upload + Run + Submit ── */}
      {isMaker && (
  <>
    {/* Submissions History for Maker */}
    {renderSubmissionsList()}
          {/* BP Status */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Cost Budget Status</p>
            <div className={`p-4 rounded-xl border ${bpMetadata ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex items-center gap-2 mb-1">
                <Building2 size={16} className={bpMetadata ? "text-green-600" : "text-red-500"} />
                <span className="text-sm font-black uppercase text-gray-700">Cost Budget (BP) Sheet</span>
              </div>
              {bpMetadata ? (
                <>
                  <p className="text-xs text-green-600 font-semibold">{bpMetadata.fileName}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Uploaded: {new Date(bpMetadata.uploadedAt).toLocaleDateString("en-GB")}
                    {bpMetadata.uploadedByEmail ? ` · By: ${bpMetadata.uploadedByEmail}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-xs text-red-500 font-semibold mt-1">⚠ Manager needs to upload the Cost Budget sheet</p>
              )}
            </div>
          </div>

          {/* Period label input */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mb-6">
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              Period Label (for submission)
            </label>
            <input
              type="text"
              placeholder='e.g., "Jul-Sep 2024" or "Oct 2024"'
              value={selectedPeriodLabel}
              onChange={e => {
                setSelectedPeriodLabel(e.target.value);
                // If typing a new period different from approved one, reset status
                if (currentStatus === "APPROVED" && e.target.value !== selectedPeriodLabel) {
                  setCurrentStatus(null);
                }
              }}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">This label identifies the submission in the approval flow.</p>
            {currentStatus && (
              <div className={`mt-3 px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 ${COST_STATUS_CONFIG[currentStatus]?.color}`}>
                <Lock size={12}/> {selectedPeriodLabel} Status: {COST_STATUS_CONFIG[currentStatus]?.label}
              </div>
            )}
          </div>

          {/* Cleared Bills Upload */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
            <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-4">
              <Upload className="text-emerald-500" size={20}/>
              <h3 className="text-lg font-bold text-gray-900">Upload All Cleared Bills</h3>
            </div>
            <label className="h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 transition-colors">
              {clearedBillsFile
                ? <span className="text-emerald-600 text-sm font-bold">{clearedBillsFile.name}</span>
                : <span className="text-gray-400 text-sm">Click to upload All Cleared Bills</span>}
              <input type="file" className="hidden" accept=".xlsx,.xls"
                onChange={e => e.target.files[0] && setClearedBillsFile(e.target.files[0])} />
            </label>
          </div>

          {/* Run Button */}
          <div className="flex justify-center mb-8">
            <button onClick={handleRunAnalysis} disabled={loading || !clearedBillsFile || !bpMetadata}
              className={`px-24 py-4 rounded-xl font-bold uppercase tracking-widest text-lg transition-all
                ${!loading && clearedBillsFile && bpMetadata
                  ? "bg-indigo-600 shadow-md hover:scale-[1.01] text-white hover:bg-indigo-700"
                  : "bg-gray-200 cursor-not-allowed text-gray-400"}`}>
              {loading ? "Analyzing..." : "Run Analysis"}
            </button>
          </div>

          {/* After run: submit + analysis */}
          {data && computedTable && (
            <>
              {currentStatus !== "APPROVED" && (
                <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Send size={16} className="text-indigo-600"/>
                    <p className="text-sm font-black uppercase text-indigo-600">Submit for Review</p>
                    {currentStatus && (
                      <span className={`ml-auto text-xs font-black px-3 py-1 rounded-full border ${COST_STATUS_CONFIG[currentStatus]?.color}`}>
                        {COST_STATUS_CONFIG[currentStatus]?.label}
                      </span>
                    )}
                  </div>
                  <textarea
                    onChange={e => { makerCommentRef.current = e.target.value; }}
                    placeholder="Add a comment for the Reviewer (optional)..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-indigo-400 resize-none mb-3"
                    rows={2}
                    disabled={currentStatus === "PENDING_REVIEW" || currentStatus === "PENDING_MANAGER"}
                  />
                  <button onClick={handleSubmitForReview}
                    disabled={!selectedPeriodLabel || actionLoading || currentStatus === "PENDING_REVIEW" || currentStatus === "PENDING_MANAGER"}
                    className={`w-full font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm
                      ${(!selectedPeriodLabel || actionLoading || currentStatus === "PENDING_REVIEW" || currentStatus === "PENDING_MANAGER")
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}>
                    {actionLoading ? "Submitting..." :
                     currentStatus === "PENDING_REVIEW" ? "⏳ Awaiting Review" :
                     currentStatus === "PENDING_MANAGER" ? "⏳ Awaiting Manager" :
                     <><Send size={14}/> Submit for Review</>}
                  </button>
                </div>
              )}

              {renderAnalysis(computedTable)}
            </>
          )}
        </>
      )}
    </Layout>
  );
}
