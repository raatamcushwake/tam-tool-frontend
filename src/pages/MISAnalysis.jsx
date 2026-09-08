import { useState, useMemo, useRef, useEffect } from "react";
import { getInventoryData, getBusinessPlanData, getMSPData } from "../services/referenceService";
import {
  submitMISForReview, getAllMISSubmissions, getLastApprovedMIS,
  reviewerApproveMIS, reviewerRejectMIS, managerApproveMIS, managerRejectMIS,
  STATUS_CONFIG, getMISSubmission
} from "../services/misSubmissionService";
import Layout from "../components/common/Layout";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Upload, FileSpreadsheet, X, CheckCircle, ArrowRight, Search,
  MoveRight, ArrowDownRight, ArrowUpRight, ShieldX, TrendingUp,
  Building2, Store, PieChart, Calculator, Settings2, Check,
  UserCheck, Layers, Home, Users, Trash2, BadgePercent,
  Wallet, Tag, Clock, Target, BarChart3, Info, Download,
  ClipboardList, FileText, Send, ThumbsUp, ThumbsDown, Lock
} from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, db } from "../services/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getCycleState } from "../services/cycleStateService";
import { getProjectRoleMembers } from "../services/teamService";
import { getSanityForAnalysis, downloadFrozenSanityAsFile, uploadFrozenSanityFile, markSanityAnalysisApproved } from "../services/misSanitySubmissionService";

