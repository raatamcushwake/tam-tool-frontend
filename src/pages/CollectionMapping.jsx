import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import Layout from "../components/common/Layout";
import { FileText, Upload, X, CheckCircle, AlertCircle, RefreshCw, Map as MapIcon } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../services/escrow";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx-js-style";

const EXPECTED_EXCEL_HEADERS = ["date", "narration", "chq./ref.no.", "value dt", "withdrawal amt.", "deposit amt.", "closing balance"];

// Converts an Excel date serial number (e.g. 45535) into a real JS Date.
const excelSerialToDate = (serial) => {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
};

// Handles Date objects, Excel serial numbers, and "dd/mm/yyyy[ HH:MM:SS]" strings.
const parseDateValue = (raw) => {
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") return excelSerialToDate(raw);
  const str = String(raw || "").trim();
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, d, m, y] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return null;
};

const formatDateDisplay = (raw) => {
  const d = parseDateValue(raw);
  if (!d) return String(raw || "");
  return d.toLocaleDateString("en-GB"); // dd/mm/yyyy
};

const getMonthKey = (raw) => {
  const d = parseDateValue(raw);
  if (!d) return "UNKNOWN";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const MONTH_ABBR_TO_NUM = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

// Converts an MIS month label like "OCT-2025" into the same "YYYY-MM"
// format used by getMonthKey, so bank transactions can be filtered to
// only the selected month.
const misMonthToMonthKey = (misMonth) => {
  if (!misMonth) return null;
  const match = misMonth.trim().toUpperCase().match(/^([A-Z]{3})-(\d{4})$/);
  if (!match) return null;
  const [, abbr, year] = match;
  const num = MONTH_ABBR_TO_NUM[abbr];
  return num ? `${year}-${num}` : null;
};

// Extracts a month/year from a MIS filename like "KVD_MAY'26" or
// "KVD_Apr'26 1" and converts it to the same "YYYY-MM" format used to
// filter bank statement transactions.
const filenameToMonthKey = (filename) => {
  if (!filename) return null;
  const match = filename.toUpperCase().match(/([A-Z]{3})'?(\d{2})/);
  if (!match) return null;
  const [, abbr, yy] = match;
  const num = MONTH_ABBR_TO_NUM[abbr];
  if (!num) return null;
  const year = `20${yy}`;
  return `${year}-${num}`;
};

const parseBankStatement = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const transactions = [];

        // Only process the "100% Account" worksheet — other tabs (70% Account,
        // Old Petty Cash Account, etc.) are different accounts entirely and
        // must not be included in collection matching.
        const targetSheetNames = wb.SheetNames.filter((name) =>
          name.toLowerCase().includes("100%")
        );

        if (targetSheetNames.length === 0) {
          resolve([]);
          return;
        }

        for (const sheetName of targetSheetNames) {
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });

          let colMap = null; // reset whenever a new header row is found further down

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(c => !c)) continue;

            const rowLower = row.map(c => String(c || "").toLowerCase().trim());

            // Detect a (new) header row anywhere in the sheet — statements
            // stacked one after another can each have their own header
            // with a slightly different column layout.
            if (rowLower.includes("date") && rowLower.includes("narration")) {
              colMap = {};
              rowLower.forEach((col, idx) => { colMap[col] = idx; });
              continue; // header row itself is never a data row
            }

            if (!colMap) continue; // no header found yet for this block

            const rawDate = row[colMap["date"]];
            const rawValueDate = row[colMap["value dt"]];
            const narration = String(row[colMap["narration"]] || "").trim();
            const referenceNo = String(row[colMap["chq./ref.no."]] || "").trim();
            const depositRaw = row[colMap["deposit amt."]];
            const debitCreditRaw = colMap["debit/credit"] !== undefined ? String(row[colMap["debit/credit"]] || "").trim().toUpperCase() : "";

            if (!narration || !rawDate) continue;
            if (narration.toLowerCase().includes("opening balance")) continue;

            // If a Debit/Credit column exists and explicitly says Debit, skip —
            // extra safety on top of the deposit-amount check below.
            if (debitCreditRaw === "D") continue;

            const deposit = parseFloat(String(depositRaw || "").replace(/,/g, "")) || 0;
            if (deposit <= 0) continue; // only collections/credits matter here

            transactions.push({
              date: formatDateDisplay(rawDate),
              valueDate: formatDateDisplay(rawValueDate),
              narration,
              referenceNo,
              depositAmount: deposit,
              monthKey: getMonthKey(rawDate),
            });
          }
        }
        resolve(transactions);
      } catch (err) {
        resolve([]);
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

// Normalizes a header cell for loose matching: lowercase, strip all
// non-alphanumeric characters. So "Unit No." -> "unitno", "Amount
// Received excl. Tax Current Month" -> "amountreceivedexcltaxcurrentmonth",
// regardless of casing/punctuation differences between files.
const normalizeHeader = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Normalizes a unit number for matching between the two MIS files,
// handling '/' vs '-' the same way the rest of the system does.
const normalizeUnitKey = (unit) => String(unit || "").trim().toUpperCase().replace(/[/\-]/g, "_");

// Parses a manually-uploaded MIS Excel file. Uses ONLY Row 1 as the
// header (finds Unit No., Customer Name, Amount Received excl. Tax
// Current Month columns) — Row 2 is a sub-header and is skipped
// entirely. Actual data starts from Row 3.
const parseMisExcelFile = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });

        if (rows.length < 3) {
          resolve({ error: "File doesn't have enough rows.", rows: [] });
          return;
        }

        const normalizedHeaders = rows[0].map((c) => normalizeHeader(c));

        const unitNoIdx = normalizedHeaders.findIndex((h) => h === "unitno" || h === "unitno.");
        const customerNameIdx = normalizedHeaders.findIndex((h) => h === "customername");
        const amountIdx = normalizedHeaders.findIndex((h) => h.includes("amountreceivedexcltaxcurrentmonth"));

        if (unitNoIdx === -1 || customerNameIdx === -1 || amountIdx === -1) {
          resolve({ error: "Could not find Unit No., Customer Name, or Amount Received excl. Tax Current Month column in Row 1.", rows: [] });
          return;
        }

        const units = [];
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every((c) => c === "" || c === null || c === undefined)) continue;

          const unitNo = String(row[unitNoIdx] || "").trim();
          if (!unitNo) continue;

          const customerName = String(row[customerNameIdx] || "").trim();
          const amount = parseFloat(String(row[amountIdx] || "").replace(/,/g, "")) || 0;

          units.push({ unitNo, customerName, amount });
        }

        resolve({ error: null, rows: units });
      } catch (err) {
        resolve({ error: err.message, rows: [] });
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

// Compares Previous Month MIS vs Current Month MIS, computes the
// increment per unit (Current - Previous, treating a unit missing from
// the Previous file as 0), and keeps only units with a positive
// increment — mirroring exactly how Firebase mode filters out 0-value units.
const computeManualUnits = async (previousFile, currentFile) => {
  const [prevResult, currResult] = await Promise.all([
    parseMisExcelFile(previousFile),
    parseMisExcelFile(currentFile),
  ]);

  if (prevResult.error) return { error: `Previous Month MIS: ${prevResult.error}` };
  if (currResult.error) return { error: `Current Month MIS: ${currResult.error}` };

  const prevMap = {};
  prevResult.rows.forEach((r) => { prevMap[normalizeUnitKey(r.unitNo)] = r.amount; });

  const manualUnits = [];
  currResult.rows.forEach((r) => {
    const key = normalizeUnitKey(r.unitNo);
    const previousAmount = prevMap[key] || 0;
    const increment = r.amount - previousAmount;
    if (increment > 0) {
      manualUnits.push({ unitNo: r.unitNo, customerName: r.customerName, receivedIncrementVal: increment });
    }
  });

  return { error: null, manualUnits };
};

function UploadBox({ title, subtitle, file, onFileSelect, onRemove, accept = ".xlsx,.xls" }) {
  const inputRef = useRef(null);

  return (
    <div
      className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onFileSelect(e.dataTransfer.files[0]); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFileSelect(e.target.files[0])}
      />
      <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-3">
        <FileText size={22} className="text-blue-600" />
      </div>
      <p className="text-gray-700 font-semibold text-sm">{title}</p>
      <p className="text-gray-400 text-xs mt-1">{subtitle}</p>

      {!file ? (
        <div className="mt-3 flex items-center gap-2 bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-lg">
          <Upload size={13} /> Browse File
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2 p-2.5 bg-blue-50 rounded-xl border border-blue-100 w-full max-w-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText size={14} className="text-blue-600 flex-shrink-0" />
            <p className="text-blue-700 text-xs font-semibold truncate">{file.name}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-5 h-5 bg-red-100 hover:bg-red-200 rounded-full flex items-center justify-center flex-shrink-0"
          >
            <X size={11} className="text-red-500" />
          </button>
        </div>
      )}
      {!file && <p className="text-gray-300 text-xs mt-2">or drag & drop · .xlsx / .xls only</p>}
    </div>
  );
}

export default function CollectionMapping() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { selectedProject } = useProject();
  const projectId = selectedProject?.projectId;

  const [bankStatementFile, setBankStatementFile] = useState(null);
  const [misMode, setMisMode] = useState("firebase"); // "firebase" | "manual"

  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loadingMonths, setLoadingMonths] = useState(false);

  const [previousMisFile, setPreviousMisFile] = useState(null);
  const [currentMisFile, setCurrentMisFile] = useState(null);

  const [status, setStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);

  // Fetch available MIS months from Firebase for this project
  useEffect(() => {
    const fetchMonths = async () => {
      if (!projectId) return;
      setLoadingMonths(true);
      try {
        const snap = await getDocs(collection(db, "projects", projectId, "misSubmissions"));
        const months = snap.docs.map((d) => d.id);
        setAvailableMonths(months);
        if (months.length > 0) setSelectedMonth(months[0]);
      } catch (err) {
        console.error("Could not fetch MIS months:", err);
      }
      setLoadingMonths(false);
    };
    fetchMonths();
  }, [projectId]);

  const handleBankStatementSelect = (file) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setStatus({ type: "error", message: "Bank statement must be an Excel file (.xlsx or .xls)." });
      return;
    }
    setBankStatementFile(file);
    setStatus(null);
  };

  const isReadyToProceed =
    !!bankStatementFile &&
    (misMode === "firebase" ? !!selectedMonth : !!previousMisFile && !!currentMisFile);

  const handleProceed = async () => {
    if (!isReadyToProceed) return;
    setUploading(true);
    setStatus(null);

    try {
      const allTransactions = await parseBankStatement(bankStatementFile);

      let manualUnits = null;
      let monthLabel = selectedMonth;
      let manualMonthKey = null;

      if (misMode === "manual") {
        const result = await computeManualUnits(previousMisFile, currentMisFile);
        if (result.error) {
          setStatus({ type: "error", message: result.error });
          setUploading(false);
          return;
        }
        if (result.manualUnits.length === 0) {
          setStatus({ type: "error", message: "No units with a positive increment found between the two MIS files." });
          setUploading(false);
          return;
        }
        manualUnits = result.manualUnits;
        monthLabel = currentMisFile.name.replace(/\.(xlsx|xls)$/i, "");
        manualMonthKey = filenameToMonthKey(currentMisFile.name);

        if (!manualMonthKey) {
          setStatus({
            type: "error",
            message: "Could not detect the month/year from the Current Month MIS filename (expected something like 'MAY'26'). Please rename the file to include the month and year.",
          });
          setUploading(false);
          return;
        }
      }

      const targetMonthKey = misMode === "firebase" ? misMonthToMonthKey(selectedMonth) : manualMonthKey;
      const transactions = targetMonthKey
        ? allTransactions.filter((t) => t.monthKey === targetMonthKey)
        : allTransactions;

      if (transactions.length === 0) {
        setStatus({
          type: "error",
          message: targetMonthKey
            ? `No credit transactions found in the bank statement for ${selectedMonth}.`
            : "No valid credit transactions found in the bank statement.",
        });
        setUploading(false);
        return;
      }

      const response = await fetch("http://127.0.0.1:8000/api/collection-mapping/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          month: monthLabel,
          transactions,
          manualUnits,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus({ type: "error", message: data.detail || "Comparison failed." });
        setUploading(false);
        return;
      }

      setComparisonResult(data);
      navigate("/collection-mapping/results", { state: { result: data } });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
    setUploading(false);
  };

  return (
    <Layout title="Collection Mapping">
      <div className="flex justify-center">
        <div className="bg-white border border-gray-200 rounded-2xl p-10 shadow-sm w-full max-w-4xl">

          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <MapIcon size={20} className="text-blue-600" />
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-sm">Collection Mapping</h4>
              <p className="text-gray-400 text-xs">Upload bank statement and select MIS source to begin comparison</p>
            </div>
          </div>

          {/* Bank Statement Upload */}
          <p className="text-gray-600 text-xs font-bold uppercase mb-2">Step 1 — Bank Statement (Required)</p>
          <UploadBox
            title="Upload Bank Statement"
            subtitle="Excel file for the period you want to reconcile"
            file={bankStatementFile}
            onFileSelect={handleBankStatementSelect}
            onRemove={() => setBankStatementFile(null)}
          />

          {/* MIS Source Tabs */}
          <p className="text-gray-600 text-xs font-bold uppercase mt-8 mb-2">Step 2 — MIS Source</p>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMisMode("firebase")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all
                ${misMode === "firebase" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}
            >
              Fetch from Firebase
            </button>
            <button
              onClick={() => setMisMode("manual")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all
                ${misMode === "manual" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}
            >
              Upload Manually
            </button>
          </div>

          {misMode === "firebase" ? (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
              {loadingMonths ? (
                <p className="text-gray-400 text-xs flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin" /> Loading available months...
                </p>
              ) : availableMonths.length === 0 ? (
                <p className="text-gray-400 text-xs">No MIS submissions found in Firebase for this project.</p>
              ) : (
                <>
                  <label className="text-gray-600 text-xs font-semibold block mb-2">Select MIS Month</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                  >
                    {availableMonths.map((month) => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UploadBox
                title="Previous Month MIS"
                subtitle="Excel file for the previous month"
                file={previousMisFile}
                onFileSelect={(f) => setPreviousMisFile(f)}
                onRemove={() => setPreviousMisFile(null)}
              />
              <UploadBox
                title="Current Month MIS"
                subtitle="Excel file for the current month"
                file={currentMisFile}
                onFileSelect={(f) => setCurrentMisFile(f)}
                onRemove={() => setCurrentMisFile(null)}
              />
            </div>
          )}

          {status && (
            <div className={`mt-6 p-3 rounded-xl text-xs font-medium flex items-center gap-2
              ${status.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {status.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {status.message}
            </div>
          )}

          <button
            onClick={handleProceed}
            disabled={!isReadyToProceed || uploading}
            className={`mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
              ${isReadyToProceed && !uploading ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
          >
            {uploading ? <><RefreshCw size={14} className="animate-spin" /> Uploading...</> : <><Upload size={14} /> Proceed to Comparison</>}
          </button>

        </div>
      </div>
    </Layout>
  );
}