function FileUploadBox({ label, subtitle, file, onFileSelect, onClear, accent = "blue" }) {
  const inputRef = useRef(null);
  const c = accent === "blue"
    ? { hover: "hover:border-blue-400 hover:bg-blue-50", btn: "bg-blue-600", icon: "bg-blue-100 text-blue-600" }
    : { hover: "hover:border-indigo-400 hover:bg-indigo-50", btn: "bg-indigo-600", icon: "bg-indigo-100 text-indigo-600" };
  return (
    <div className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer
        ${file ? "border-green-400 bg-green-50" : `border-gray-300 bg-white ${c.hover}`}`}
      onClick={() => !file && inputRef.current.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFileSelect(f); }}>
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

const tabs = [
  'All', 'New Bookings', 'Resale / Anomaly', 'Name Corrections', 'Cancellations',
  'Agreement Value Change', 'Demand Raised Change', 'Amount Received Change',
  'O/S against Demand Value', 'O/S against Sale Value', 'Debtors Aging',
  'MSP Analysis'
];

const statusMap = {
  'New Bookings': 'NEW', 'Anomaly': 'ANOMALY',
  'Name Corrections': 'NAME_CORRECTION', 'Cancellations': 'CANCELLATION',
  'Agreement Value Change': 'AGREEMENT_VALUE',
  'Demand Raised Change': 'DEMAND_RAISED_CHANGE',
  'Amount Received Change': 'AMOUNT_RECEIVED_CHANGE',
};

export default function MISAnalysis() {
  const { selectedProject } = useProject();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMaker = selectedProject?.role === "MAKER";
  const isReviewer = selectedProject?.role === "REVIEWER";
  const isManager = selectedProject?.role === "MANAGER";
  const [sanityPassed, setSanityPassed] = useState(() => {
  try { return JSON.parse(localStorage.getItem("sanityPassed")) || false; }
  catch { return false; }
});
const [cycleStateData, setCycleStateData] = useState(null);
const [misRejectionInfo, setMisRejectionInfo] = useState(null);
const [cycleLoading, setCycleLoading] = useState(true);
const [hasDistinctReviewer, setHasDistinctReviewer] = useState(true);

useEffect(() => {
  const projectId = selectedProject?.projectId;
  if (!projectId) return;
  getProjectRoleMembers(projectId).then(({ hasDistinctReviewer }) => {
    setHasDistinctReviewer(hasDistinctReviewer);
  });
}, [selectedProject]);

  useEffect(() => {
  const handleStorageChange = () => {
    try { setSanityPassed(JSON.parse(localStorage.getItem("sanityPassed")) || false); }
    catch { setSanityPassed(false); }
  };
  window.addEventListener("storage", handleStorageChange);
  return () => window.removeEventListener("storage", handleStorageChange);
}, []);

useEffect(() => {
  if (!selectedProject?.projectId || !isMaker) {
    setCycleLoading(false);
    return;
  }
  getCycleState(selectedProject.projectId).then(state => {
    setCycleStateData(state);
    setCycleLoading(false);
    if (state?.sanityApproved && !state?.misAnalysisLocked) {
      localStorage.setItem("sanityPassed", JSON.stringify(true));
    } else {
      localStorage.setItem("sanityPassed", JSON.stringify(false));
    }
    window.dispatchEvent(new Event("storage"));
  });
}, [selectedProject, isMaker]);

  const [files, setFiles] = useState({ prev: null, curr: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState([]);
  const [unitStats, setUnitStats] = useState({ total: 0, sold: 0, unsold: 0 });
  const [activeTab, setActiveTab] = useState('All');
  const [searchTerm, setSearchTerm] = useState("");
  const [visibleColumns, setVisibleColumns] = useState({});
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [selectedAgingFilter, setSelectedAgingFilter] = useState(null);
  const [selectedSaleFilter, setSelectedSaleFilter] = useState(null);
  const [selectedAgingBucket, setSelectedAgingBucket] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [businessPlanData, setBusinessPlanData] = useState(null);
  const [monthYear, setMonthYear] = useState('');
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [mspData, setMspData] = useState(null);
const [rowRemarks, setRowRemarks] = useState({});
const [rowAttachments, setRowAttachments] = useState({});
const [rowAttachmentURLs, setRowAttachmentURLs] = useState({});
const [anomalyClassification, setAnomalyClassification] = useState({});
const [anomalyRemarks, setAnomalyRemarks] = useState({});
const [anomalyAttachmentURLs, setAnomalyAttachmentURLs] = useState({});

  // Submission states
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const makerCommentRef = useRef("");
const reviewerCommentRef = useRef("");
const managerCommentRef = useRef("");
  const [actionLoading, setActionLoading] = useState(false);
  const [currentSubmissionStatus, setCurrentSubmissionStatus] = useState(null);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [showMakerDetails, setShowMakerDetails] = useState(false);
  const [makerSubmissionDoc, setMakerSubmissionDoc] = useState(null);

  const columnFilterRef = useRef(null);
  const analysisTablesRef = useRef(null);
  const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  const agingColumns = ["Upto 30 days", "30 - 60 days", "60 - 90 days", "90 - 180 days", "180 - 365 days", "Greater than 365 days", "Total aging"];
const MSP_COLS = ['MSP_Rate', 'MSP_Variance', 'MSP_Flag'];
const COLUMN_LABELS = { is_resale: "Anomaly" };

const COLUMN_ORDER = [
  "Unit No.",
  "Tower",
  "Unit Type",
  "Disbursement",
  "Customer Name",
  "Booking Date",
  "Registration Date",
  "Saleable area in sft",
  "Carpet area in sft",
  "Rate per sft",
  "Agreement value",
  "Amount Received excl. Tax Current Month",
  "Demand Raised as on Current Month excl. tax",
  "Outstanding against sale value",
  "O/S against Sale Value",
  "Outstanding against demand",
  "O/S % Demand",
  "makerRemark",
  "makerAttachments",
];

const orderedColumns = (() => {
  const keys = Object.keys(visibleColumns).filter(h => h !== "Change Details" && !MSP_COLS.includes(h));

  keys.sort((a, b) => {
    const ia = COLUMN_ORDER.indexOf(a);
    const ib = COLUMN_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const agreementIdx = keys.indexOf("Agreement value");
  if (agreementIdx !== -1) {
    keys.splice(agreementIdx + 1, 0, ...MSP_COLS.filter(c => visibleColumns[c] !== undefined));
  } else {
    keys.push(...MSP_COLS.filter(c => visibleColumns[c] !== undefined));
  }
  keys.push("Change Details");
  return keys;
})();

useEffect(() => {
  const projectId = selectedProject?.projectId;
  if (!projectId) return;
  getInventoryData(projectId).then(setInventoryData);
  getBusinessPlanData(projectId).then(setBusinessPlanData);
  getMSPData(projectId).then(setMspData);
}, [selectedProject]);

useEffect(() => {
  const projectId = selectedProject?.projectId;
  if (!projectId || !isMaker) return;
  // monthYear now derives from cycleStateData.cycleMonth (set inside autoRunAnalysis),
  // not from a separately-uploaded frozenMIS metadata doc.
  if (cycleStateData?.cycleMonth) {
    setMonthYear(cycleStateData.cycleMonth);
  }
}, [selectedProject, isMaker, cycleStateData]);

  // Load all submissions for Maker/Reviewer/Manager
  useEffect(() => {
    const projectId = selectedProject?.projectId;
    if (!projectId) return;
    setSubmissionsLoading(true);
    getAllMISSubmissions(projectId).then(data => {
      setAllSubmissions(data);
      setSubmissionsLoading(false);
    });
  }, [selectedProject]);

  // Deep-link from a notification: ?month=NOV-2025 auto-selects that submission
  useEffect(() => {
    const monthFromNotif = searchParams.get("month");
    if (!monthFromNotif || allSubmissions.length === 0) return;
    const match = allSubmissions.find(s => s.monthYear === monthFromNotif);
    if (match) {
      setSelectedSubmission(match);
      setExtractedData(match.extractedData || []);
      setUnitStats(match.unitStats || { total: 0, sold: 0, unsold: 0 });
      setMonthYear(monthFromNotif);
      if (match.extractedData?.length > 0) {
        const cols = {};
        const skip = ['Status', 'DEMAND_INCREMENT_VAL', 'RECEIVED_INCREMENT_VAL', 'AGREEMENT_INCREMENT_VAL',
          'prev_agreement', 'agreement_delta', 'prev_amount_received', 'amount_received_delta',
          'prev_demand', 'demand_delta', 'prev_saleable', 'saleable_delta', 'prev_carpet', 'carpet_delta', 'REFERENCE_MSP',
          'Amount Received excl. Tax'];
        const allKeys = new Set();
        match.extractedData.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
        allKeys.forEach(k => { if (!skip.includes(k)) cols[k] = true; });
        setVisibleColumns(cols);
      }
    }
  }, [searchParams, allSubmissions]);

  // Check current month submission status for Maker
  useEffect(() => {
  const projectId = selectedProject?.projectId;
  if (!projectId || !monthYear || !isMaker) return;
  import("../services/misSubmissionService").then(({ getMISSubmission }) => {
    getMISSubmission(projectId, monthYear).then(data => {
      if (data) {
        setCurrentSubmissionStatus(data.status);
        setMakerSubmissionDoc(data);
        setMisRejectionInfo({
          rejectionComment: data.rejectionComment || "",
          reviewerComment: data.reviewerComment || "",
        });
        // Load submitted data so Maker can see their analysis while pending
        if (data.extractedData?.length > 0) {
          setExtractedData(data.extractedData);
          setUnitStats(data.unitStats || { total: 0, sold: 0, unsold: 0 });
          const cols = {};
          const skip = ['Status', 'DEMAND_INCREMENT_VAL', 'RECEIVED_INCREMENT_VAL', 'AGREEMENT_INCREMENT_VAL',
            'prev_agreement', 'agreement_delta', 'prev_amount_received', 'amount_received_delta',
            'prev_demand', 'demand_delta', 'prev_saleable', 'saleable_delta', 'prev_carpet', 'carpet_delta', 'REFERENCE_MSP',
            'Amount Received excl. Tax'];
          const allKeys = new Set();
          data.extractedData.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
          allKeys.forEach(k => { if (!skip.includes(k)) cols[k] = true; });
          setVisibleColumns(cols);
        }
      } else {
        setCurrentSubmissionStatus(null);
        setMakerSubmissionDoc(null);
        setMisRejectionInfo(null);
      }
    });
  });
}, [selectedProject, monthYear, isMaker]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (columnFilterRef.current && !columnFilterRef.current.contains(event.target))
        setShowColumnFilter(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getNum = (val) => {
    if (val === null || val === undefined || val === "" || val === "Not applicable") return 0;
    if (typeof val === 'number') return val;
    const parsed = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatValue = (val, key) => {
    const num = getNum(val);
    const isPercent = key?.toLowerCase().includes('%');
    const formatted = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    return isPercent ? `${formatted}%` : formatted;
  };

  const formatMISDate = (val, key) => {
    if (!val || val === 'empty') return String(val || '-');
    if (key?.toLowerCase().includes('date')) {
      const date = new Date(val);
      if (!isNaN(date.getTime())) return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return String(val);
  };

  const isCommercial = (unitType) => {
    const type = String(unitType || "").toUpperCase();
    return type.includes('COMMERCIAL') || type.includes('SHOP') || type.includes('OFFICE');
  };

  const isUnitSold = (customerName) => {
    if (!customerName) return false;
    const name = String(customerName).trim().toUpperCase();
    return !["", "-", "N/A", "NOT APPLICABLE", "EMPTY", "NULL", "UNDEFINED", "UNSOLD"].includes(name);
  };

  const getAgingRangeLabel = (val) => {
    const num = getNum(val);
    const fixed = parseFloat(Number(num).toFixed(2));
    if (num < 0) return 'Excess Collection';
    if (fixed === 0) return 'No O/S';
    if (fixed <= 10) return 'Upto 10%';
    if (fixed <= 20) return '11-20%';
    if (fixed <= 30) return '21-30%';
    if (fixed <= 50) return '31-50%';
    if (fixed <= 80) return '51-80%';
    return '80% above';
  };

  const getSaleRangeLabel = (row) => {
    const num = getNum(row["O/S against Sale Value"]);
    const fixed = parseFloat(Number(num).toFixed(2));
    if (num < 0) return 'Excess Collection';
    if (fixed === 0) return 'No O/S';
    if (fixed <= 10) return 'Upto 10%';
    if (fixed <= 20) return '11-20%';
    if (fixed <= 30) return '21-30%';
    if (fixed <= 50) return '31-50%';
    if (fixed <= 80) return '51-80%';
    return '80% above';
  };

  const auditTotals = useMemo(() => {
    const t = {
      demandIncrement: 0, demandDecrement: 0,
      receivedIncrement: 0, receivedDecrement: 0,
      agreementIncrement: 0, agreementDecrement: 0,
      actualAreaSold: 0, cancelledAreaSold: 0,
      cancelledAmountReceived: 0, cancellations: 0,
      agingUpto30Amt: 0, agingUpto30Units: 0,
      aging3060Amt: 0, aging3060Units: 0,
      aging6090Amt: 0, aging6090Units: 0,
      aging90180Amt: 0, aging90180Units: 0,
      aging180365Amt: 0, aging180365Units: 0,
      aging365PlusAmt: 0, aging365PlusUnits: 0,
      totalAgingAmt: 0,
    };
    extractedData.filter(r => r.Status === 'CANCELLATION').forEach(r => {
      t.cancellations++;
      t.cancelledAreaSold += getNum(r["Saleable area in sft"]);
      t.cancelledAmountReceived += getNum(r["Amount Received excl. Tax Current Month"]);
    });
    extractedData.filter(r => r.Status !== 'CANCELLATION').forEach(r => {
      if (r.Status === 'NEW') {
        t.demandIncrement += getNum(r["Demand Raised as on Current Month excl. tax"]);
        t.receivedIncrement += getNum(r["Amount Received excl. Tax Current Month"]);
        t.actualAreaSold += getNum(r["Saleable area in sft"]);
      } else {
        const d = getNum(r.DEMAND_INCREMENT_VAL);
        const rc = getNum(r.RECEIVED_INCREMENT_VAL);
        if (d > 0) t.demandIncrement += d; else if (d < 0) t.demandDecrement += Math.abs(d);
        if (rc > 0) t.receivedIncrement += rc; else if (rc < 0) t.receivedDecrement += Math.abs(rc);
      }
      const a = getNum(r.AGREEMENT_INCREMENT_VAL);
      if (a > 0) t.agreementIncrement += a; else if (a < 0) t.agreementDecrement += Math.abs(a);
      const v30 = getNum(r["Upto 30 days"]);
      const v3060 = getNum(r["30 - 60 days"]);
      const v6090 = getNum(r["60 - 90 days"]);
      const v90180 = getNum(r["90 - 180 days"]);
      const v180365 = getNum(r["180 - 365 days"]);
      const v365plus = getNum(r["Greater than 365 days"]);
      if (v30 > 0) { t.agingUpto30Amt += v30; t.agingUpto30Units++; }
      if (v3060 > 0) { t.aging3060Amt += v3060; t.aging3060Units++; }
      if (v6090 > 0) { t.aging6090Amt += v6090; t.aging6090Units++; }
      if (v90180 > 0) { t.aging90180Amt += v90180; t.aging90180Units++; }
      if (v180365 > 0) { t.aging180365Amt += v180365; t.aging180365Units++; }
      if (v365plus > 0) { t.aging365PlusAmt += v365plus; t.aging365PlusUnits++; }
      t.totalAgingAmt += getNum(r["Total aging"]);
    });
    t.netAreaSold = t.actualAreaSold - t.cancelledAreaSold;
    return t;
  }, [extractedData]);

  useEffect(() => {
  if (!extractedData.length || !inventoryData?.rows) return;

  const soldRows = extractedData.filter(r => r.Status !== 'CANCELLATION' && isUnitSold(r["Customer Name"]));

  const inventoryTowerTypes = inventoryData.rows.map(row => ({
    tower: String(row.tower || '').trim().toLowerCase(),
    type: String(row.unitType || '').trim().toLowerCase(),
  }));

  const unmatched = soldRows.filter(r => {
    const rTower = String(r["Tower"] || '').trim().toLowerCase();
    const rType = String(r["Unit Type"] || '').trim().toLowerCase();
    return !inventoryTowerTypes.some(inv => {
      const typeMatches = inv.type === rType ||
        (rType === 'shop' && inv.type === 'commercial') ||
        (rType === 'commercial' && inv.type === 'shop');
      return inv.tower === rTower && typeMatches;
    });
  });

  console.log("=== INVENTORY MATCH DEBUG ===");
  console.log("Sold rows not matched to any Inventory Sheet Tower/Type:", unmatched.length, unmatched);
}, [extractedData, inventoryData]);

  const mspAnalysis = useMemo(() => {
    if (!mspData?.rates) return { belowMSP: [], atMSP: [], noMSP: [] };
    const newBookings = extractedData.filter(r => r.Status === 'NEW' && isUnitSold(r["Customer Name"]));
    const belowMSP = [], atMSP = [], noMSP = [];
    newBookings.forEach(r => {
      const tower = String(r["Tower"] || '').trim().toLowerCase();
      const unitType = String(r["Unit Type"] || '').trim().toLowerCase();
      const ratePerSft = getNum(r["Rate per sft"]);
      const unitNo = String(r["Unit No."] || '').trim().toLowerCase();
      const unitLevelMatch = mspData.rates.find(m =>
        String(m.unitNo || '').trim().toLowerCase() === unitNo
      );
      let msp = 0;
      if (unitLevelMatch) {
        msp = unitLevelMatch.mspRate;
      } else {
        const matchingRates = mspData.rates.filter(m => {
          const mTower = String(m.tower || '').trim().toLowerCase();
          const mType = String(m.unitType || '').trim().toLowerCase();
          const typeMatches = mType === unitType ||
            (unitType === 'shop' && mType === 'commercial') ||
            (unitType === 'commercial' && mType === 'shop');
          const towerMatches = mTower === tower || mTower.startsWith(tower);
          return towerMatches && typeMatches;
        });
        if (matchingRates.length === 0) { noMSP.push({ ...r, msp: 0, variance: 0 }); return; }
        msp = Math.max(...matchingRates.map(m => m.mspRate));
      }
      if (msp === 0) { noMSP.push({ ...r, msp: 0, variance: 0 }); return; }
      const variance = ratePerSft - msp;
      const entry = { ...r, msp, variance, ratePerSft };
      if (Math.round(ratePerSft * 100) < Math.round(msp * 100)) belowMSP.push(entry);
else atMSP.push(entry);
    });
    return { belowMSP, atMSP, noMSP };
  }, [extractedData, mspData]);

  const summaryTillDate = useMemo(() => {
    const init = () => ({ agreement: 0, saleable: 0, carpet: 0, collection: 0, demand: 0 });
    const result = {
      Residential: { Total: init(), Sold: init(), Unsold: init() },
      Commercial: { Total: init(), Sold: init(), Unsold: init() }
    };
    extractedData.filter(r => r.Status !== 'CANCELLATION').forEach(r => {
      const type = isCommercial(r["Unit Type"]) ? 'Commercial' : 'Residential';
      const sold = isUnitSold(r["Customer Name"]);
      const vals = {
        agreement: getNum(r["Agreement value"]),
        saleable: getNum(r["Saleable area in sft"]),
        carpet: getNum(r["Carpet area in sft"]),
        collection: getNum(r["Amount Received excl. Tax Current Month"]),
        demand: getNum(r["Demand Raised as on Current Month excl. tax"])
      };
      const target = sold ? result[type].Sold : result[type].Unsold;
      Object.keys(vals).forEach(k => { target[k] += vals[k]; result[type].Total[k] += vals[k]; });
    });
    return result;
  }, [extractedData]);

  const agingSummary = useMemo(() => {
    const ranges = ["Upto 10%", "11-20%", "21-30%", "31-50%", "51-80%", "80% above", "No O/S", "Excess Collection"];
    const init = () => ranges.reduce((a, l) => ({ ...a, [l]: { units: 0, agreement: 0, raised: 0, received: 0, receivable: 0 } }), {});
    const tables = { Residential: init(), Commercial: init() };
    extractedData.filter(r => r.Status !== 'CANCELLATION' && isUnitSold(r["Customer Name"])).forEach(r => {
      const type = isCommercial(r["Unit Type"]) ? 'Commercial' : 'Residential';
      const label = getAgingRangeLabel(getNum(r["O/S % Demand"]));
      if (tables[type][label]) {
        tables[type][label].units++;
        tables[type][label].agreement += getNum(r["Agreement value"]);
        tables[type][label].raised += getNum(r["Demand Raised as on Current Month excl. tax"]);
        tables[type][label].received += getNum(r["Amount Received excl. Tax Current Month"]);
        tables[type][label].receivable += getNum(r["Demand Raised as on Current Month excl. tax"]) - getNum(r["Amount Received excl. Tax Current Month"]);
      }
    });
    return tables;
  }, [extractedData]);

  const saleSummary = useMemo(() => {
    const ranges = ["Upto 10%", "11-20%", "21-30%", "31-50%", "51-80%", "80% above", "No O/S", "Excess Collection"];
    const init = () => ranges.reduce((a, l) => ({ ...a, [l]: { units: 0, agreement: 0, raised: 0, received: 0, receivable: 0 } }), {});
    const tables = { Residential: init(), Commercial: init() };
    extractedData.filter(r => r.Status !== 'CANCELLATION' && isUnitSold(r["Customer Name"])).forEach(r => {
      const type = isCommercial(r["Unit Type"]) ? 'Commercial' : 'Residential';
      const label = getSaleRangeLabel(r);
      if (tables[type][label]) {
        tables[type][label].units++;
        tables[type][label].agreement += getNum(r["Agreement value"]);
        tables[type][label].raised += getNum(r["Demand Raised as on Current Month excl. tax"]);
        tables[type][label].received += getNum(r["Amount Received excl. Tax Current Month"]);
        tables[type][label].receivable += getNum(r["Agreement value"]) - getNum(r["Amount Received excl. Tax Current Month"]);
      }
    });
    return tables;
  }, [extractedData]);

  const inventorySummaryComputed = useMemo(() => {
    if (!inventoryData?.rows) return [];
    const dataRows = inventoryData.rows.map(row => {
      const towerMatch = String(row.tower || '').trim().toLowerCase();
      const typeMatch = String(row.unitType || '').trim().toLowerCase();
      const matched = extractedData.filter(r => {
        if (r.Status === 'CANCELLATION') return false;
        const rTower = String(r["Tower"] || '').trim().toLowerCase();
        const rType = String(r["Unit Type"] || '').trim().toLowerCase();
        const typeMatches = rType === typeMatch ||
          (typeMatch === 'shop' && rType === 'commercial') ||
          (typeMatch === 'commercial' && rType === 'shop');
        return rTower === towerMatch && typeMatches;
      });
      const soldUnits = matched.filter(r => isUnitSold(r["Customer Name"]));
      const unitsSold = soldUnits.length;
      const areaSold = soldUnits.reduce((a, r) => a + getNum(r["Saleable area in sft"]), 0);
      const assetValueCr = soldUnits.reduce((a, r) => a + getNum(r["Agreement value"]), 0) / 10000000;
      const amountReceivedCr = soldUnits.reduce((a, r) => a + getNum(r["Amount Received excl. Tax Current Month"]), 0) / 10000000;
      const unsoldUnits = Math.max(0, row.totalUnits - unitsSold);
      const unsoldSaleableArea = Math.max(0, row.saleableArea - areaSold);
      const matchingRates = mspData?.rates?.filter(r => {
        const rTower = String(r.tower || '').trim().toLowerCase();
        const rType = String(r.unitType || '').trim().toLowerCase();
        const typeMatches = rType === typeMatch ||
          (typeMatch === 'shop' && rType === 'commercial') ||
          (typeMatch === 'commercial' && rType === 'shop') ||
          (typeMatch === 'shop' && rType === 'shop');
        const towerMatches = rTower === towerMatch || rTower.startsWith(towerMatch);
        return towerMatches && typeMatches;
      });
      const msp = matchingRates?.length > 0 ? Math.max(...matchingRates.map(r => r.mspRate)) : 0;
      const receivableUnsoldCr = msp > 0 ? (unsoldSaleableArea * msp) / 10000000 : 0;
      const receivableSoldCr = Math.max(0, assetValueCr - amountReceivedCr);
      const totalReceivableCr = receivableUnsoldCr + receivableSoldCr;
      return {
        phase: row.phase || '', tower: row.tower || '', unit_type: row.unitType || '',
        total_units: row.totalUnits || 0, saleable_area: row.saleableArea || 0, msp,
        units_sold: unitsSold, area_sold: areaSold,
        asset_value_inr_cr: assetValueCr, amount_received_oct25: amountReceivedCr,
        unsold_units: unsoldUnits, unsold_saleable_area: unsoldSaleableArea,
        receivable_unsold_inr_cr: receivableUnsoldCr, receivable_sold_inr_cr: receivableSoldCr,
        total_receivable_inr_cr: totalReceivableCr, is_subtotal: false,
      };
    });
    const resRows = dataRows.filter(r => !isCommercial(r.unit_type));
    const comRows = dataRows.filter(r => isCommercial(r.unit_type));
    const makeSubtotal = (rows, label) => ({
      phase: 'Total', tower: '', unit_type: label,
      total_units: rows.reduce((a, r) => a + r.total_units, 0),
      saleable_area: rows.reduce((a, r) => a + r.saleable_area, 0), msp: 0,
      units_sold: rows.reduce((a, r) => a + r.units_sold, 0),
      area_sold: rows.reduce((a, r) => a + r.area_sold, 0),
      asset_value_inr_cr: rows.reduce((a, r) => a + r.asset_value_inr_cr, 0),
      amount_received_oct25: rows.reduce((a, r) => a + r.amount_received_oct25, 0),
      unsold_units: rows.reduce((a, r) => a + r.unsold_units, 0),
      unsold_saleable_area: rows.reduce((a, r) => a + r.unsold_saleable_area, 0),
      receivable_unsold_inr_cr: rows.reduce((a, r) => a + r.receivable_unsold_inr_cr, 0),
      receivable_sold_inr_cr: rows.reduce((a, r) => a + r.receivable_sold_inr_cr, 0),
      total_receivable_inr_cr: rows.reduce((a, r) => a + r.total_receivable_inr_cr, 0),
      is_subtotal: true,
    });
    const final = [];
    if (resRows.length) { final.push(...resRows); final.push(makeSubtotal(resRows, 'Total Residential')); }
    if (comRows.length) { final.push(...comRows); final.push(makeSubtotal(comRows, 'Total Commercial')); }
    if (dataRows.length) {
  final.push(makeSubtotal(dataRows, 'Grand Total'));
}
    return final;
  }, [inventoryData, extractedData, mspData]);

  const bpTargets = useMemo(() => {
  if (!businessPlanData?.quarters || !monthYear) {
    return { planned_collection: 0, planned_area: 0, quarter: '', period: '' };
  }

  const monthOrder = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  const parts = monthYear.trim().toUpperCase().split('-');
  const currentMonth = parts[0]?.substring(0, 3);
  const currentYear = parts[1]?.trim() || '';

  if (!currentMonth || !currentYear) {
    return { planned_collection: 0, planned_area: 0, quarter: '', period: '' };
  }

  const fyYear = ['JAN','FEB','MAR'].includes(currentMonth)
    ? `${parseInt(currentYear)-1}-${currentYear.slice(2)}`
    : `${currentYear}-${String(parseInt(currentYear)+1).slice(2)}`;

  const matchesMonth = (q) => {
    if (!q.monthRange) return false;
    const rangeLower = String(q.monthRange).toLowerCase().replace(/\d{4}/g, '').trim();
    const foundMonths = monthOrder.filter(m => rangeLower.includes(m.toLowerCase().substring(0, 3)));
    if (foundMonths.length < 2) return false;
    const startIdx = monthOrder.indexOf(foundMonths[0]);
    const endIdx = monthOrder.indexOf(foundMonths[foundMonths.length - 1]);
    const currentIdx = monthOrder.indexOf(currentMonth);
    return currentIdx >= startIdx && currentIdx <= endIdx;
  };

  const matched = businessPlanData.quarters.find(q =>
    String(q.financialYear).trim() === fyYear && matchesMonth(q)
  );

  if (!matched) {
    const fallback = businessPlanData.quarters.find(q =>
      matchesMonth(q) &&
      (getNum(q.collectionsPlanned) > 0 || getNum(q.areaToSellPlanned) > 0)
    );
    if (!fallback) {
      return { planned_collection: 0, planned_area: 0, quarter: '', period: fyYear };
    }
    return {
      planned_collection: getNum(fallback.collectionsPlanned) / 3,
      planned_area: getNum(fallback.areaToSellPlanned) / 3,
      quarter: fallback.quarter,
      period: fallback.financialYear,
    };
  }

  return {
    planned_collection: getNum(matched.collectionsPlanned) / 3,
    planned_area: getNum(matched.areaToSellPlanned) / 3,
    quarter: matched.quarter,
    period: matched.financialYear,
  };
}, [businessPlanData, monthYear]);

  console.log("DEBUG monthYear:", monthYear);
console.table(businessPlanData?.quarters);

  const processedData = useMemo(() => {
    let data = [...extractedData];
    if (activeTab === 'Debtors Aging') {
      data = data.filter(r => 
  getNum(r["30 - 60 days"]) > 0 || 
  getNum(r["60 - 90 days"]) > 0 || 
  getNum(r["90 - 180 days"]) > 0 || 
  getNum(r["180 - 365 days"]) > 0 || 
  getNum(r["Greater than 365 days"]) > 0
);
    } else if (activeTab === 'Resale / Anomaly') {
      data = data.filter(r => r.is_resale === true);
    } else if (statusMap[activeTab]) {
      data = data.filter(r => r.Status === statusMap[activeTab]);
    } else if (activeTab === 'O/S against Demand Value' && selectedAgingFilter) {
      data = data.filter(r =>
        (selectedAgingFilter.type === 'Commercial' ? isCommercial(r["Unit Type"]) : !isCommercial(r["Unit Type"])) &&
        getAgingRangeLabel(getNum(r["O/S % Demand"])) === selectedAgingFilter.range
      );
    } else if (activeTab === 'O/S against Sale Value' && selectedSaleFilter) {
      data = data.filter(r =>
        (selectedSaleFilter.type === 'Commercial' ? isCommercial(r["Unit Type"]) : !isCommercial(r["Unit Type"])) &&
        getSaleRangeLabel(r) === selectedSaleFilter.range
      );
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      data = data.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(s)));
    }
    return data;
  }, [extractedData, activeTab, searchTerm, selectedAgingFilter, selectedSaleFilter]);

  const handleAttachmentUpload = async (unitNo, file) => {
    const uploadRef = ref(storage, `projects/${selectedProject.projectName || selectedProject.projectId}/bookingAttachments/${unitNo}_${file.name}`);
    await uploadBytes(uploadRef, file);
    const url = await getDownloadURL(uploadRef);
    setRowAttachmentURLs(prev => ({
      ...prev,
      [unitNo]: [...(prev[unitNo] || []), { name: file.name, url }]
    }));
  };

  const handleAnomalyAttachmentUpload = async (unitNo, file) => {
    const uploadRef = ref(storage, `projects/${selectedProject.projectName || selectedProject.projectId}/anomalyAttachments/${unitNo}_${file.name}`);
    await uploadBytes(uploadRef, file);
    const url = await getDownloadURL(uploadRef);
    setAnomalyAttachmentURLs(prev => ({
      ...prev,
      [unitNo]: [...(prev[unitNo] || []), { name: file.name, url }]
    }));
  };

  const autoRunAnalysis = async () => {
    setIsProcessing(true);
    setExtractedData([]);
    try {
      const cycleMonth = cycleStateData?.cycleMonth;
      if (!cycleMonth) {
        alert("No approved Sanity Check month found. Please contact Manager.");
        setIsProcessing(false);
        return;
      }
      setMonthYear(cycleMonth);

      let currURL = cycleStateData?.stagedCurrURL;
      let prevURL = cycleStateData?.stagedPrevURL;
      if (!currURL || !prevURL) {
        const sanityForMonth = await getSanityForAnalysis(selectedProject.projectId, cycleMonth);
        currURL = currURL || sanityForMonth?.currFileURL;
        prevURL = prevURL || sanityForMonth?.prevFileURL;
      }
      if (!currURL) {
        alert("Could not find this month's current MIS file. Please re-run Sanity Check.");
        setIsProcessing(false);
        return;
      }
      if (!prevURL) {
        alert("Could not find the previous month's MIS file. Please re-run Sanity Check.");
        setIsProcessing(false);
        return;
      }

const prevRes = await fetch(prevURL);
const prevBlob = await prevRes.blob();
const prevFile = new File([prevBlob], `prev_${cycleMonth}.xlsx`, {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});

const currRes = await fetch(currURL);
const currBlob = await currRes.blob();
const currFile = new File([currBlob], `${cycleMonth}.xlsx`, {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
      console.log("PREV FILE:", prevFile.name, prevFile.size);
      console.log("CURR FILE:", currFile.name, currFile.size);
      console.log("Same file size?", prevFile.size === currFile.size);

      const formData = new FormData();
      formData.append("prev_month", prevFile);
      formData.append("curr_month", currFile);

      const res = await fetch(`${apiUrl}/api/mis-analysis/compare`, { method: "POST", body: formData });
      const data = await res.json();

      if (data.status === "success") {
        const mspRates = mspData?.rates || [];
        const enriched = (data.extracted_data || []).map(row => {
          if (row.Status !== 'NEW' || !isUnitSold(row["Customer Name"])) return row;
          const tower = String(row["Tower"] || '').trim().toLowerCase();
          const unitType = String(row["Unit Type"] || '').trim().toLowerCase();
          const ratePerSft = getNum(row["Rate per sft"]);
          const unitNo = String(row["Unit No."] || '').trim().toLowerCase();
          const unitLevelMatch = mspRates.find(m => String(m.unitNo || '').trim().toLowerCase() === unitNo);
          let msp = 0;
          if (unitLevelMatch) {
            msp = unitLevelMatch.mspRate;
          } else {
            const matchingRates = mspRates.filter(m => {
              const mTower = String(m.tower || '').trim().toLowerCase();
              const mType = String(m.unitType || '').trim().toLowerCase();
              const typeMatches = mType === unitType ||
                (unitType === 'shop' && mType === 'commercial') ||
                (unitType === 'commercial' && mType === 'shop');
              const towerMatches = mTower === tower || mTower.startsWith(tower);
              return towerMatches && typeMatches;
            });
            if (matchingRates.length > 0) msp = Math.max(...matchingRates.map(m => m.mspRate));
          }
          const variance = msp > 0 ? ratePerSft - msp : 0;
          const mspFlag = msp === 0 ? 'NO MSP' : variance < 0 ? 'BELOW MSP' : 'AT/ABOVE MSP';
          return { ...row, MSP_Rate: msp, MSP_Variance: variance, MSP_Flag: mspFlag };
        });
        setExtractedData(enriched);
        setUnitStats({ total: data.total_unit_count, sold: data.sold_units, unsold: data.unsold_units });
        setActiveTab('All');

        // Fresh analysis on a revised MIS — any earlier submission (e.g. a rejected
        // one) for this month is now stale. Reset local submission state so the
        // Maker sees a plain "Submit for Review" action, not the old Rejected
        // banner or a disabled "already submitted" button.
        setCurrentSubmissionStatus(null);
        setMisRejectionInfo(null);
        setMakerSubmissionDoc(null);
        setShowMakerDetails(false);
        if (enriched?.length > 0) {
          const cols = {};
          const skip = ['Status', 'DEMAND_INCREMENT_VAL', 'RECEIVED_INCREMENT_VAL', 'AGREEMENT_INCREMENT_VAL',
            'prev_agreement', 'agreement_delta', 'prev_amount_received', 'amount_received_delta',
            'prev_demand', 'demand_delta', 'prev_saleable', 'saleable_delta', 'prev_carpet', 'carpet_delta', 'REFERENCE_MSP',
            'Amount Received excl. Tax'];
          const allKeys = new Set();
          enriched.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
          allKeys.forEach(k => { if (!skip.includes(k)) cols[k] = true; });
          setVisibleColumns(cols);
        }
      } else {
        alert('Error during comparison: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Error during comparison: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!monthYear) { alert('Please enter Current Month & Year before submitting'); return; }
    if (!extractedData.length) { alert('Please run analysis first'); return; }
    if (cycleStateData?.sanityCheckPassed === false && !makerCommentRef.current?.trim() && Object.keys(rowRemarks).length === 0 && Object.keys(rowAttachmentURLs).length === 0) {
      alert('Sanity Check failed for this month. Please add a remark or attach a supporting document before submitting.');
      return;
    }
    setActionLoading(true);
    // Curr file already lives in the approved Sanity submission's storage —
    // just reuse that URL instead of re-uploading a file we no longer hold locally.
    let currFileURL = cycleStateData?.stagedCurrURL || "";
    if (!currFileURL) {
      try {
        const sanityForMonth = await getSanityForAnalysis(selectedProject.projectId, monthYear);
        currFileURL = sanityForMonth?.currFileURL || "";
      } catch (uploadErr) {
        console.error("Fetching sanity currFileURL error:", uploadErr);
      }
    }

const enrichedWithRemarks = extractedData.map(row => ({
  ...row,
  makerRemark: rowRemarks[row["Unit No."]] || "",
  makerAttachments: rowAttachmentURLs[row["Unit No."]] || [],
  anomalyType: anomalyClassification[row["Unit No."]] || row.anomalyType || "",
  anomalyRemark: anomalyRemarks[row["Unit No."]] || row.anomalyRemark || "",
  anomalyAttachments: anomalyAttachmentURLs[row["Unit No."]] || row.anomalyAttachments || [],
}));

const result = await submitMISForReview(selectedProject.projectId, monthYear, {
  extractedData: enrichedWithRemarks,
  unitStats,
  makerComment: makerCommentRef.current,
  submittedBy: currentUser.email,
  monthYear,
  currFileURL,
  sanityCheckPassed: cycleStateData?.sanityCheckPassed ?? null,
  initialStatus: hasDistinctReviewer ? "PENDING_REVIEW" : "PENDING_MANAGER",
});
    if (result.success) {
      setCurrentSubmissionStatus(hasDistinctReviewer ? 'PENDING_REVIEW' : 'PENDING_MANAGER');
      makerCommentRef.current = '';
      alert('✅ Submitted for Review successfully!');
    } else {
      alert('Error submitting: ' + result.error);
    }
    setActionLoading(false);
  };

  const handleReviewerAction = async (approve) => {
    if (!selectedSubmission) return;
    setActionLoading(true);
    if (approve) {
      await reviewerApproveMIS(selectedProject.projectId, selectedSubmission.monthYear, currentUser.email, reviewerCommentRef.current);
      alert('✅ Approved! Sent to Manager.');
    } else {
      await reviewerRejectMIS(selectedProject.projectId, selectedSubmission.monthYear, currentUser.email, reviewerCommentRef.current);
      alert('❌ Rejected. Sent back to Maker.');
    }
    reviewerCommentRef.current = '';
    getAllMISSubmissions(selectedProject.projectId).then(setAllSubmissions);
    setActionLoading(false);
  };

  const handleManagerBypassApprove = async () => {
    if (!selectedSubmission) return;
    setActionLoading(true);
    try {
      await reviewerApproveMIS(
        selectedProject.projectId, selectedSubmission.monthYear, currentUser.email,
        "Approved by Manager — Reviewer unavailable"
      );
    } catch (err) {
      console.error(err);
      alert('Error standing in for Reviewer: ' + err.message);
      setActionLoading(false);
      return;
    }
    setActionLoading(false);
    await handleManagerAction(true); // runs the full freeze + cycle-reset flow, same as normal final approval
  };

  const handleManagerAction = async (approve) => {
  if (!selectedSubmission) return;
  setActionLoading(true);
  if (approve) {
    await managerApproveMIS(
      selectedProject.projectId,
      selectedSubmission.monthYear,
      currentUser.email,
      managerCommentRef.current
    );

    // Upload current month file to Firebase Storage as frozen file for next month
    try {
      // Download the curr month file from the submission's stored data
      // We need to get the actual file — it was submitted by Maker so we fetch from storage ref if exists
      // OR if manager is viewing and curr file is in state, use that
      // Best approach: re-download from Firestore submission extractedData is already there
      // We upload a reconstructed file using the stored download URL from submission
      const submissionDoc = await getMISSubmission(
        selectedProject.projectId,
        selectedSubmission.monthYear
      );

      if (submissionDoc?.currFileURL) {
        const response = await fetch(submissionDoc.currFileURL);
        const blob = await response.blob();
        const file = new File([blob], `${selectedSubmission.monthYear}.xlsx`, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        // Freeze into the single frozenSanityMIS lineage (replaces old frozenMIS store)
        await uploadFrozenSanityFile(
          selectedProject.projectId,
          selectedSubmission.monthYear,
          file,
          selectedProject.projectName
        );
      }
    } catch (storageErr) {
        console.error("Storage upload error:", storageErr);
      }

      try {
        await markSanityAnalysisApproved(selectedProject.projectId, selectedSubmission.monthYear);
      } catch (e) {
        console.error("markSanityAnalysisApproved error:", e);
      }

      // Reset cycle state for next month — this month is now the frozen,
      // official MIS record.
      const { setCycleState } = await import("../services/cycleStateService");
      await setCycleState(selectedProject.projectId, {
        analysisUnlocked: false,
        sanityCheckPassed: null,
        stagedCurrURL: "",
        stagedPrevURL: "",
        misApprovedMonth: monthYear,
        misApprovedAt: new Date().toISOString(),
      });
      alert('✅ Final Approved! Month is now frozen. MIS Analysis is now locked for next month cycle.');
  } else {
    await managerRejectMIS(
      selectedProject.projectId,
      selectedSubmission.monthYear,
      currentUser.email,
      managerCommentRef.current,
      hasDistinctReviewer
    );
    alert(hasDistinctReviewer ? '❌ Rejected. Sent back to Reviewer.' : '❌ Rejected. Sent back to Maker.');
  }
  managerCommentRef.current = '';
  getAllMISSubmissions(selectedProject.projectId).then(setAllSubmissions);
  setActionLoading(false);
};

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const groups = [
      { name: "All Data", data: extractedData },
      { name: "New Bookings", data: extractedData.filter(r => r.Status === 'NEW') },
      { name: "Resale-Anomaly", data: extractedData.filter(r => r.is_resale === true) },
      { name: "Name Corrections", data: extractedData.filter(r => r.Status === 'NAME_CORRECTION') },
      { name: "Cancelled", data: extractedData.filter(r => r.Status === 'CANCELLATION') },
    ];
    groups.forEach(({ name, data }) => {
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Info: "No records" }]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, `MIS_Analysis_${monthYear || "Result"}.xlsx`);
  };


  const downloadOSAgainstDemand = (type, summaryData, isOSDemand) => {
    const wb = XLSX.utils.book_new();
    const ws = {};
    const navyFill  = { type: "pattern", pattern: "solid", fgColor: { rgb: "1F3864" } };
    const amberFill = { type: "pattern", pattern: "solid", fgColor: { rgb: "FFF2CC" } };
    const whiteFill = { type: "pattern", pattern: "solid", fgColor: { rgb: "FFFFFF" } };
    const whiteFont = { bold: true, color: { rgb: "FFFFFF" }, name: "Arial", sz: 9 };
    const boldFont  = { bold: true, name: "Arial", sz: 9 };
    const normFont  = { name: "Arial", sz: 9 };
    const centerAlign = { horizontal: "center", vertical: "center", wrapText: true };
    const rightAlign  = { horizontal: "right", vertical: "center" };
    const leftAlign   = { horizontal: "left", vertical: "center" };
    const thinBorder = {
      top:    { style: "thin", color: { rgb: "CCCCCC" } },
      bottom: { style: "thin", color: { rgb: "CCCCCC" } },
      left:   { style: "thin", color: { rgb: "CCCCCC" } },
      right:  { style: "thin", color: { rgb: "CCCCCC" } },
    };
    const makeCell = (v, font, fill, alignment, numFmt) => ({
      v, t: typeof v === "number" ? "n" : "s",
      s: { font, fill, alignment, border: thinBorder, ...(numFmt ? { numFmt } : {}) },
    });
    const encodeCell = (r, c) => XLSX.utils.encode_cell({ r, c });
    const headers = isOSDemand
      ? ["Outstanding Range", "Units", "Agreement Value (Cr)", "Demand Raised (Cr)", "Amount Received (Cr)", "Receivable (Cr)"]
      : ["Outstanding Range", "Units", "Agreement Value (Cr)", "Amount Received (Cr)", "Receivable (Cr)"];
    headers.forEach((h, c) => {
      ws[encodeCell(0, c)] = makeCell(h, whiteFont, navyFill, centerAlign);
    });
    const data = summaryData[type];
    let rowIdx = 1;
    const ranges = ["Upto 10%", "11-20%", "21-30%", "31-50%", "51-80%", "80% above", "No O/S", "Excess Collection"];
    const CR = 10000000;
    const totals = { units: 0, agreement: 0, raised: 0, received: 0, receivable: 0 };
    ranges.forEach(range => {
      const stats = data[range];
      if (!stats) return;
      totals.units     += stats.units;
      totals.agreement += stats.agreement / CR;
      totals.raised    += stats.raised / CR;
      totals.received  += stats.received / CR;
      if (range !== 'Excess Collection') totals.receivable += stats.receivable / CR;
      const cells = isOSDemand ? [
        makeCell(range,                          normFont, whiteFill, leftAlign),
        makeCell(stats.units,                    normFont, whiteFill, centerAlign),
        makeCell(parseFloat((stats.agreement / CR).toFixed(2)),  normFont, whiteFill, rightAlign, "#,##0.00"),
        makeCell(parseFloat((stats.raised    / CR).toFixed(2)),  normFont, whiteFill, rightAlign, "#,##0.00"),
        makeCell(parseFloat((stats.received  / CR).toFixed(2)),  normFont, whiteFill, rightAlign, "#,##0.00"),
        makeCell(parseFloat((stats.receivable/ CR).toFixed(2)),  normFont, whiteFill, rightAlign, "#,##0.00"),
      ] : [
        makeCell(range,                          normFont, whiteFill, leftAlign),
        makeCell(stats.units,                    normFont, whiteFill, centerAlign),
        makeCell(parseFloat((stats.agreement / CR).toFixed(2)),  normFont, whiteFill, rightAlign, "#,##0.00"),
        makeCell(parseFloat((stats.received  / CR).toFixed(2)),  normFont, whiteFill, rightAlign, "#,##0.00"),
        makeCell(parseFloat((stats.receivable/ CR).toFixed(2)),  normFont, whiteFill, rightAlign, "#,##0.00"),
      ];
      cells.forEach((cell, c) => { ws[encodeCell(rowIdx, c)] = cell; });
      rowIdx++;
    });
    const totalCells = isOSDemand ? [
      makeCell("Total",                                 boldFont, amberFill, leftAlign),
      makeCell(totals.units,                            boldFont, amberFill, centerAlign),
      makeCell(parseFloat(totals.agreement.toFixed(2)), boldFont, amberFill, rightAlign, "#,##0.00"),
      makeCell(parseFloat(totals.raised.toFixed(2)),    boldFont, amberFill, rightAlign, "#,##0.00"),
      makeCell(parseFloat(totals.received.toFixed(2)),  boldFont, amberFill, rightAlign, "#,##0.00"),
      makeCell(parseFloat(totals.receivable.toFixed(2)),boldFont, amberFill, rightAlign, "#,##0.00"),
    ] : [
      makeCell("Total",                                 boldFont, amberFill, leftAlign),
      makeCell(totals.units,                            boldFont, amberFill, centerAlign),
      makeCell(parseFloat(totals.agreement.toFixed(2)), boldFont, amberFill, rightAlign, "#,##0.00"),
      makeCell(parseFloat(totals.received.toFixed(2)),  boldFont, amberFill, rightAlign, "#,##0.00"),
      makeCell(parseFloat(totals.receivable.toFixed(2)),boldFont, amberFill, rightAlign, "#,##0.00"),
    ];
    totalCells.forEach((cell, c) => { ws[encodeCell(rowIdx, c)] = cell; });
    rowIdx++;
    const colCount = isOSDemand ? 6 : 5;
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx - 1, c: colCount - 1 } });
    ws["!cols"] = isOSDemand
      ? [{ wch: 20 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]
      : [{ wch: 20 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    ws["!rows"] = Array.from({ length: rowIdx }, () => ({ hpt: 18 }));
    const sheetLabel = isOSDemand ? "OS Against Demand" : "OS Against Sale Value";
    XLSX.utils.book_append_sheet(wb, ws, `${type} - ${sheetLabel}`);
    XLSX.writeFile(wb, `${sheetLabel}_${type}_${monthYear || 'Export'}.xlsx`);
  };

  const renderAgingSummaryTable = (type, summaryData, filterState, setFilterState) => {
    const data = summaryData[type];
    const isOSDemand = activeTab === 'O/S against Demand Value';
    const totals = Object.entries(data).reduce((acc, [range, c]) => ({
      units: acc.units + c.units, agreement: acc.agreement + c.agreement,
      raised: acc.raised + c.raised, received: acc.received + c.received,
      receivable: range === 'Excess Collection' ? acc.receivable : acc.receivable + c.receivable
    }), { units: 0, agreement: 0, raised: 0, received: 0, receivable: 0 });
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mb-4">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          {type === 'Residential' ? <Building2 className="text-blue-600" size={20} /> : <Store className="text-indigo-600" size={20} />}
          <h3 className="font-bold text-base text-gray-800 uppercase tracking-tight">{type} Analysis</h3>
          <button onClick={() => downloadOSAgainstDemand(type, summaryData, isOSDemand)}
            className="ml-auto px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-xs flex items-center gap-2">
            <Download size={13} /> Download
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] font-black uppercase text-gray-500 bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3">Outstanding Range</th>
              <th className="px-6 py-3 text-center">Units</th>
              <th className="px-6 py-3 text-right">Agreement Value</th>
              {isOSDemand && <th className="px-6 py-3 text-right">Demand Raised</th>}
              <th className="px-6 py-3 text-right">Amount Received</th>
              <th className="px-6 py-3 text-right">Receivable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Object.entries(data).map(([range, stats]) => (
              <tr key={range} onClick={() => setFilterState({ type, range })}
                className={`cursor-pointer hover:bg-blue-50 transition-colors ${filterState?.range === range && filterState?.type === type ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}>
                <td className="px-6 py-3 font-semibold text-gray-700">{range}</td>
                <td className="px-6 py-3 text-center font-bold">{stats.units}</td>
                <td className="px-6 py-3 text-right text-gray-600">₹{formatValue(stats.agreement)}</td>
                {isOSDemand && <td className="px-6 py-3 text-right text-gray-600">₹{formatValue(stats.raised)}</td>}
                <td className="px-6 py-3 text-right text-gray-600">₹{formatValue(stats.received)}</td>
                <td className={`px-6 py-3 text-right font-bold ${stats.receivable > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>₹{formatValue(stats.receivable)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
              <td className="px-6 py-4 text-gray-900">Total</td>
              <td className="px-6 py-4 text-center text-blue-600">{totals.units}</td>
              <td className="px-6 py-4 text-right">₹{formatValue(totals.agreement)}</td>
              {isOSDemand && <td className="px-6 py-4 text-right">₹{formatValue(totals.raised)}</td>}
              <td className="px-6 py-4 text-right">₹{formatValue(totals.received)}</td>
              <td className="px-6 py-4 text-right text-orange-500">₹{formatValue(totals.receivable)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderChangeDetail = (row) => {
    const val = row["Change Details"];
    if (!val) return <span className="text-gray-300 text-xs">-</span>;
    const parts = val.split('|').filter(p => {
      const trimmed = p.trim();
      // Skip the sub-parts of TRANSFER that are handled inside the TRANSFER block
      return !trimmed.startsWith('Customer:') && !trimmed.startsWith('PrevOccupant:');
    });
    return (
      <div className="flex flex-col gap-3 py-1 min-w-[260px]">
        {parts.map((part, idx) => {
          const labelMatch = part.match(/\[(.*?)\]/);
          const label = labelMatch ? labelMatch[1] : null;
          const cleanPart = part.replace(/\[.*?\]\s*/, "").trim();
          if (label === "CANCELLATION") return (
            <div key={idx} className="flex flex-col gap-1 border-l-2 border-red-400 pl-3">
              <span className="text-[10px] font-black text-red-500 uppercase">Unit Cancelled</span>
              <span className="text-red-400 line-through text-xs font-medium">{cleanPart}</span>
            </div>
          );
          if (label === "NEW BOOKING") return (
            <div key={idx} className="flex flex-col gap-1 border-l-2 border-emerald-400 pl-3">
              <span className="text-[10px] font-black text-emerald-600 uppercase">New Booking</span>
              <span className="text-emerald-600 text-xs font-bold">{row["Customer Name"]}</span>
            </div>
          );
          if (label === "ANOMALY") {
            const isCrossUnit = /Unit\s+\S+\s*→\s*Unit/.test(val);
            if (isCrossUnit) {
              const fromUnit = val.match(/Unit\s+(\S+)\s*→\s*Unit/)?.[1];
              const toUnit = val.match(/→\s*Unit\s+(\S+)/)?.[1];
              const prevOccupant = val.match(/PrevOccupant:\s*([^|]+)/)?.[1]?.trim();
              const currCustomer = String(row["Customer Name"] || '').trim();
              return (
                <div key={idx} className="flex flex-col gap-1 border-l-2 border-purple-400 pl-3">
                  <span className="text-[10px] font-black text-purple-600 uppercase">Anomaly / Resale (Unit Change)</span>
                  {fromUnit && toUnit && fromUnit !== toUnit && (
                    <span className="text-gray-400 text-xs font-semibold">{fromUnit} → {toUnit}</span>
                  )}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="line-through text-gray-400">{prevOccupant || 'Unsold'}</span>
                    <ArrowRight size={10} className="text-gray-400" />
                    <span className="text-purple-600 font-bold">{currCustomer}</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={idx} className="flex flex-col gap-1 border-l-2 border-purple-400 pl-3">
                <span className="text-[10px] font-black text-purple-600 uppercase">Anomaly / Resale</span>
                <div className="flex items-center gap-1 text-xs">
                  <span className="line-through text-red-400">{cleanPart.split('→')[0]?.trim()}</span>
                  <ArrowRight size={10} className="text-gray-400" />
                  <span className="text-purple-600 font-bold">{cleanPart.split('→')[1]?.trim()}</span>
                </div>
              </div>
            );
          }
          if (label === "NAME CORRECTION") return (
            <div key={idx} className="flex flex-col gap-1 border-l-2 border-teal-400 pl-3">
              <span className="text-[10px] font-black text-teal-600 uppercase">Name Correction</span>
              <div className="flex items-center gap-1 text-xs">
                <span className="line-through text-gray-400">{cleanPart.split('→')[0]?.trim()}</span>
                <ArrowRight size={10} className="text-gray-400" />
                <span className="text-teal-600 font-bold">{cleanPart.split('→')[1]?.trim()}</span>
              </div>
            </div>
          );
          if (label === "TRANSFER") return (
            <div key={idx} className="flex flex-col gap-1 border-l-2 border-blue-400 pl-3">
              <span className="text-[10px] font-black text-blue-600 uppercase">Transfer</span>
            </div>
          );
          const arrowParts = cleanPart.split('→');
          if (arrowParts.length >= 2) {
            const v1 = parseFloat(arrowParts[0].replace(/[^0-9.-]/g, '')) || 0;
            const v2 = parseFloat(arrowParts[1].replace(/[^0-9.-]/g, '')) || 0;
            const diff = v2 - v1;
            return (
              <div key={idx} className="flex flex-col gap-1 border-l-2 border-gray-200 pl-3">
                <span className="text-[10px] font-black text-blue-600 uppercase">{label?.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-1 text-xs">
                  <span className="line-through text-gray-400">{formatValue(v1)}</span>
                  <ArrowRight size={10} className="text-gray-400" />
                  <span className="font-bold">{formatValue(v2)}</span>
                </div>
                {diff !== 0 && (
                  <div className={`text-[11px] font-bold flex items-center gap-1 ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {diff > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                    {diff > 0 ? 'Raised' : 'Reduced'}: {formatValue(Math.abs(diff))}
                  </div>
                )}
              </div>
            );
          }
          return <div key={idx} className="text-gray-400 text-xs">{cleanPart}</div>;
        })}
      </div>
    );
  };

  const renderTableHeaders = () => orderedColumns.map((h) => {
    const isAgingCol = agingColumns.includes(h);
    if (isAgingCol && activeTab !== 'Debtors Aging') return null;
    if (h === "Change Details" && activeTab === 'Debtors Aging') return null;
    if (['O/S against Demand Value', 'O/S against Sale Value'].includes(activeTab)) {
      if (h === "Change Details" || isAgingCol) return null;
      const allowed = ["Unit No.", "Tower", "Booking Date", "Disbursement", "Registration Date",
        "Unit Type", "Customer Name", "Saleable area in sft", "Carpet area in sft", "Rate per sft",
        "Agreement value", "Demand Raised as on Current Month excl. tax",
        "Amount Received excl. Tax Current Month", "Outstanding against demand",
        "O/S % Demand", "Outstanding against sale value", "O/S against Sale Value"];
      if (!allowed.includes(h)) return null;
    }
    return visibleColumns[h] && (
      <th key={h} className="p-4 font-black uppercase text-[10px] whitespace-nowrap text-gray-500">{COLUMN_LABELS[h] || h}</th>
    );
  });

  const renderTableRows = () => processedData.map((row, idx) => (
    <tr key={idx} className={`hover:bg-blue-50/50 border-b border-gray-100 transition-all
      ${row.Status === 'CANCELLATION' ? 'bg-red-50/30' : ''}`}>
      <td className="p-4">
        <span className={`text-[9px] font-black px-2 py-1 rounded border uppercase
          ${row.Status === 'EXISTING' ? 'text-gray-400 border-gray-200 bg-gray-50' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
          {row.Status === 'EXISTING' ? 'UNCHANGED' : row.Status?.replace(/_/g, ' ') || 'MODIFIED'}
        </span>
      </td>
      {orderedColumns.map((key) => {
        const isAgingCol = agingColumns.includes(key);
        if (isAgingCol && activeTab !== 'Debtors Aging') return null;
        if (key === "Change Details" && activeTab === 'Debtors Aging') return null;
        if (['O/S against Demand Value', 'O/S against Sale Value'].includes(activeTab)) {
          if (key === "Change Details" || isAgingCol) return null;
          const allowed = ["Unit No.", "Tower", "Booking Date", "Disbursement", "Registration Date",
            "Unit Type", "Customer Name", "Saleable area in sft", "Carpet area in sft", "Rate per sft",
            "Agreement value", "Demand Raised as on Current Month excl. tax",
            "Amount Received excl. Tax Current Month", "Outstanding against demand",
            "O/S % Demand", "Outstanding against sale value", "O/S against Sale Value"];
          if (!allowed.includes(key)) return null;
        }
        if (!visibleColumns[key]) return null;
        const val = row[key];
        const isNumericCol = key.toLowerCase().includes('value') || key.toLowerCase().includes('received') ||
  key.toLowerCase().includes('amount') || key.toLowerCase().includes('rate') ||
  key.toLowerCase().includes('demand') || key.toLowerCase().includes('%') ||
  key.toLowerCase().includes('outstanding') || isAgingCol ||
  key === 'MSP_Rate' || key === 'MSP_Variance';

if (key === 'MSP_Flag') {
  return (
    <td key={key} className="p-4 whitespace-nowrap">
      {val === 'BELOW MSP' ? (
        <span className="text-[9px] font-black px-2 py-1 rounded border bg-red-100 text-red-600 border-red-300 uppercase">Below MSP</span>
      ) : val === 'AT/ABOVE MSP' ? (
        <span className="text-[9px] font-black px-2 py-1 rounded border bg-emerald-100 text-emerald-600 border-emerald-300 uppercase">At/Above MSP</span>
      ) : val === 'NO MSP' ? (
        <span className="text-[9px] font-black px-2 py-1 rounded border bg-gray-100 text-gray-500 border-gray-300 uppercase">No MSP</span>
      ) : <span className="text-gray-300 text-xs">-</span>}
    </td>
  );
}

if (key === 'MSP_Variance') {
  const num = getNum(val);
  return (
    <td key={key} className={`p-4 font-bold whitespace-nowrap text-[13px] ${num < 0 ? 'text-rose-600' : num > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
      {val === 0 || val === undefined ? '-' : `${num < 0 ? '▼' : '▲'} ₹${formatValue(Math.abs(num))}`}
    </td>
  );
}

return (
  <td key={key} className={`p-4 font-medium whitespace-nowrap text-[13px] ${isAgingCol ? 'text-blue-600 font-bold bg-blue-50/30' : 'text-gray-700'}`}>
    {key === "Change Details"
      ? renderChangeDetail(row)
      : isNumericCol
        ? formatValue(val, key)
        : formatMISDate(val, key)}
  </td>
);
      })}
      {activeTab === 'New Bookings' && (
        <td className="p-4 min-w-[280px] align-top">
          {isMaker && currentSubmissionStatus !== 'PENDING_REVIEW' && currentSubmissionStatus !== 'PENDING_MANAGER' && currentSubmissionStatus !== 'APPROVED' ? (
            <div className="flex flex-col gap-2">
              <textarea
                placeholder="Add remark..."
                value={rowRemarks[row["Unit No."]] || ""}
                onChange={e => setRowRemarks(prev => ({ ...prev, [row["Unit No."]]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs resize-none focus:outline-none focus:border-blue-400"
                rows={2}
              />
              <label className="flex items-center gap-1 cursor-pointer text-xs text-blue-600 font-bold">
                <Upload size={12} />
                Attach Doc
                <input type="file" className="hidden" onChange={e => { if (e.target.files[0]) handleAttachmentUpload(row["Unit No."], e.target.files[0]); }} />
              </label>
              {(rowAttachmentURLs[row["Unit No."]] || []).map((att, i) => (
                <a key={i} href={att.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline truncate max-w-[200px]">{att.name}</a>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {row.makerRemark && <p className="text-xs text-gray-700 italic">"{row.makerRemark}"</p>}
              {(row.makerAttachments || []).map((att, i) => (
                <a key={i} href={att.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline">{att.name}</a>
              ))}
              {(isReviewer || isManager) && (
                <label className="flex items-center gap-1 cursor-pointer text-xs text-purple-600 font-bold mt-1">
                  <Upload size={12} />
                  Add Doc
                  <input type="file" className="hidden" onChange={async e => {
                    if (!e.target.files[0]) return;
                    const file = e.target.files[0];
                    const uploadRef = ref(storage, `projects/${selectedProject.projectName || selectedProject.projectId}/reviewerAttachments/${row["Unit No."]}_${file.name}`);
                    await uploadBytes(uploadRef, file);
                    const url = await getDownloadURL(uploadRef);
                    const docRef = doc(db, "projects", selectedProject.projectId, "misSubmissions", selectedSubmission.monthYear);
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                      const existing = snap.data().extractedData || [];
                      const updated = existing.map(r => r["Unit No."] === row["Unit No."]
                        ? { ...r, reviewerAttachments: [...(r.reviewerAttachments || []), { name: file.name, url }] }
                        : r
                      );
                      await updateDoc(docRef, { extractedData: updated });
                      setExtractedData(updated);
                    }
                  }} />
                </label>
              )}
              {(row.reviewerAttachments || []).map((att, i) => (
                <a key={i} href={att.url} target="_blank" rel="noreferrer" className="text-xs text-purple-500 underline">{att.name}</a>
              ))}
            </div>
          )}
        </td>
      )}
      {activeTab === 'Resale / Anomaly' && (
        <td className="p-4 min-w-[280px] align-top">
          {isMaker && currentSubmissionStatus !== 'PENDING_REVIEW' && currentSubmissionStatus !== 'PENDING_MANAGER' && currentSubmissionStatus !== 'APPROVED' ? (
            <div className="flex flex-col gap-2">
              <select
                value={anomalyClassification[row["Unit No."]] || ""}
                onChange={e => setAnomalyClassification(prev => ({ ...prev, [row["Unit No."]]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-400 bg-white">
                <option value="">Select type...</option>
                <option value="TRANSFER">Transfer</option>
                <option value="RESALE">Resale</option>
                <option value="OTHER">Other</option>
              </select>
              <textarea
                placeholder="Add remark..."
                value={anomalyRemarks[row["Unit No."]] || ""}
                onChange={e => setAnomalyRemarks(prev => ({ ...prev, [row["Unit No."]]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs resize-none focus:outline-none focus:border-purple-400"
                rows={2}
              />
              <label className="flex items-center gap-1 cursor-pointer text-xs text-purple-600 font-bold">
                <Upload size={12} />
                Attach Doc
                <input type="file" className="hidden" onChange={e => { if (e.target.files[0]) handleAnomalyAttachmentUpload(row["Unit No."], e.target.files[0]); }} />
              </label>
              {(anomalyAttachmentURLs[row["Unit No."]] || []).map((att, i) => (
                <a key={i} href={att.url} target="_blank" rel="noreferrer" className="text-xs text-purple-500 underline truncate max-w-[200px]">{att.name}</a>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {(row.anomalyType || anomalyClassification[row["Unit No."]]) && (
                <span className="text-[9px] font-black px-2 py-1 rounded border bg-purple-50 text-purple-600 border-purple-300 uppercase w-fit">
                  {row.anomalyType || anomalyClassification[row["Unit No."]]}
                </span>
              )}
              {(row.anomalyRemark || anomalyRemarks[row["Unit No."]]) && (
                <p className="text-xs text-gray-700 italic">"{row.anomalyRemark || anomalyRemarks[row["Unit No."]]}"</p>
              )}
              {(row.anomalyAttachments || anomalyAttachmentURLs[row["Unit No."]] || []).map((att, i) => (
                <a key={i} href={att.url} target="_blank" rel="noreferrer" className="text-xs text-purple-500 underline">{att.name}</a>
              ))}
            </div>
          )}
        </td>
      )}
    </tr>
  ));

  const renderInventorySummaryModal = () => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="px-8 py-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-3">
            <ClipboardList className="text-blue-600" size={22} />
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Total Inventory Summary</h2>
          </div>
          <button onClick={() => setShowInventoryModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><X size={20} /></button>
        </div>
        <div className="overflow-auto p-6 bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white">
                <th rowSpan="2" className="px-3 py-3 border border-blue-600 text-[10px] font-black uppercase align-middle">PHASE</th>
                <th rowSpan="2" className="px-3 py-3 border border-blue-600 text-[10px] font-black uppercase align-middle">TOWER NO.</th>
                <th rowSpan="2" className="px-3 py-3 border border-blue-600 text-[10px] font-black uppercase align-middle">UNIT TYPE</th>
                <th rowSpan="2" className="px-3 py-3 border border-blue-600 text-[10px] font-black uppercase text-right">TOTAL UNITS</th>
                <th rowSpan="2" className="px-3 py-3 border border-blue-600 text-[10px] font-black uppercase text-right">SALEABLE AREA</th>
                <th rowSpan="2" className="px-3 py-3 border border-blue-600 text-[10px] font-black uppercase text-right">MSP</th>
                <th colSpan="4" className="px-3 py-3 border border-blue-600 text-[10px] font-black uppercase text-center">AS PER MIS</th>
                <th colSpan="2" className="px-3 py-3 border border-blue-600 text-[10px] font-black uppercase text-center">UNSOLD INVENTORY</th>
                <th colSpan="3" className="px-3 py-3 border border-blue-600 text-[10px] font-black uppercase text-center">RECEIVABLE</th>
              </tr>
              <tr className="bg-blue-700 text-white">
                {["UNITS SOLD", "AREA SOLD", "ASSET VALUE (CR)", "AMT RECEIVED (CR)",
                  "UNSOLD UNITS", "UNSOLD AREA",
                  "FROM UNSOLD (CR)", "FROM SOLD (CR)", "TOTAL (CR)"].map((h, i) => (
                  <th key={i} className="px-3 py-2 border border-blue-600 text-[10px] font-black uppercase text-right">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {inventorySummaryComputed.map((row, idx) => (
                <tr key={idx} className={`${row.is_subtotal ? 'bg-amber-50 font-black text-gray-900' : 'hover:bg-gray-50'} border-b border-gray-100`}>
                  <td className="px-4 py-3 border border-gray-200 text-[13px]">{row.phase}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px]">{row.tower}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px]">{row.unit_type}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-center font-bold">{row.total_units}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.saleable_area)}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{row.msp > 0 ? formatValue(row.msp) : '-'}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-center font-bold">{row.units_sold}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.area_sold)}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.asset_value_inr_cr)}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.amount_received_oct25)}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-center font-bold">{row.unsold_units}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.unsold_saleable_area)}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.receivable_unsold_inr_cr)}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.receivable_sold_inr_cr)}</td>
                  <td className="px-4 py-3 border border-gray-200 text-[13px] text-right font-bold text-orange-500">{formatValue(row.total_receivable_inr_cr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-5 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
  <button onClick={() => {
  const wb = XLSX.utils.book_new();
  const ws = {};

  // ── Color palette ──────────────────────────────────────────────
  const navyFill   = { type: "pattern", pattern: "solid", fgColor: { rgb: "1F3864" } };
  const amberFill  = { type: "pattern", pattern: "solid", fgColor: { rgb: "FFF2CC" } };
  const whiteFill  = { type: "pattern", pattern: "solid", fgColor: { rgb: "FFFFFF" } };

  const whiteFont  = { bold: true, color: { rgb: "FFFFFF" }, name: "Arial", sz: 9 };
  const boldFont   = { bold: true, name: "Arial", sz: 9 };
  const normFont   = { name: "Arial", sz: 9 };

  const centerAlign = { horizontal: "center", vertical: "center", wrapText: true };
  const rightAlign  = { horizontal: "right",  vertical: "center" };
  const leftAlign   = { horizontal: "left",   vertical: "center" };

  const thinBorder = {
    top:    { style: "thin", color: { rgb: "CCCCCC" } },
    bottom: { style: "thin", color: { rgb: "CCCCCC" } },
    left:   { style: "thin", color: { rgb: "CCCCCC" } },
    right:  { style: "thin", color: { rgb: "CCCCCC" } },
  };

  const makeCell = (v, font, fill, alignment, numFmt) => ({
    v, t: typeof v === "number" ? "n" : "s",
    s: { font, fill, alignment, border: thinBorder, ...(numFmt ? { numFmt } : {}) },
  });

  // ── Helper: format numbers ──────────────────────────────────────
  const fmtCr  = (n) => n === 0 ? null : parseFloat(n.toFixed(2));
  const fmtArea= (n) => n === 0 ? null : Math.round(n);
  const fmtInt = (n) => n === 0 ? null : n;
  const dash   = (v) => v == null ? makeCell("-", normFont, whiteFill, rightAlign) : null;

  // ── Column definitions (15 data cols + merged headers) ──────────
  // Row 1 — group headers (merged)
  // Row 2 — sub-headers
  // Row 3+ — data

  const COL_WIDTHS = [14, 10, 16, 10, 14, 8, 10, 14, 16, 18, 10, 14, 16, 18, 16];

  // Row 1: group header labels + spans
  // Cols: A=Phase B=Tower C=UnitType  D=TotalUnits E=SaleableArea
  //       F=MSP  (inside Unsold group — see row2)
  //       G=UnitsSold H=AreaSold I=AssetValue J=AmtReceived  ← "As per MIS" group
  //       K=UnsoldUnits L=UnsoldArea M=MSP                   ← "Unsold Inventory" group
  //       N=RecFromUnsold O=RecFromSold P=TotalRec            ← "Receivable" group

  // Actual column layout (0-indexed): 
  // 0:Phase 1:Tower 2:UnitType 3:TotalUnits 4:SaleableArea
  // 5:UnitsSold 6:AreaSold 7:AssetValue 8:AmtReceived      ← As per MIS (4 cols, merge from E to H → cols 5-8? no)
  // Let me match image3 exactly:
  // Phase | Tower | UnitType | TotalUnits | SaleableArea | UnitsSold | AreaSold | AssetValue | AmtReceived | UnsoldUnits | UnsoldArea | MSP | RecUnsold | RecSold | TotalRec

  const COLS = 15; // A..O
  const encodeCell = (r, c) => XLSX.utils.encode_cell({ r, c });

  // ── Row 1: Top group headers ────────────────────────────────────
  // A1:E1 = "Phase" / empty (no group label needed for first 5 cols)
  // Actually image3 has row1 = Phase | TowerNo | UnitType | [Total Inventory span cols 4-5] | [As per MIS span] | [Unsold Inventory span] | [Receivable span]
  // Let me re-read image3:
  // Row1: Phase(merge r1:r2) | TowerNo(merge r1:r2) | UnitType(merge r1:r2) | Total Inventory(span 2) | As per MIS(span 4) | Unsold Inventory(span 3) | Receivable(span 3)
  // Row2: (continued) | TotalUnits | SaleableArea | UnitsSold | AreaSold | AssetValue(Cr) | AmtReceived(Cr) | NoOfUnits | SaleableArea | MSP(INR) | RecUnsold(Cr) | RecSold(Cr) | TotalRec(Cr)
  // That's 3+2+4+3+3 = 15 cols ✓

  const r1headers = [
    { label: "Phase",            col: 0, span: 1, mergeRow: true },
    { label: "Tower No.",        col: 1, span: 1, mergeRow: true },
    { label: "Unit Type",        col: 2, span: 1, mergeRow: true },
    { label: "Total Inventory",  col: 3, span: 2, mergeRow: false },
    { label: `As per ${monthYear || ''} MIS`, col: 5, span: 4, mergeRow: false },
    { label: "Unsold Inventory", col: 9, span: 3, mergeRow: false },
    { label: "Receivable",       col: 12, span: 3, mergeRow: false },
  ];

  const r2headers = [
    "Phase", "Tower No.", "Unit Type",
    "Total No. of Units", "Saleable Area",
    "No. of Units Sold", "Area Sold", `Asset value in INR Cr.`, `Amount Received as on ${monthYear || ''} in INR Cr.`,
    "No. of units", "Saleable Area", "MSP in INR",
    `Receivable from Unsold in INR Cr.`, `Receivables from sold in INR Cr.`, `Total receivable in INR Cr.`
  ];

  // ── Write Row 0 (group headers) ─────────────────────────────────
  r1headers.forEach(({ label, col, span, mergeRow }) => {
    ws[encodeCell(0, col)] = makeCell(label, whiteFont, navyFill, centerAlign);
    for (let c = col + 1; c < col + span; c++) {
      ws[encodeCell(0, c)] = makeCell("", whiteFont, navyFill, centerAlign);
    }
    if (mergeRow) {
      // merge row 0 and row 1 for this col
    }
  });

  // ── Write Row 1 (sub-headers) ───────────────────────────────────
  r2headers.forEach((label, c) => {
    ws[encodeCell(1, c)] = makeCell(label, whiteFont, navyFill, centerAlign);
  });

  // ── Merges ──────────────────────────────────────────────────────
  ws["!merges"] = [
    // Row 0 group spans
    { s: { r:0, c:3  }, e: { r:0, c:4  } }, // Total Inventory
    { s: { r:0, c:5  }, e: { r:0, c:8  } }, // As per MIS
    { s: { r:0, c:9  }, e: { r:0, c:11 } }, // Unsold Inventory
    { s: { r:0, c:12 }, e: { r:0, c:14 } }, // Receivable
    // Phase/Tower/UnitType merge rows 0+1
    { s: { r:0, c:0 }, e: { r:1, c:0 } },
    { s: { r:0, c:1 }, e: { r:1, c:1 } },
    { s: { r:0, c:2 }, e: { r:1, c:2 } },
  ];

  // ── Data rows ───────────────────────────────────────────────────
  // Group rows by section for Phase cell merging
  const resRows  = inventorySummaryComputed.filter(r => !r.is_subtotal && !isCommercial(r.unit_type));
  const comRows  = inventorySummaryComputed.filter(r => !r.is_subtotal &&  isCommercial(r.unit_type));
  const resSub   = inventorySummaryComputed.find(r => r.is_subtotal && r.unit_type.includes("Residential"));
  const comSub   = inventorySummaryComputed.find(r => r.is_subtotal && r.unit_type.includes("Commercial"));
  const grandTot = inventorySummaryComputed.find(r => r.is_subtotal && r.unit_type.includes("Grand"));

  let rowIdx = 2; // data starts at excel row 3 (0-indexed row 2)

  const writeDataRow = (row, phaseLabel, isSubtotal) => {
    const fill = isSubtotal ? amberFill : whiteFill;
    const font   = isSubtotal ? boldFont  : normFont;

    const totalUnits   = fmtInt(row.total_units);
    const saleableArea = fmtArea(row.saleable_area);
    const unitsSold    = fmtInt(row.units_sold);
    const areaSold     = fmtArea(row.area_sold);
    const assetVal     = fmtCr(row.asset_value_inr_cr);
    const amtRec       = fmtCr(row.amount_received_oct25);
    const unsoldUnits  = fmtInt(row.unsold_units);
    const unsoldArea   = fmtArea(row.unsold_saleable_area);
    const msp          = row.msp > 0 ? row.msp : null;
    const recUnsold    = fmtCr(row.receivable_unsold_inr_cr);
    const recSold      = fmtCr(row.receivable_sold_inr_cr);
    const totalRec     = fmtCr(row.total_receivable_inr_cr);

    const cells = [
      makeCell(phaseLabel || "", font, fill, leftAlign),
      makeCell(isSubtotal ? "" : (row.tower || ""), font, fill, centerAlign),
      makeCell(isSubtotal ? row.unit_type : (row.unit_type || ""), font, fill, leftAlign),
      totalUnits   != null ? makeCell(totalUnits,   font, fill, centerAlign) : makeCell("-", font, fill, centerAlign),
      saleableArea != null ? makeCell(saleableArea, font, fill, rightAlign, "#,##0") : makeCell("-", font, fill, rightAlign),
      unitsSold    != null ? makeCell(unitsSold,    font, fill, centerAlign) : makeCell("-", font, fill, centerAlign),
      areaSold     != null ? makeCell(areaSold,     font, fill, rightAlign, "#,##0") : makeCell("-", font, fill, rightAlign),
      assetVal     != null ? makeCell(assetVal,     font, fill, rightAlign, "#,##0.00") : makeCell("-", font, fill, rightAlign),
      amtRec       != null ? makeCell(amtRec,       font, fill, rightAlign, "#,##0.00") : makeCell("-", font, fill, rightAlign),
      unsoldUnits  != null ? makeCell(unsoldUnits,  font, fill, centerAlign) : makeCell("-", font, fill, centerAlign),
      unsoldArea   != null ? makeCell(unsoldArea,   font, fill, rightAlign, "#,##0") : makeCell("-", font, fill, rightAlign),
      msp          != null ? makeCell(msp,           font, fill, rightAlign, "#,##0") : makeCell("-", font, fill, rightAlign),
      recUnsold    != null ? makeCell(recUnsold,     font, fill, rightAlign, "#,##0.00") : makeCell("-", font, fill, rightAlign),
      recSold      != null ? makeCell(recSold,       font, fill, rightAlign, "#,##0.00") : makeCell("-", font, fill, rightAlign),
      totalRec != null ? makeCell(totalRec, { ...font, bold: true, color: { rgb: "000000" } }, fill, rightAlign, "#,##0.00") : makeCell("-", { ...font, bold: true, color: { rgb: "000000" } }, fill, rightAlign),
    ];

    cells.forEach((cell, c) => { ws[encodeCell(rowIdx, c)] = cell; });
    rowIdx++;
    return rowIdx - 1; // return the row just written
  };

  // Residential data rows
  const resStartRow = rowIdx;
  resRows.forEach(row => writeDataRow(row, "", false));
  const resEndRow = rowIdx - 1;
  // Subtotal
  if (resSub) writeDataRow(resSub, "Subtotal", true);

  // Commercial data rows
  const comStartRow = rowIdx;
  comRows.forEach(row => writeDataRow(row, "", false));
  const comEndRow = rowIdx - 1;
  if (comSub) writeDataRow(comSub, "Subtotal", true);

  // Grand Total
  if (grandTot) writeDataRow({ ...grandTot, unit_type: "Total (Residential + Commercial)" }, "Total", true);

  // ── Phase label merges (col A) ───────────────────────────────────
  if (resRows.length > 0) {
    ws[encodeCell(resStartRow, 0)] = makeCell("Residential", normFont, whiteFill, { ...centerAlign, horizontal: "left" });
    if (resEndRow > resStartRow) {
      ws["!merges"].push({ s: { r: resStartRow, c: 0 }, e: { r: resEndRow, c: 0 } });
    }
  }
  if (comRows.length > 0) {
    ws[encodeCell(comStartRow, 0)] = makeCell("Commercial", normFont, whiteFill, { ...centerAlign, horizontal: "left" });
    if (comEndRow > comStartRow) {
      ws["!merges"].push({ s: { r: comStartRow, c: 0 }, e: { r: comEndRow, c: 0 } });
    }
  }

  // ── Sheet range & col widths ─────────────────────────────────────
  ws["!ref"] = XLSX.utils.encode_range({ s: { r:0, c:0 }, e: { r: rowIdx - 1, c: 14 } });
  ws["!cols"] = COL_WIDTHS.map(w => ({ wch: w }));
  ws["!rows"] = Array.from({ length: rowIdx }, (_, i) => ({ hpt: i < 2 ? 36 : 18 }));

  XLSX.utils.book_append_sheet(wb, ws, "Inventory Summary");
  XLSX.writeFile(wb, `Inventory_Summary_${monthYear || 'Export'}.xlsx`);
}}
    className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-colors">
    <Download size={14} /> Download Summary
    {isMaker && <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full ml-1">PENDING</span>}
  </button>
  <button onClick={() => setShowInventoryModal(false)}
    className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">
    Close Summary
  </button>
</div>
      </div>
    </div>
  );

  // Sanity Gate — purely driven by Firestore cycle state now (no localStorage bypass)

if (isMaker && cycleLoading) {
  return (
    <Layout title="MIS Analysis">
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-gray-400 text-sm">Checking access...</p>
      </div>
    </Layout>
  );
}

const isMisLocked = false;

if (isMisLocked) {
  return (
    <Layout title="MIS Analysis">
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
          <ShieldX size={32} className="text-red-500" />
        </div>
        <h2 className="text-gray-800 font-bold text-xl mb-2">Access Restricted</h2>
        <p className="text-gray-400 text-sm max-w-sm">
          MIS Analysis is locked. Complete Sanity Check or wait for Manager approval.
        </p>
        <button onClick={() => navigate("/mis-sanity")}
          className="mt-6 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition">
          Go to MIS Sanity Check
        </button>
      </div>
    </Layout>
  );
}
  const hasData = extractedData.length > 0;

  // ── Shared analysis render (used by all roles) ────────────────────────────────
  const renderAnalysis = () => (
    <>
      {/* Download */}
      <div className="flex justify-end mb-4 gap-3">
        {inventorySummaryComputed.length > 0 && (
          <button onClick={() => setShowInventoryModal(true)}
            className="px-5 py-2.5 rounded-lg font-bold text-sm bg-white border border-emerald-300 hover:border-emerald-500 text-emerald-600 hover:bg-emerald-50 flex items-center gap-2 transition-all shadow-sm">
            <ClipboardList size={14} /> Total Inventory Summary
          </button>
        )}
        <button onClick={downloadExcel}
          className="px-5 py-2.5 rounded-lg font-bold text-sm bg-green-600 hover:bg-green-700 text-white shadow flex items-center gap-2">
          <Download size={14} /> Download Results
        </button>
      </div>

      {/* Total / Sold / Unsold */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex items-center justify-around mb-6">
        {[
          { label: 'Total Units', value: inventorySummaryComputed.length > 0
              ? (inventorySummaryComputed.find(r => r.is_subtotal && r.unit_type.includes('Grand'))?.total_units || unitStats.total)
              : unitStats.total, color: 'text-purple-600' },
          { label: 'Sold Units', value: unitStats.sold, color: 'text-blue-600' },
          { label: 'Unsold Units', value: inventorySummaryComputed.length > 0
              ? (inventorySummaryComputed.find(r => r.is_subtotal && r.unit_type.includes('Grand'))?.unsold_units || unitStats.unsold)
              : unitStats.unsold, color: 'text-rose-500' },
        ].map((s, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className={`text-3xl font-bold ${s.color}`}>{s.value}</span>
            <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Target Cards */}
      {monthYear && businessPlanData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-5 rounded-2xl border border-blue-200 bg-white shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Target size={20} />
                <span className="text-sm font-black uppercase tracking-widest">Target New Sales Collection</span>
              </div>
              <span className="text-[10px] font-black text-gray-400 uppercase">
                {bpTargets.quarter || 'No Quarter'} — Monthly Target
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 uppercase font-bold mb-1">Planned Target</span>
                <span className="text-xl font-black text-gray-900">₹{formatValue(bpTargets.planned_collection)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 uppercase font-bold mb-1">Actual Collection</span>
                <span className="text-xl font-black text-emerald-600">₹{formatValue(auditTotals.receivedIncrement)}</span>
              </div>
              <div className="flex flex-col border-l border-gray-100 pl-4">
  <span className="text-[10px] text-gray-400 uppercase font-bold mb-1">Net Collection</span>
  <span className="text-xl font-black text-blue-600">
    ₹{formatValue(auditTotals.receivedIncrement - auditTotals.cancelledAmountReceived - auditTotals.receivedDecrement)}
  </span>
  <span className="text-[10px] text-gray-400 mt-1">Actual − Cancelled − Decreased</span>
</div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              {(() => {
                const net = auditTotals.receivedIncrement - auditTotals.cancelledAmountReceived - auditTotals.receivedDecrement;
const planned = bpTargets.planned_collection;
                const surplus = net >= planned;
                const diff = Math.abs(net - planned);
                const pct = planned > 0 ? ((net / planned) * 100).toFixed(1) : net > 0 ? 'Target Not Set' : '0.0';
                return (
                  <>
                    <div className={`flex items-center gap-1 text-[11px] font-black uppercase ${surplus ? 'text-emerald-600' : 'text-rose-500'}`}>
                      <TrendingUp size={14} className={surplus ? '' : 'rotate-180'} />
                      {surplus ? 'Surplus' : 'Shortfall'}: ₹{formatValue(diff)}
                    </div>
                    <span className="text-[10px] text-gray-400 italic">
                      ({typeof pct === 'string' ? pct : `${pct}% Achieved`})
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="p-5 rounded-2xl border border-indigo-200 bg-white shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-600">
                <BarChart3 size={20} />
                <span className="text-sm font-black uppercase tracking-widest">Target Area to be Sold</span>
              </div>
              <span className="text-[10px] font-black text-gray-400 uppercase">
                {bpTargets.quarter || 'No Quarter'} — Monthly Target (SFT)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 uppercase font-bold mb-1">Planned Target</span>
                <span className="text-xl font-black text-gray-900">{formatValue(bpTargets.planned_area)} <span className="text-xs text-gray-400">sft</span></span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 uppercase font-bold mb-1">Actual (New Bookings)</span>
                <span className="text-xl font-black text-indigo-600">{formatValue(auditTotals.actualAreaSold)} <span className="text-xs text-gray-400">sft</span></span>
              </div>
              <div className="flex flex-col border-l border-gray-100 pl-4">
                <span className="text-[10px] text-gray-400 uppercase font-bold mb-1">Net Area Sold</span>
                <span className="text-xl font-black text-emerald-600">{formatValue(auditTotals.netAreaSold)} <span className="text-xs text-gray-400">sft</span></span>
                <span className="text-[10px] text-gray-400 mt-1">New − Cancelled</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              {(() => {
                const met = auditTotals.actualAreaSold >= bpTargets.planned_area;
                const diff = Math.abs(auditTotals.actualAreaSold - bpTargets.planned_area);
                const pct = bpTargets.planned_area > 0 ? ((auditTotals.actualAreaSold / bpTargets.planned_area) * 100).toFixed(1) : auditTotals.actualAreaSold > 0 ? 'Target Not Set' : '0.0';
                return (
                  <>
                    <div className={`flex items-center gap-1 text-[11px] font-black uppercase ${met ? 'text-emerald-600' : 'text-rose-500'}`}>
                      <TrendingUp size={14} className={met ? '' : 'rotate-180'} />
                      {met ? 'Target Met' : 'Gap'}: {formatValue(diff)} sft
                    </div>
                    <span className="text-[10px] text-gray-400 italic">
                      ({typeof pct === 'string' ? pct : `${pct}% Achieved`})
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Summary Till Date */}
      <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Summary Till Date</p>
      <div className="grid grid-cols-2 gap-4 mb-6">
        {['Residential', 'Commercial'].map((type) => (
          <div key={type} className="p-4 rounded-xl border border-gray-200 bg-white flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 ${type === 'Residential' ? 'text-blue-600' : 'text-indigo-600'}`}>
                {type === 'Residential' ? <Building2 size={20} /> : <Store size={20} />}
                <span className="text-sm font-bold uppercase">{type} Units</span>
              </div>
              {(() => {
                const invRow = inventorySummaryComputed.find(r => r.is_subtotal &&
                  (type === 'Residential' ? r.unit_type.includes('Residential') : r.unit_type.includes('Commercial'))
                );
                if (invRow) return (
                  <span className="text-xs font-black text-gray-400">
                    Total: {invRow.total_units} | Sold: {invRow.units_sold} | Unsold: {invRow.unsold_units}
                  </span>
                );
                return null;
              })()}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-5 gap-2">
              {[
                { label: 'Agreement', value: '₹' + formatValue(summaryTillDate[type].Sold.agreement / 10000000) + ' Cr' },
                { label: 'Saleable', value: formatValue(summaryTillDate[type].Sold.saleable) + ' sft' },
                { label: 'Carpet', value: formatValue(summaryTillDate[type].Sold.carpet) + ' sft' },
                { label: 'Collection', value: '₹' + formatValue(summaryTillDate[type].Sold.collection / 10000000) + ' Cr' },
                { label: 'Demand', value: '₹' + formatValue(summaryTillDate[type].Sold.demand / 10000000) + ' Cr' },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col">
                  <span className="text-[9px] text-gray-400 uppercase font-bold">{label}</span>
                  <span className={`text-xs font-bold ${type === 'Residential' ? 'text-blue-600' : 'text-indigo-600'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Comparison Sanity Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-700">Comparison of Prev &amp; Curr Month</h3>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-black uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3">Metric</th>
              <th className="px-6 py-3 text-right">Prev Month</th>
              <th className="px-6 py-3 text-right">Curr Month</th>
              <th className="px-6 py-3 text-right">Variation</th>
              <th className="px-6 py-3 text-right text-emerald-600">New Bookings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(() => {
              const newBookingsCount = extractedData.filter(r => r.Status === 'NEW').length;
              const currSold = unitStats.sold;
              const prevSold = currSold - newBookingsCount + auditTotals.cancellations;
              const netSoldVariation = newBookingsCount - auditTotals.cancellations;
              const currAgreement = summaryTillDate.Residential.Sold.agreement + summaryTillDate.Commercial.Sold.agreement;
              const newBookingsAgreement = extractedData.filter(r => r.Status === 'NEW').reduce((a, r) => a + getNum(r["Agreement value"]), 0);
              const cancelledAgreement = extractedData.filter(r => r.Status === 'CANCELLATION').reduce((a, r) => a + getNum(r["Agreement value"]), 0);
              const prevAgreement = currAgreement - newBookingsAgreement + cancelledAgreement;
              const currSaleable = summaryTillDate.Residential.Sold.saleable + summaryTillDate.Commercial.Sold.saleable;
              const prevSaleable = currSaleable - auditTotals.actualAreaSold + auditTotals.cancelledAreaSold;
              const newCarpet = extractedData.filter(r => r.Status === 'NEW').reduce((a, r) => a + getNum(r["Carpet area in sft"]), 0);
              const cancelledCarpet = extractedData.filter(r => r.Status === 'CANCELLATION').reduce((a, r) => a + getNum(r["Carpet area in sft"]), 0);
              const currCarpet = summaryTillDate.Residential.Sold.carpet + summaryTillDate.Commercial.Sold.carpet;
              const prevCarpet = currCarpet - newCarpet + cancelledCarpet;
              const currDemand = summaryTillDate.Residential.Sold.demand + summaryTillDate.Commercial.Sold.demand;
              const newDemand = extractedData.filter(r => r.Status === 'NEW').reduce((a, r) => a + getNum(r["Demand Raised as on Current Month excl. tax"]), 0);
              const prevDemand = currDemand - newDemand - (auditTotals.demandIncrement - newDemand) + auditTotals.demandDecrement;
              const currCollection = summaryTillDate.Residential.Sold.collection + summaryTillDate.Commercial.Sold.collection;
              const newCollection = extractedData.filter(r => r.Status === 'NEW').reduce((a, r) => a + getNum(r["Amount Received excl. Tax Current Month"]), 0);
              const prevCollection = currCollection - newCollection - (auditTotals.receivedIncrement - newCollection) + auditTotals.receivedDecrement;
              const rows = [
                { label: 'Sold Units', prev: prevSold, curr: currSold, isCount: true, netVariation: netSoldVariation, newVal: newBookingsCount },
                { label: 'Agreement Value', prev: prevAgreement, curr: currAgreement, isAmount: true, newVal: newBookingsAgreement },
                { label: 'Saleable Area (sft)', prev: prevSaleable, curr: currSaleable, newVal: auditTotals.actualAreaSold },
                { label: 'Carpet Area (sft)', prev: prevCarpet, curr: currCarpet, newVal: newCarpet },
                { label: 'Demand Raised', prev: prevDemand, curr: currDemand, isAmount: true, newVal: newDemand },
                { label: 'Collection', prev: prevCollection, curr: currCollection, isAmount: true, newVal: newCollection },
              ];
              return rows.map(({ label, prev, curr, isAmount, isCount, netVariation, newVal }) => {
                const variation = netVariation !== undefined ? netVariation : curr - prev;
                const fmt = (v) => isCount ? Math.round(v) : isAmount ? '₹' + formatValue(v / 10000000) + ' Cr' : formatValue(v);
                return (
                  <tr key={label} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-semibold text-gray-700">{label}</td>
                    <td className="px-6 py-3 text-right text-gray-600">{fmt(prev)}</td>
                    <td className="px-6 py-3 text-right text-gray-800 font-bold">{fmt(curr)}</td>
                    <td className={`px-6 py-3 text-right font-bold ${variation >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {variation >= 0 ? '+' : ''}{fmt(variation)}
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-emerald-600">{fmt(newVal)}</td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {[
          { label: 'New Bookings', value: extractedData.filter(r => r.Status === 'NEW').length, color: 'text-emerald-600', tab: 'New Bookings' },
          { label: 'Resale / Anomaly', value: extractedData.filter(r => r.is_resale === true).length, color: 'text-purple-600', tab: 'Resale / Anomaly' },
          { label: 'Name Corrections', value: extractedData.filter(r => r.Status === 'NAME_CORRECTION').length, color: 'text-pink-500', tab: 'Name Corrections' },
          { label: 'Cancellations', value: auditTotals.cancellations, color: 'text-red-500', tab: 'Cancellations' },
          { label: 'Demand ↑', value: '₹' + formatValue(auditTotals.demandIncrement), color: 'text-orange-500', tab: 'Demand Raised Change' },
          { label: 'Collection ↑', value: '₹' + formatValue(auditTotals.receivedIncrement), color: 'text-cyan-600', tab: 'Amount Received Change' },
          { label: 'Aging Total', value: '₹' + formatValue(auditTotals.totalAgingAmt), color: 'text-rose-500', tab: 'Debtors Aging' },
          { label: 'Below MSP', value: mspData?.rates ? mspAnalysis.belowMSP.length : '-', color: 'text-orange-500', tab: 'MSP Analysis' },
        ].map((s, i) => (
          <div key={i} onClick={() => { setActiveTab(s.tab); analysisTablesRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
            className="p-4 rounded-xl border border-gray-200 bg-white shadow-sm cursor-pointer hover:border-blue-400 hover:shadow-md transition-all">
            <span className={`text-lg font-bold ${s.color} block`}>{s.value}</span>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Tab-specific content */}
      {activeTab === 'O/S against Demand Value' && (
        <div className="mb-6" ref={analysisTablesRef}>
          {renderAgingSummaryTable('Residential', agingSummary, selectedAgingFilter, setSelectedAgingFilter)}
          {renderAgingSummaryTable('Commercial', agingSummary, selectedAgingFilter, setSelectedAgingFilter)}
        </div>
      )}
      {activeTab === 'O/S against Sale Value' && (
        <div className="mb-6" ref={analysisTablesRef}>
          {renderAgingSummaryTable('Residential', saleSummary, selectedSaleFilter, setSelectedSaleFilter)}
          {renderAgingSummaryTable('Commercial', saleSummary, selectedSaleFilter, setSelectedSaleFilter)}
        </div>
      )}

      {activeTab === 'Inventory Summary' && (
        <div className="mb-6" ref={analysisTablesRef}>
          {!inventoryData ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <Building2 size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-semibold">No Inventory Sheet uploaded yet</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ClipboardList className="text-blue-600" size={20} />
                  <h3 className="font-bold text-base text-gray-800 uppercase tracking-tight">Total Inventory Summary</h3>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-left border-collapse min-w-max">
                  <thead>
                    <tr className="bg-blue-700 text-white">
                      {["PHASE","TOWER","UNIT TYPE","TOTAL UNITS","SALEABLE AREA","MSP","UNITS SOLD","AREA SOLD","ASSET VALUE (CR)","AMT RECEIVED (CR)","UNSOLD UNITS","UNSOLD AREA","REC. UNSOLD (CR)","REC. SOLD (CR)","TOTAL REC. (CR)"].map((h,i) => (
                        <th key={i} className="px-4 py-3 border border-blue-600 text-[10px] font-black uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-gray-700">
                    {inventorySummaryComputed.map((row, idx) => (
                      <tr key={idx} className={`${row.is_subtotal ? 'bg-amber-50 font-black' : 'hover:bg-gray-50'} border-b border-gray-100`}>
                        <td className="px-4 py-3 border border-gray-200 text-[13px]">{row.phase}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px]">{row.tower}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px]">{row.unit_type}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-center font-bold">{row.total_units}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.saleable_area)}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{row.msp > 0 ? formatValue(row.msp) : '-'}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-center font-bold text-blue-600">{row.units_sold}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.area_sold)}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.asset_value_inr_cr)}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.amount_received_oct25)}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-center font-bold text-rose-500">{row.unsold_units}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.unsold_saleable_area)}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.receivable_unsold_inr_cr)}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-right">{formatValue(row.receivable_sold_inr_cr)}</td>
                        <td className="px-4 py-3 border border-gray-200 text-[13px] text-right font-bold text-orange-500">{formatValue(row.total_receivable_inr_cr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'Planned vs Actual' && (
        <div className="mb-6" ref={analysisTablesRef}>
          {!businessPlanData ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <TrendingUp size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-semibold">No Business Plan uploaded yet</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-3">
                  <TrendingUp className="text-emerald-600" size={20} />
                  <h3 className="font-bold text-base text-gray-800 uppercase tracking-tight">Business Plan — All Quarters</h3>
                </div>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] font-black uppercase text-gray-500 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3">Financial Year</th>
                    <th className="px-6 py-3">Quarter</th>
                    <th className="px-6 py-3 text-right">Planned Sales (Cr)</th>
                    <th className="px-6 py-3 text-right">Planned Collection (Cr)</th>
                    <th className="px-6 py-3 text-right">Monthly Collection (÷3)</th>
                    <th className="px-6 py-3 text-right">Planned Area (sft)</th>
                    <th className="px-6 py-3 text-right">Monthly Area (÷3)</th>
                    <th className="px-6 py-3 text-right">Rate/sft</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {businessPlanData.quarters?.map((q, idx) => {
                    const isCurrentQ = bpTargets.quarter && String(q.quarter || '').trim().toUpperCase() === bpTargets.quarter.toUpperCase()
                      && String(q.financialYear || '').includes(monthYear.split('-')[1] || '');
                    return (
                      <tr key={idx} className={`transition-colors ${isCurrentQ ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'}`}>
                        <td className="px-6 py-3 font-semibold text-gray-800">{q.financialYear}</td>
                        <td className="px-6 py-3 text-gray-600">
                          {q.quarter}
                          {isCurrentQ && <span className="ml-2 text-[9px] font-black bg-blue-600 text-white px-2 py-0.5 rounded">CURRENT</span>}
                        </td>
                        <td className="px-6 py-3 text-right text-emerald-600 font-bold">₹{formatValue(getNum(q.expensesPlanned) / 10000000)} Cr</td>
                        <td className="px-6 py-3 text-right text-blue-600 font-bold">₹{formatValue(getNum(q.collectionsPlanned) / 10000000)} Cr</td>
                        <td className="px-6 py-3 text-right text-orange-500 font-bold">₹{formatValue(getNum(q.collectionsPlanned) / 3)}</td>
                        <td className="px-6 py-3 text-right text-gray-600">{formatValue(getNum(q.areaToSellPlanned))}</td>
                        <td className="px-6 py-3 text-right text-gray-600">{formatValue(getNum(q.areaToSellPlanned) / 3)}</td>
                        <td className="px-6 py-3 text-right text-gray-600">₹{formatValue(getNum(q.ratePerSft))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'MSP Analysis' && (
        <div className="mb-6" ref={analysisTablesRef}>
          {!mspData?.rates ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <BadgePercent size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-semibold">No MSP Sheet uploaded yet</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BadgePercent className="text-orange-500" size={20} />
                  <h3 className="font-bold text-base text-gray-800 uppercase tracking-tight">MSP Analysis — New Bookings</h3>
                </div>
                <span className="text-xs font-black text-rose-500 bg-rose-50 border border-rose-200 px-3 py-1 rounded-full">
                  ⚠ {mspAnalysis.belowMSP.length} Below MSP
                </span>
              </div>
              {(() => {
  const allMSPRows = [
    ...mspAnalysis.belowMSP.map(r => ({ ...r, _flag: 'below' })),
    ...mspAnalysis.atMSP.map(r => ({ ...r, _flag: 'at' })),
    ...mspAnalysis.noMSP.map(r => ({ ...r, _flag: 'no' })),
  ];
  return allMSPRows.length > 0 ? (
    <div className="overflow-auto" style={{ maxHeight: '600px' }}>
      <table className="w-full text-left border-collapse min-w-max">
        <thead className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
          <tr>
            {["Unit No.", "Tower", "Unit Type", "Customer Name", "Agreement Value", "Rate/Sft (Actual)", "MSP Rate", "Variance", "Flag"].map(h => (
              <th key={h} className="p-3 font-black uppercase text-[10px] whitespace-nowrap text-gray-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allMSPRows.map((row, idx) => {
            const isBelow = row._flag === 'below';
            const isNo = row._flag === 'no';
            return (
              <tr key={idx} className={`border-b border-gray-100 transition-colors
                ${isBelow ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-gray-50'}`}>
                <td className="p-3 text-[13px] font-bold text-gray-700">{row["Unit No."]}</td>
                <td className="p-3 text-[13px] text-gray-700">{row["Tower"]}</td>
                <td className="p-3 text-[13px] text-gray-700">{row["Unit Type"]}</td>
                <td className="p-3 text-[13px] text-gray-700">{row["Customer Name"]}</td>
                <td className="p-3 text-[13px] text-gray-700">₹{formatValue(row["Agreement value"])}</td>
                <td className={`p-3 text-[13px] font-bold ${isBelow ? 'text-rose-500' : 'text-gray-700'}`}>
                  ₹{formatValue(row.ratePerSft)}
                </td>
                <td className="p-3 text-[13px] font-bold text-gray-700">
                  {isNo ? '-' : `₹${formatValue(row.msp)}`}
                </td>
                <td className={`p-3 text-[13px] font-black ${isBelow ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {isNo ? '-' : isBelow
                    ? `▼ ₹${formatValue(Math.abs(row.variance))}`
                    : `▲ ₹${formatValue(Math.abs(row.variance))}`}
                </td>
                <td className="p-3">
                  {isBelow ? (
                    <span className="text-[9px] font-black px-2 py-1 rounded border bg-red-100 text-red-600 border-red-300 uppercase">Below MSP</span>
                  ) : isNo ? (
                    <span className="text-[9px] font-black px-2 py-1 rounded border bg-gray-100 text-gray-500 border-gray-300 uppercase">No MSP</span>
                  ) : (
                    <span className="text-[9px] font-black px-2 py-1 rounded border bg-emerald-100 text-emerald-600 border-emerald-300 uppercase">At/Above MSP</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="p-6 text-center text-gray-400 font-bold text-sm">
      No new bookings found
    </div>
  );
})()}
            </div>
          )}
        </div>
      )}

      {/* Main Table + Tab Bar */}
      <div ref={analysisTablesRef}>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-gray-200 mb-4 pb-2 sticky top-0 bg-gray-50 z-40 pt-2">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => {
              setActiveTab(tab);
              setSelectedAgingFilter(null);
              setSelectedSaleFilter(null);
              setSelectedAgingBucket(null);
            }}
              className={`pb-2 text-sm font-bold transition-all relative ${activeTab === tab ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
              {tab}
              {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4 gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Search records..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition" />
          </div>
          <div className="relative" ref={columnFilterRef}>
            <button onClick={() => setShowColumnFilter(!showColumnFilter)}
              className={`flex items-center gap-2 border px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all shadow-sm
                ${showColumnFilter ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50'}`}>
              <Settings2 size={14} /> Columns
            </button>
            {showColumnFilter && (
              <div className="absolute right-0 top-full mt-2 w-72 max-h-[450px] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4">
                <div className="flex justify-between mb-3 pb-2 border-b border-gray-100">
                  <span className="text-[10px] font-black uppercase text-gray-400">Toggle Columns</span>
                  <button onClick={() => setShowColumnFilter(false)} className="text-gray-400"><X size={14} /></button>
                </div>
                {Object.keys(visibleColumns).map((col) => (
                  <label key={col} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${visibleColumns[col] ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
                      {visibleColumns[col] && <Check size={10} className="text-white" />}
                    </div>
                    <input type="checkbox" className="hidden" checked={visibleColumns[col]} onChange={() => setVisibleColumns(p => ({ ...p, [col]: !p[col] }))} />
                    <span className={`text-xs font-medium ${visibleColumns[col] ? 'text-gray-800' : 'text-gray-400'}`}>{col}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {activeTab === 'Debtors Aging' && (
          <div className="mb-6 p-6 rounded-2xl bg-white border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
              <PieChart className="text-blue-600" size={20} />
              <span className="text-sm font-black text-gray-800 uppercase tracking-wider">Debtors Aging Breakdown</span>
              <span className="ml-auto text-xl font-black text-rose-500">₹{formatValue(auditTotals.totalAgingAmt)}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { key: 'upto30', label: 'Upto 30 Days', amt: auditTotals.agingUpto30Amt, units: auditTotals.agingUpto30Units, cls: 'bg-gray-50 border-gray-200', tcls: 'text-emerald-600' },
                { key: 'aging3060', label: '30 - 60 Days', amt: auditTotals.aging3060Amt, units: auditTotals.aging3060Units, cls: 'bg-blue-50 border-blue-200', tcls: 'text-blue-600' },
                { key: 'aging6090', label: '60 - 90 Days', amt: auditTotals.aging6090Amt, units: auditTotals.aging6090Units, cls: 'bg-indigo-50 border-indigo-200', tcls: 'text-indigo-600' },
                { key: 'aging90180', label: '90 - 180 Days', amt: auditTotals.aging90180Amt, units: auditTotals.aging90180Units, cls: 'bg-orange-50 border-orange-200', tcls: 'text-orange-600' },
                { key: 'aging180365', label: '180 - 365 Days', amt: auditTotals.aging180365Amt, units: auditTotals.aging180365Units, cls: 'bg-amber-50 border-amber-200', tcls: 'text-amber-600' },
                { key: 'aging365plus', label: 'Greater than 365 Days', amt: auditTotals.aging365PlusAmt, units: auditTotals.aging365PlusUnits, cls: 'bg-rose-50 border-rose-200', tcls: 'text-rose-500' },
              ].map(({ key, label, amt, units, cls, tcls }) => (
                <div key={key} onClick={() => setSelectedAgingBucket(selectedAgingBucket === key ? null : key)}
                  className={`p-4 rounded-xl border cursor-pointer hover:shadow-md transition-all ${cls} ${selectedAgingBucket === key ? 'ring-2 ring-blue-300' : ''}`}>
                  <span className={`text-[9px] font-black uppercase block mb-2 ${tcls}`}>{label}</span>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-500">Units:</span><span className="font-bold">{units}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-500">Value:</span><span className={`font-black ${tcls}`}>₹{formatValue(amt)}</span>
                  </div>
                </div>
              ))}
            </div>
            {selectedAgingBucket && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-black text-gray-600 uppercase tracking-widest">
                    Showing: {selectedAgingBucket === 'upto30' ? 'Upto 30 Days' :
                    selectedAgingBucket === 'aging3060' ? '30 - 60 Days' :
                    selectedAgingBucket === 'aging6090' ? '60 - 90 Days' :
                    selectedAgingBucket === 'aging90180' ? '90 - 180 Days' :
                    selectedAgingBucket === 'aging180365' ? '180 - 365 Days' : 'Greater than 365 Days'}
                  </span>
                  <button onClick={() => setSelectedAgingBucket(null)} className="text-xs font-bold text-red-500 flex items-center gap-1">
                    <X size={12} /> Clear
                  </button>
                </div>
                <div className="overflow-auto bg-white border border-gray-200 rounded-xl shadow-sm" style={{ maxHeight: '400px' }}>
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
                      <tr>
                        {["Status", "Unit No.", "Tower", "Booking Date", "Disbursement", "Unit Type", "Customer Name",
                          "Saleable area in sft", "Agreement value", "Demand Raised as on Current Month excl. tax",
                          "Amount Received excl. Tax Current Month", "Outstanding against demand",
                          "30 - 60 days", "60 - 90 days", "90 - 180 days", "180 - 365 days", "Greater than 365 days", "Total aging"].map(h => (
                          <th key={h} className="p-3 font-black uppercase text-[10px] whitespace-nowrap text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {processedData.filter(row => {
                        if (selectedAgingBucket === 'upto30') return getNum(row["Upto 30 days"]) > 0;
                        if (selectedAgingBucket === 'aging3060') return getNum(row["30 - 60 days"]) > 0;
                        if (selectedAgingBucket === 'aging6090') return getNum(row["60 - 90 days"]) > 0;
                        if (selectedAgingBucket === 'aging90180') return getNum(row["90 - 180 days"]) > 0;
                        if (selectedAgingBucket === 'aging180365') return getNum(row["180 - 365 days"]) > 0;
                        if (selectedAgingBucket === 'aging365plus') return getNum(row["Greater than 365 days"]) > 0;
                        return false;
                      }).map((row, idx) => (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-blue-50/50">
                          <td className="p-3">
                            <span className={`text-[9px] font-black px-2 py-1 rounded border uppercase ${row.Status === 'EXISTING' ? 'text-gray-400 border-gray-200 bg-gray-50' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                              {row.Status === 'EXISTING' ? 'UNCHANGED' : 'MODIFIED'}
                            </span>
                          </td>
                          {["Unit No.", "Tower", "Booking Date", "Disbursement", "Unit Type", "Customer Name",
                            "Saleable area in sft", "Agreement value", "Demand Raised as on Current Month excl. tax",
                            "Amount Received excl. Tax Current Month", "Outstanding against demand",
                            "30 - 60 days", "60 - 90 days", "90 - 180 days", "180 - 365 days", "Greater than 365 days", "Total aging"].map(key => (
                            <td key={key} className="p-3 text-[13px] text-gray-700 whitespace-nowrap font-medium">
                              {key.toLowerCase().includes('value') || key.toLowerCase().includes('received') ||
                                key.toLowerCase().includes('amount') || key.toLowerCase().includes('demand') ||
                                key.toLowerCase().includes('outstanding') || key.toLowerCase().includes('days') ||
                                key.toLowerCase().includes('aging')
                                ? `₹${formatValue(row[key])}`
                                : formatMISDate(row[key], key) || row[key]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!['O/S against Demand Value', 'O/S against Sale Value', 'Inventory Summary', 'Planned vs Actual', 'Debtors Aging', 'MSP Analysis'].includes(activeTab) && (
          <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="sticky top-0 bg-gray-50 z-20 border-b border-gray-200">
                <tr>
                  <th className="p-4 font-black uppercase text-[10px] text-gray-500">Status</th>
                  {renderTableHeaders()}
                  {activeTab === 'New Bookings' && (
                    <th className="p-4 font-black uppercase text-[10px] whitespace-nowrap text-gray-500">Remarks & Attachments</th>
                  )}
                  {activeTab === 'Resale / Anomaly' && (
                    <th className="p-4 font-black uppercase text-[10px] whitespace-nowrap text-gray-500">Classification & Remarks</th>
                  )}
                </tr>
              </thead>
              <tbody>{renderTableRows()}</tbody>
            </table>
          </div>
        )}

        {activeTab === 'O/S against Demand Value' && selectedAgingFilter && (
          <div className="mt-4 border border-gray-200 rounded-xl bg-white shadow-sm overflow-auto" style={{ maxHeight: '500px' }}>
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
                <tr><th className="p-4 font-black uppercase text-[10px] text-gray-500">Status</th>{renderTableHeaders()}{activeTab === 'New Bookings' && (<th className="p-4 font-black uppercase text-[10px] whitespace-nowrap text-gray-500">Remarks & Attachments</th>)}{activeTab === 'Resale / Anomaly' && (<th className="p-4 font-black uppercase text-[10px] whitespace-nowrap text-gray-500">Classification & Remarks</th>)}</tr>
              </thead>
              <tbody>{renderTableRows()}</tbody>
            </table>
          </div>
        )}
        {activeTab === 'O/S against Sale Value' && selectedSaleFilter && (
          <div className="mt-4 border border-gray-200 rounded-xl bg-white shadow-sm overflow-auto" style={{ maxHeight: '500px' }}>
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
                <tr><th className="p-4 font-black uppercase text-[10px] text-gray-500">Status</th>{renderTableHeaders()}{activeTab === 'New Bookings' && (<th className="p-4 font-black uppercase text-[10px] whitespace-nowrap text-gray-500">Remarks & Attachments</th>)}{activeTab === 'Resale / Anomaly' && (<th className="p-4 font-black uppercase text-[10px] whitespace-nowrap text-gray-500">Classification & Remarks</th>)}</tr>
              </thead>
              <tbody>{renderTableRows()}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );

  return (
    <Layout title="MIS Analysis">
      {showInventoryModal && inventorySummaryComputed.length > 0 && renderInventorySummaryModal()}

      <button onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all">
        <ArrowRight size={14} className="rotate-180" /> Back
      </button>

      <div className="mb-6">
        <h3 className="text-gray-800 font-bold text-lg">MIS Analysis</h3>
        <p className="text-gray-400 text-sm mt-1">
          {isMaker ? "Upload and compare MIS sheets, then submit for review." :
           isReviewer ? "Review submitted MIS analysis and approve or reject." :
           "Review and give final approval to MIS submissions."}
        </p>
      </div>

      {/* ── MAKER VIEW ── */}
      {isMaker && (
        <>
          {/* Reference Sheets Status */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Reference Sheets Status</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl border ${inventoryData ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Building2 size={16} className={inventoryData ? 'text-green-600' : 'text-red-500'} />
                  <span className="text-sm font-black uppercase text-gray-700">Total Inventory Sheet</span>
                </div>
                {inventoryData ? (
                  <>
                    <p className="text-xs text-green-600 font-semibold">{inventoryData.fileName || 'Uploaded'}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Uploaded: {new Date(inventoryData.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {inventoryData.uploadedByEmail ? ` · By: ${inventoryData.uploadedByEmail.split('@')[0].split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}` : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-red-500 font-semibold mt-1">⚠ Manager needs to upload the Total Inventory Sheet</p>
                )}
              </div>
              <div className={`p-4 rounded-xl border ${businessPlanData ? 'bg-purple-50 border-purple-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={16} className={businessPlanData ? 'text-purple-600' : 'text-red-500'} />
                  <span className="text-sm font-black uppercase text-gray-700">Business Plan Sheet</span>
                </div>
                {businessPlanData ? (
                  <>
                    <p className="text-xs text-purple-600 font-semibold">{businessPlanData.fileName || 'Uploaded'}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Uploaded: {new Date(businessPlanData.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {businessPlanData.uploadedByEmail ? ` · By: ${businessPlanData.uploadedByEmail.split('@')[0].split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}` : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-red-500 font-semibold mt-1">⚠ Manager needs to upload the Business Plan Sheet</p>
                )}
              </div>
            </div>
          </div>

          {/* Month/Year Input */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mb-6">
            <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
              <FileText className="text-blue-600" size={16} />
              Enter Current Month &amp; Year
            </label>
            <input
              type="text"
              placeholder="e.g., OCT-2024, NOV-2024, DEC-2024"
              value={monthYear}
              onChange={(e) => setMonthYear(e.target.value.toUpperCase())}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Format: MMM-YYYY (e.g., OCT-2024) — used for Business Plan quarter matching</p>
            {currentSubmissionStatus && (
              <div className={`mt-3 px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 ${STATUS_CONFIG[currentSubmissionStatus]?.color}`}>
                <Lock size={12} /> {monthYear} Status: {STATUS_CONFIG[currentSubmissionStatus]?.label}
              </div>
            )}
          </div>

          {/* Submission Status Tracking Card — shown when submitted */}
          {(currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER' || currentSubmissionStatus === 'REJECTED_BY_MANAGER' || currentSubmissionStatus === 'REJECTED_BY_REVIEWER') && (
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Your MIS Submission — {monthYear}</p>
              <div
                onClick={() => setShowMakerDetails(prev => !prev)}
                className={`bg-white border rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-all ${currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER' || currentSubmissionStatus === 'REJECTED_BY_MANAGER' ? 'border-amber-300' : 'border-red-300'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-black text-gray-900 text-base">{monthYear}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Submitted by: {currentUser?.email} · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${STATUS_CONFIG[currentSubmissionStatus]?.color}`}>
                      {STATUS_CONFIG[currentSubmissionStatus]?.label}
                    </span>
                    <ArrowRight size={14} className={`text-gray-400 transition-transform ${showMakerDetails ? 'rotate-90' : ''}`} />
                  </div>
                </div>
                {currentSubmissionStatus === 'PENDING_REVIEW' && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs font-bold text-amber-700">⏳ Waiting for Reviewer to review your submission.</p>
                  </div>
                )}
                {currentSubmissionStatus === 'PENDING_MANAGER' && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-xs font-bold text-blue-700">⏳ Reviewer approved. Waiting for Manager final approval.</p>
                  </div>
                )}
                {currentSubmissionStatus === 'REJECTED_BY_REVIEWER' && (
  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
    <p className="text-xs font-bold text-red-600">❌ Submission rejected. Please re-upload and resubmit.</p>
  </div>
)}
{currentSubmissionStatus === 'REJECTED_BY_MANAGER' && (
  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
    <p className="text-xs font-bold text-red-600">⏳ Manager rejected — waiting for Reviewer to review and send back to you.</p>
  </div>
)}

{makerSubmissionDoc?.commentHistory?.length > 0 && (
  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
    {[...makerSubmissionDoc.commentHistory]
      .sort((a, b) => new Date(a.at) - new Date(b.at))
      .map((h, i) => {
        const roleColor = h.role === 'MAKER' ? 'text-blue-600' : h.role === 'REVIEWER' ? 'text-purple-600' : 'text-emerald-600';
        const icon = h.action === 'REJECTED' ? '❌' : h.action === 'APPROVED' ? '✅' : '💬';
        return h.comment ? (
          <p key={i} className={`text-xs italic ${roleColor}`}>
            {icon} {h.role.charAt(0) + h.role.slice(1).toLowerCase()}: "{h.comment}"
          </p>
        ) : null;
      })}
  </div>
)}
              </div>
            </div>
          )}

          {/* Auto-loaded month banner */}
          <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-sm mb-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0">
              <FileSpreadsheet size={22} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">Sanity-Approved Month Ready For Analysis</p>
              <p className="text-lg font-black text-gray-900">
                {cycleStateData?.cycleMonth || "No approved month found"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Files are auto-loaded from the approved Sanity Check submission — no upload needed.
              </p>
            </div>
            {cycleStateData?.cycleMonth && currentSubmissionStatus !== 'APPROVED' && (
              <button
                type="button"
                onClick={() => navigate("/mis-sanity")}
                className="shrink-0 flex items-center gap-2 text-xs font-bold text-blue-600 underline hover:text-blue-700">
                <Upload size={13} />
                Need changes? Re-upload MIS
              </button>
            )}
          </div>

          {currentSubmissionStatus === 'APPROVED' && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3">
              <Lock size={16} className="text-green-600" />
              <div>
                <p className="text-green-700 font-bold text-sm">{monthYear} is Approved & Frozen</p>
                <p className="text-green-500 text-xs mt-0.5">To submit next month, change the Month & Year above and upload the new current month MIS.</p>
              </div>
            </div>
          )}


          
          <div className="flex justify-center mb-8">
            <button onClick={autoRunAnalysis} disabled={!cycleStateData?.cycleMonth || isProcessing || currentSubmissionStatus === 'APPROVED'}
  className={`flex items-center gap-3 px-10 py-3.5 rounded-xl font-bold text-sm transition-all
    ${cycleStateData?.cycleMonth && !isProcessing && currentSubmissionStatus !== 'APPROVED'
      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 hover:scale-105 active:scale-95"
      : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {isProcessing ? `Analyzing ${cycleStateData?.cycleMonth || ""}...` : `Analyze ${cycleStateData?.cycleMonth || ""}`}
              <ArrowRight size={18} />
            </button>
          </div>

          {/* All Your MIS Submissions — click any month to view it */}
          {allSubmissions.length > 0 && (
            <div className="mb-8">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">All MIS Submissions</p>
              <div className="space-y-3">
                {allSubmissions.map((sub, idx) => (
                  <div key={idx}
                    onClick={() => {
                      setMonthYear(sub.monthYear || '');
                      setShowMakerDetails(true);
                    }}
                    className={`bg-white border rounded-2xl p-5 cursor-pointer hover:border-blue-300 transition-all shadow-sm
                      ${monthYear === sub.monthYear ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-gray-900 text-base">{sub.monthYear}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Submitted: {new Date(sub.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${STATUS_CONFIG[sub.status]?.color}`}>
                          {STATUS_CONFIG[sub.status]?.label}
                        </span>
                        {monthYear === sub.monthYear && (
                          <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">Viewing</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasData && (
            <>
              {currentSubmissionStatus !== 'APPROVED' && (currentSubmissionStatus === null || currentSubmissionStatus === undefined || showMakerDetails) && (
                <div className="bg-white border border-blue-200 rounded-2xl p-5 shadow-sm mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Send size={16} className="text-blue-600" />
                    <p className="text-sm font-black uppercase text-blue-600">Submit for Review</p>
                    {currentSubmissionStatus && (
                      <span className={`ml-auto text-xs font-black px-3 py-1 rounded-full border ${STATUS_CONFIG[currentSubmissionStatus]?.color}`}>
                        {STATUS_CONFIG[currentSubmissionStatus]?.label}
                      </span>
                    )}
                  </div>

                  {/* Rejection comment display + redo-sanity option */}
                  {(currentSubmissionStatus === 'REJECTED_BY_REVIEWER' || currentSubmissionStatus === 'REJECTED_BY_MANAGER') && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-xs font-bold text-red-600 mb-1">
                        Rejected by {currentSubmissionStatus === 'REJECTED_BY_MANAGER' ? 'Manager' : 'Reviewer'}:
                      </p>
                      <p className="text-xs text-red-500 italic">
                        {misRejectionInfo?.rejectionComment || "No reason provided."}
                      </p>
                      <p className="text-xs text-gray-500 mt-2 mb-3">
                        Add a remark below and resubmit this analysis as-is, or if the underlying MIS data
                        itself needs correction, revise it in Sanity Check first.
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate("/mis-sanity")}
                        className="w-full flex items-center justify-center gap-2 bg-white border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-600 font-bold text-sm px-4 py-3 rounded-xl transition-all group">
                        <Upload size={15} className="group-hover:-translate-y-0.5 transition-transform" />
                        Click to Upload Revised MIS
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}

                  {cycleStateData?.sanityCheckPassed === false && (
                    <p className="text-xs font-bold text-rose-600 mb-2">
                      ⚠ Sanity Check failed this month — a remark or attachment is required before you can submit.
                    </p>
                  )}
                  <textarea
                    defaultValue=""
                    onChange={e => { makerCommentRef.current = e.target.value; }}
                    placeholder={cycleStateData?.sanityCheckPassed === false
                      ? "Required: explain the Sanity Check failure, or reference your attachment..."
                      : "Add a comment for the Reviewer (optional)..."}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-blue-400 resize-none mb-3"
                    rows={2}
                    disabled={currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER' || currentSubmissionStatus === 'REJECTED_BY_MANAGER'}
                  />
                  <button
                    onClick={handleSubmitForReview}
                    disabled={!monthYear || actionLoading || currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER' || currentSubmissionStatus === 'REJECTED_BY_MANAGER'}
                    className={`w-full font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm
                      ${(!monthYear || actionLoading || currentSubmissionStatus === 'PENDING_REVIEW' || currentSubmissionStatus === 'PENDING_MANAGER' || currentSubmissionStatus === 'REJECTED_BY_MANAGER')
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                    {actionLoading ? 'Submitting...' :
                     currentSubmissionStatus === 'PENDING_REVIEW' ? '⏳ Awaiting Review' :
                     currentSubmissionStatus === 'PENDING_MANAGER' ? '⏳ Awaiting Manager' :
                     <><Send size={14} /> Submit for Review</>}
                  </button>
                </div>
              )}

              {(currentSubmissionStatus === null || currentSubmissionStatus === undefined || showMakerDetails) && renderAnalysis()}
            </>
          )}
        </>
      )}

      {/* ── REVIEWER / MANAGER VIEW ── */}
      {(isReviewer || isManager) && (
        <>
          {/* Submissions List */}
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">
              {isReviewer ? 'MIS Submissions — Pending Review' : 'MIS Submissions — Pending Approval'}
            </p>
            {submissionsLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                <p className="text-gray-400 text-sm">Loading submissions...</p>
              </div>
            ) : allSubmissions.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <FileSpreadsheet size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-semibold">No submissions yet</p>
                <p className="text-gray-400 text-sm mt-1">Waiting for Maker to submit MIS analysis.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allSubmissions.map((sub, idx) => (
                  <div key={idx}
                    onClick={() => {
                      setSelectedSubmission(sub);
                      setExtractedData(sub.extractedData || []);
                      setUnitStats(sub.unitStats || { total: 0, sold: 0, unsold: 0 });
                      setMonthYear(sub.monthYear || '');
                      if (sub.extractedData?.length > 0) {
                        const cols = {};
                        const skip = ['Status', 'DEMAND_INCREMENT_VAL', 'RECEIVED_INCREMENT_VAL', 'AGREEMENT_INCREMENT_VAL',
                          'prev_agreement', 'agreement_delta', 'prev_amount_received', 'amount_received_delta',
                          'prev_demand', 'demand_delta', 'prev_saleable', 'saleable_delta', 'prev_carpet', 'carpet_delta', 'REFERENCE_MSP',
                          'Amount Received excl. Tax'];
                        const allSubKeys = new Set();
                        sub.extractedData.forEach(row => Object.keys(row).forEach(k => allSubKeys.add(k)));
                        allSubKeys.forEach(k => { if (!skip.includes(k)) cols[k] = true; });
                        setVisibleColumns(cols);
                      }
                    }}
                    className={`bg-white border rounded-2xl p-5 cursor-pointer hover:border-blue-300 transition-all shadow-sm
                      ${selectedSubmission?.monthYear === sub.monthYear ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-gray-900 text-base">{sub.monthYear}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Submitted by: {sub.submittedBy} · {new Date(sub.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        {sub.commentHistory?.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {[...sub.commentHistory]
                              .sort((a, b) => new Date(a.at) - new Date(b.at))
                              .map((h, i) => {
                                const roleColor = h.role === 'MAKER' ? 'text-blue-600' : h.role === 'REVIEWER' ? 'text-purple-600' : 'text-emerald-600';
                                const icon = h.action === 'REJECTED' ? '❌' : h.action === 'APPROVED' ? '✅' : '💬';
                                return h.comment ? (
                                  <p key={i} className={`text-xs italic ${roleColor}`}>
                                    {icon} {h.role.charAt(0) + h.role.slice(1).toLowerCase()}: "{h.comment}"
                                  </p>
                                ) : null;
                              })}
                          </div>
                        ) : (
                          <>
                            {sub.makerComment && (
                              <p className="text-xs text-blue-600 mt-1 italic">💬 "{sub.makerComment}"</p>
                            )}
                            {sub.reviewerComment && (
                              <p className="text-xs text-purple-600 mt-1 italic">👁 Reviewer: "{sub.reviewerComment}"</p>
                            )}
                            {sub.rejectionComment && (
                              <p className="text-xs text-red-500 mt-1 italic">❌ Rejected: "{sub.rejectionComment}"</p>
                            )}
                          </>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] font-black text-gray-400 uppercase">Sanity Check:</span>
                          {sub.sanityCheckPassed === true
                            ? <span className="text-[10px] font-black px-2 py-1 rounded bg-emerald-100 text-emerald-700 border border-emerald-300">✓ Passed</span>
                            : sub.sanityCheckPassed === false
                            ? <span className="text-[10px] font-black px-2 py-1 rounded bg-red-100 text-red-700 border border-red-300">⚠ Failed</span>
                            : <span className="text-[10px] font-black px-2 py-1 rounded bg-gray-100 text-gray-500 border border-gray-300">Not Run</span>
                          }
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${STATUS_CONFIG[sub.status]?.color}`}>
                          {STATUS_CONFIG[sub.status]?.label}
                        </span>
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

          {/* Action Bar — shown when a submission is selected */}
          {selectedSubmission && (
            <>
              {/* Approve/Reject for correct role and status */}
              {((isReviewer && (selectedSubmission.status === 'PENDING_REVIEW' || selectedSubmission.status === 'REJECTED_BY_MANAGER')) ||
  (isManager && (selectedSubmission.status === 'PENDING_MANAGER' || selectedSubmission.status === 'PENDING_REVIEW'))) && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
                  <p className="text-sm font-black uppercase text-gray-400 mb-3">
                    {isReviewer ? '👁 Reviewer Action' : '✅ Manager Final Action'} — {selectedSubmission.monthYear}
                  </p>
                  {isManager && selectedSubmission.status === 'PENDING_REVIEW' && hasDistinctReviewer && (
  <p className="text-xs text-amber-600 font-semibold mb-3">
    ⚠ Reviewer hasn't reviewed this yet. Approving here will act on the Reviewer's behalf and finalize it in one step.
  </p>
)}
                  {isReviewer && selectedSubmission.status === 'REJECTED_BY_MANAGER' && (
  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl">
    <p className="text-xs font-bold text-red-600">❌ Manager rejected this submission.</p>
    {selectedSubmission.rejectionComment && (
      <p className="text-xs text-red-500 mt-1 italic">💬 Manager's reason: "{selectedSubmission.rejectionComment}"</p>
    )}
    <p className="text-xs text-amber-600 mt-2 font-semibold">You can re-send to Manager with your comment, or reject back to Maker.</p>
  </div>
)}
                  <textarea
                    defaultValue=""
                    onChange={e => { isReviewer ? reviewerCommentRef.current = e.target.value : managerCommentRef.current = e.target.value; }}
                    placeholder="Add your comment (optional)..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-blue-400 resize-none mb-3"
                    rows={2}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() =>
                        isReviewer ? handleReviewerAction(true)
                        : selectedSubmission.status === 'PENDING_REVIEW' ? handleManagerBypassApprove()
                        : handleManagerAction(true)
                      }
                      disabled={actionLoading}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
                      <ThumbsUp size={15} />
{isReviewer
  ? selectedSubmission.status === 'REJECTED_BY_MANAGER'
    ? 'Re-send to Manager'
    : 'Approve → Send to Manager'
  : selectedSubmission.status === 'PENDING_REVIEW'
    ? 'Approve Directly (Reviewer Unavailable)'
    : 'Final Approve & Freeze Month'}
                    </button>
                    <button
                      onClick={() =>
                        isReviewer ? handleReviewerAction(false)
                        : selectedSubmission.status === 'PENDING_REVIEW' ? handleReviewerAction(false)
                        : handleManagerAction(false)
                      }
                      disabled={actionLoading}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
                      <ThumbsDown size={15} />
                      {isReviewer || selectedSubmission.status === 'PENDING_REVIEW' ? 'Reject → Back to Maker' : 'Reject → Back to Reviewer'}
                    </button>
                  </div>
                </div>
              )}

              {/* Read-only badge for already actioned submissions */}
              {selectedSubmission.status === 'APPROVED' && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
                  <Lock size={16} className="text-green-600" />
                  <div>
                    <p className="text-green-700 font-bold text-sm">This month is Approved & Frozen</p>
                    <p className="text-green-500 text-xs">Approved by {selectedSubmission.approvedBy} on {new Date(selectedSubmission.approvedAt).toLocaleDateString('en-GB')}</p>
                  </div>
                </div>
              )}

              {/* Show the full analysis read-only */}
              {extractedData.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs text-amber-700 font-bold flex items-center gap-2">
                    <Info size={14} /> Read-only view — {selectedSubmission.monthYear} submitted by {selectedSubmission.submittedBy}
                  </p>
                </div>
              )}

              {/* Source files — maker's uploaded MIS + reference sheets, downloadable by Reviewer/Manager */}
{extractedData.length > 0 && (
  <div className="mb-6 p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">
    <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Source Files</p>
    <div className="flex flex-wrap gap-3">
      {selectedSubmission.currFileURL ? (
        <a
          href={selectedSubmission.currFileURL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl px-4 py-2.5 text-xs font-bold text-blue-700 transition">
          <Download size={14} /> {selectedSubmission.monthYear} MIS (uploaded by Maker)
        </a>
      ) : (
        <span className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-400">
          <FileText size={14} /> Maker's MIS file not found
        </span>
      )}

      {inventoryData?.downloadURL ? (
        <a
          href={inventoryData.downloadURL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl px-4 py-2.5 text-xs font-bold text-emerald-700 transition">
          <Download size={14} /> Total Inventory Sheet
        </a>
      ) : null}

      {businessPlanData?.downloadURL ? (
        <a
          href={businessPlanData.downloadURL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-xl px-4 py-2.5 text-xs font-bold text-purple-700 transition">
          <Download size={14} /> Business Plan Sheet
        </a>
      ) : null}
    </div>
  </div>
)}

              {extractedData.length > 0 && renderAnalysis()}
            </>
          )}
        </>
      )}
    </Layout>
  );
}
