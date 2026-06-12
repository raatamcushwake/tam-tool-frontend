import { useState, useRef, useEffect } from "react";
import { useProject } from "../context/ProjectContext";
import Layout from "../components/common/Layout";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, CheckCircle, X, Download,
  Building2, TrendingUp, AlertCircle, RefreshCw, BadgePercent
} from "lucide-react";
import {
  uploadInventoryData,
  uploadBusinessPlanData,
  uploadMSPData,
  getInventoryData,
  getBusinessPlanData,
  getMSPData,
} from "../services/referenceService";
import {
  uploadCostBPFile,
  getCostBPMetadata,
} from "../services/CostAnalysisService";

function FileUploadBox({ label, subtitle, file, onFileSelect, onClear, accent = "blue" }) {
  const inputRef = useRef(null);
  const c = accent === "blue"
    ? { hover: "hover:border-blue-400 hover:bg-blue-50", btn: "bg-blue-600", icon: "bg-blue-100 text-blue-600" }
    : accent === "emerald"
    ? { hover: "hover:border-emerald-400 hover:bg-emerald-50", btn: "bg-emerald-600", icon: "bg-emerald-100 text-emerald-600" }
    : { hover: "hover:border-orange-400 hover:bg-orange-50", btn: "bg-orange-600", icon: "bg-orange-100 text-orange-600" };
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

export default function ReferenceUpload() {
  const { selectedProject } = useProject();
  const projectId = selectedProject?.projectId;

  const [inventoryFile, setInventoryFile] = useState(null);
  const [businessPlanFile, setBusinessPlanFile] = useState(null);
  const [mspFile, setMspFile] = useState(null);

  const [uploadingInventory, setUploadingInventory] = useState(false);
  const [uploadingPlan, setUploadingPlan] = useState(false);
  const [uploadingMsp, setUploadingMsp] = useState(false);

  const [inventoryStatus, setInventoryStatus] = useState(null);
  const [planStatus, setPlanStatus] = useState(null);
  const [mspStatus, setMspStatus] = useState(null);

  const [existingInventory, setExistingInventory] = useState(null);
  const [existingPlan, setExistingPlan] = useState(null);
  const [existingMsp, setExistingMsp] = useState(null);
  const [costBpFile, setCostBpFile] = useState(null);
  const [uploadingCostBp, setUploadingCostBp] = useState(false);
  const [costBpStatus, setCostBpStatus] = useState(null);
  const [existingCostBp, setExistingCostBp] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    getInventoryData(projectId).then(setExistingInventory);
    getBusinessPlanData(projectId).then(setExistingPlan);
    getMSPData(projectId).then(setExistingMsp);
    getCostBPMetadata(projectId).then(setExistingCostBp);
  }, [projectId]);

  // ── Parse Inventory Sheet ─────────────────────────────────
  const parseInventorySheet = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          const parseNum = (val) => {
            if (val === null || val === undefined || val === "") return 0;
            if (typeof val === "number") return val;
            return Number(String(val).replace(/,/g, "")) || 0;
          };
          const rows = [];
          for (let i = 3; i < raw.length; i++) {
            const row = raw[i];
            if (!row[1] && !row[2]) continue;
            const phase = String(row[0] || "").trim();
            const tower = String(row[1] || "").trim();
            const unitType = String(row[2] || "").trim();
            const totalUnits = parseNum(row[3]);
            const saleableArea = parseNum(row[4]);
            if (!tower && !unitType) continue;
            rows.push({ phase, tower, unitType, totalUnits, saleableArea });
          }
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  // ── Parse Business Plan Sheet ─────────────────────────────
  const parseBusinessPlanSheet = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const sheetName = wb.SheetNames.find(n =>
          n.toLowerCase().includes("business") || n.toLowerCase().includes("plan")
        ) || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        // ── Step 1: Find key rows BY NAME (fully dynamic, no hardcoded row numbers) ──
        let fyRowIdx = -1;        // Row with "Financial Year"
        let periodRowIdx = -1;    // Row with "Jan-Mar 2024", "Apr-Jun 2025" etc.
        let quarterRowIdx = -1;   // Row with "Q1", "Q2", "Q3", "Q4"
        let areaRowIdx = -1;      // Row with "Area to be Sold"
        let collectionsRowIdx = -1; // Row with "New sales collections"
        let saleProceedsRowIdx = -1; // Row with "Total Revenue"
        let rateRowIdx = -1;      // Row with "Rate (Per Sq. ft."

        for (let i = 0; i < raw.length; i++) {
          const colA = String(raw[i][0] ?? "").trim().toLowerCase();
          const rowText = raw[i]
            .map(v => String(v ?? "").trim().toLowerCase())
            .join(" | ");

          if (fyRowIdx === -1 && rowText.includes("financial year")) fyRowIdx = i;
          if (quarterRowIdx === -1 && raw[i].some(v => String(v ?? "").trim().toUpperCase() === "Q1" || String(v ?? "").trim().toUpperCase() === "Q2")) quarterRowIdx = i;
          if (periodRowIdx === -1 && rowText.match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i) && rowText.match(/\d{4}/) && i !== fyRowIdx) periodRowIdx = i;
          if (collectionsRowIdx === -1 && colA.includes("projected collection")) collectionsRowIdx = i;
          if (saleProceedsRowIdx === -1 && colA.includes("projected expenses")) saleProceedsRowIdx = i;
          if (areaRowIdx === -1 && colA.includes("projected area")) areaRowIdx = i;
          if (rateRowIdx === -1 && rowText.includes("rate") && rowText.includes("sq") && rowText.includes("ft")) rateRowIdx = i;
        }

        console.log("Detected rows — FY:", fyRowIdx, "Period:", periodRowIdx, "Quarter:", quarterRowIdx,
          "Area:", areaRowIdx, "Collections:", collectionsRowIdx, "Revenue:", saleProceedsRowIdx, "Rate:", rateRowIdx);

        if (fyRowIdx === -1 || quarterRowIdx === -1) {
          return reject(new Error("Could not find Financial Year or Quarter row in Business Plan sheet"));
        }

        const fyRow = raw[fyRowIdx];
        const quarterRow = raw[quarterRowIdx];
        const periodRow = periodRowIdx !== -1 ? raw[periodRowIdx] : [];

        // ── Step 2: Find the label column (where row names appear) ──
        // It's whichever column in the Quarter row has "Q1"/"Q2" etc — label col is just before data cols
        const labelCol = quarterRow.findIndex(
          (v, idx) => idx > 0 && String(v ?? "").trim().match(/^Q[1-4]$/)
        );
        // Data starts one column after the label column (or at labelCol itself if label is col 1)
        // Actually data cols are those where quarterRow has Q1/Q2/Q3/Q4
        const dataColIndices = quarterRow
          .map((v, idx) => ({ v: String(v ?? "").trim(), idx }))
          .filter(({ v }) => v.match(/^Q[1-4]$/))
          .map(({ idx }) => idx);

        const getVal = (rowIdx, col) => {
          if (rowIdx < 0 || rowIdx >= raw.length) return 0;
          const v = raw[rowIdx][col];
          if (v === null || v === undefined || v === "") return 0;
          if (typeof v === "number") return v;
          return Number(String(v).replace(/,/g, "")) || 0;
        };

        // ── Step 3: Track FY across merged cells ──
        let lastFY = "";
        const quarters = [];

        for (const col of dataColIndices) {
          // FY: only filled in first col of merged group — carry forward
          const fy = String(fyRow[col] ?? "").trim();
          if (fy) lastFY = fy;
          if (!lastFY) continue;

          const quarter = String(quarterRow[col] ?? "").trim();
          if (!quarter.match(/^Q[1-4]$/)) continue;

          const monthRange = String(periodRow[col] ?? "").trim(); // e.g. "Apr-Jun 2025"

          // ── KEY FIX: New sales collections is stored in RAW RUPEES, not Crores ──
          // All other rows (Area, Revenue, Rate) are in their natural units
          // collectionsPlanned: divide by 10,000,000 to convert to Crores for consistency
          // REPLACE with:
quarters.push({
  financialYear: lastFY,
  quarter,
  monthRange,
  col,
  expensesPlanned: getVal(saleProceedsRowIdx, col),
  collectionsPlanned: getVal(collectionsRowIdx, col),
  areaToSellPlanned: getVal(areaRowIdx, col),
  ratePerSft: getVal(rateRowIdx, col),
});
        }

        console.log("Parsed quarters:", quarters.slice(0, 4));
        resolve(quarters);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

  // ── Parse MSP Sheet ───────────────────────────────────────
  // Expected format: Row 0 = headers (Tower, Unit Type, MSP Rate)
  // Data from row 1 onwards
  const parseMSPSheet = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // Find header row — look for row that has "Unit No" and "MSP"
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(5, raw.length); i++) {
          const rowStr = raw[i].map(v => String(v).toLowerCase()).join(' ');
          if (rowStr.includes('unit') && rowStr.includes('msp')) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          return reject(new Error('Could not find header row with Unit No and MSP columns'));
        }

        const headers = raw[headerRowIdx].map(v => String(v).trim().toLowerCase());

        // Find column indices by header name
        const findCol = (...keywords) => headers.findIndex(h =>
          keywords.every(k => h.toLowerCase().includes(k.toLowerCase()))
        );

        const unitNoIdx  = findCol('unit', 'no');
        const towerIdx   = findCol('tower');
        const typeIdx    = findCol('unit', 'type');
        const mspIdx     = findCol('msp');

        console.log('Header row:', headerRowIdx);
        console.log('unitNo idx:', unitNoIdx, 'tower idx:', towerIdx, 'type idx:', typeIdx, 'msp idx:', mspIdx);

        if (mspIdx === -1) {
          return reject(new Error('MSP column not found in sheet'));
        }

        const rates = [];
        for (let i = headerRowIdx + 1; i < raw.length; i++) {
          const row = raw[i];
          const unitNo   = String(row[unitNoIdx] || "").trim();
          const tower    = String(row[towerIdx]  || "").trim();
          const unitType = String(row[typeIdx]   || "").trim();
          const mspRate  = typeof row[mspIdx] === "number"
            ? row[mspIdx]
            : Number(String(row[mspIdx] || "").replace(/,/g, "")) || 0;
          if (!unitNo) {
            console.warn(`ROW ${i} SKIPPED — unitNo is empty. Raw row:`, row);
            continue;
          }
          if (mspRate <= 0) {
            console.warn(`ROW ${i} SKIPPED — mspRate is 0 or negative. unitNo: "${unitNo}", raw msp value:`, row[mspIdx]);
            continue;
          }
          rates.push({ unitNo, tower, unitType, mspRate });
        }

        console.log('Parsed MSP rates:', rates.slice(0, 3));
        resolve(rates);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

  // ── Upload Handlers ───────────────────────────────────────
  const handleInventoryUpload = async () => {
    if (!inventoryFile || !projectId) return;
    setUploadingInventory(true);
    setInventoryStatus(null);
    try {
      const rows = await parseInventorySheet(inventoryFile);
      const result = await uploadInventoryData(projectId, rows, inventoryFile);
      if (result.success) {
        setInventoryStatus({ type: "success", message: `Uploaded successfully! ${rows.length} unit types parsed.` });
        setInventoryFile(null);
        getInventoryData(projectId).then(setExistingInventory);
      } else {
        setInventoryStatus({ type: "error", message: result.error });
      }
    } catch (err) {
      setInventoryStatus({ type: "error", message: err.message });
    }
    setUploadingInventory(false);
  };

  const handleBusinessPlanUpload = async () => {
    if (!businessPlanFile || !projectId) return;
    setUploadingPlan(true);
    setPlanStatus(null);
    try {
      const quarters = await parseBusinessPlanSheet(businessPlanFile);
      const result = await uploadBusinessPlanData(projectId, quarters, businessPlanFile);
      if (result.success) {
        setPlanStatus({ type: "success", message: `Uploaded successfully! ${quarters.length} quarters parsed.` });
        setBusinessPlanFile(null);
        getBusinessPlanData(projectId).then(setExistingPlan);
      } else {
        setPlanStatus({ type: "error", message: result.error });
      }
    } catch (err) {
      setPlanStatus({ type: "error", message: err.message });
    }
    setUploadingPlan(false);
  };

  const handleCostBPUpload = async () => {
  if (!costBpFile || !projectId) return;
  setUploadingCostBp(true);
  setCostBpStatus(null);
  try {
    const result = await uploadCostBPFile(projectId, costBpFile);
    if (result.success) {
      setCostBpStatus({ type: "success", message: "Cost Budget uploaded successfully!" });
      setCostBpFile(null);
      getCostBPMetadata(projectId).then(setExistingCostBp);
    } else {
      setCostBpStatus({ type: "error", message: result.error });
    }
  } catch (err) {
    setCostBpStatus({ type: "error", message: err.message });
  }
  setUploadingCostBp(false);
};

const handleMSPUpload = async () => {
    if (!mspFile || !projectId) return;
    setUploadingMsp(true);
    setMspStatus(null);
    try {
      const rates = await parseMSPSheet(mspFile);
      const result = await uploadMSPData(projectId, rates, mspFile);
      if (result.success) {
        setMspStatus({ type: "success", message: `Uploaded successfully! ${rates.length} MSP rates parsed.` });
        setMspFile(null);
        getMSPData(projectId).then(setExistingMsp);
      } else {
        setMspStatus({ type: "error", message: result.error });
      }
    } catch (err) {
      setMspStatus({ type: "error", message: err.message });
    }
    setUploadingMsp(false);
  };

  return (
    <Layout title="Reference Upload">
      <div className="mb-6">
        <h3 className="text-gray-800 font-bold text-lg">Reference Sheet Upload</h3>
        <p className="text-gray-400 text-sm mt-1">
          Upload Total Inventory, Business Plan and MSP Rate sheets for this project.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">

        {/* ── Inventory Sheet ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Building2 size={20} className="text-blue-600" />
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-sm">Total Inventory Sheet</h4>
              <p className="text-gray-400 text-xs">Phase, Tower, Unit Type, Area details</p>
            </div>
          </div>

          {existingInventory && (
            <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-between">
              <div>
                <p className="text-blue-700 text-xs font-bold">Last Uploaded</p>
                <p className="text-blue-500 text-xs">{new Date(existingInventory.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                <p className="text-blue-400 text-xs">{existingInventory.rows?.length} unit types</p>
              </div>
              {existingInventory.fileUrl && (
                <a href={existingInventory.fileUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  <Download size={12} /> Download
                </a>
              )}
            </div>
          )}

          <FileUploadBox
            label="Upload Inventory Sheet"
            subtitle="Total Inventory Excel file"
            file={inventoryFile}
            onFileSelect={setInventoryFile}
            onClear={() => setInventoryFile(null)}
            accent="blue"
          />

          {inventoryStatus && (
            <div className={`mt-3 p-3 rounded-xl text-xs font-medium flex items-center gap-2
              ${inventoryStatus.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {inventoryStatus.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {inventoryStatus.message}
            </div>
          )}

          <button onClick={handleInventoryUpload} disabled={!inventoryFile || uploadingInventory}
            className={`mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
              ${inventoryFile && !uploadingInventory ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
            {uploadingInventory ? <><RefreshCw size={14} className="animate-spin" /> Uploading...</> : <><Upload size={14} /> Upload Inventory Sheet</>}
          </button>
        </div>

        {/* ── Business Plan Sheet ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <TrendingUp size={20} className="text-emerald-600" />
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-sm">Business Plan Sheet</h4>
              <p className="text-gray-400 text-xs">Quarter-wise planned inflow, outflow & targets</p>
            </div>
          </div>

          {existingPlan && (
            <div className="mb-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between">
              <div>
                <p className="text-emerald-700 text-xs font-bold">Last Uploaded</p>
                <p className="text-emerald-500 text-xs">{new Date(existingPlan.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                <p className="text-emerald-400 text-xs">{existingPlan.quarters?.length} quarters</p>
              </div>
              {existingPlan.fileUrl && (
                <a href={existingPlan.fileUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium">
                  <Download size={12} /> Download
                </a>
              )}
            </div>
          )}

          <FileUploadBox
            label="Upload Business Plan Sheet"
            subtitle="KVD Business Plan Excel file"
            file={businessPlanFile}
            onFileSelect={setBusinessPlanFile}
            onClear={() => setBusinessPlanFile(null)}
            accent="emerald"
          />

          {planStatus && (
            <div className={`mt-3 p-3 rounded-xl text-xs font-medium flex items-center gap-2
              ${planStatus.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {planStatus.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {planStatus.message}
            </div>
          )}

          <button onClick={handleBusinessPlanUpload} disabled={!businessPlanFile || uploadingPlan}
            className={`mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
              ${businessPlanFile && !uploadingPlan ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
            {uploadingPlan ? <><RefreshCw size={14} className="animate-spin" /> Uploading...</> : <><Upload size={14} /> Upload Business Plan Sheet</>}
          </button>
        </div>

        {/* ── MSP Rate Sheet ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <BadgePercent size={20} className="text-orange-600" />
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-sm">MSP Rate Sheet</h4>
              <p className="text-gray-400 text-xs">Tower, Unit Type, MSP Rate per sft</p>
            </div>
          </div>

          {existingMsp && (
            <div className="mb-4 p-3 bg-orange-50 rounded-xl border border-orange-100 flex items-center justify-between">
              <div>
                <p className="text-orange-700 text-xs font-bold">Last Uploaded</p>
                <p className="text-orange-500 text-xs">{new Date(existingMsp.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                <p className="text-orange-400 text-xs">{existingMsp.rates?.length} MSP rates</p>
              </div>
              {existingMsp.fileUrl && (
                <a href={existingMsp.fileUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium">
                  <Download size={12} /> Download
                </a>
              )}
            </div>
          )}

          {/* Format hint */}
          <div className="mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500">
            <p className="font-bold text-gray-600 mb-1">Expected Excel Format:</p>
            <p>Row 1: Headers → Tower | Unit Type | MSP Rate</p>
            <p>Row 2+: T1 | 3 BHK | 7500</p>
          </div>

          <FileUploadBox
            label="Upload MSP Rate Sheet"
            subtitle="Tower-wise MSP Rate Excel file"
            file={mspFile}
            onFileSelect={setMspFile}
            onClear={() => setMspFile(null)}
            accent="orange"
          />

          {mspStatus && (
            <div className={`mt-3 p-3 rounded-xl text-xs font-medium flex items-center gap-2
              ${mspStatus.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {mspStatus.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {mspStatus.message}
            </div>
          )}

          <button onClick={handleMSPUpload} disabled={!mspFile || uploadingMsp}
            className={`mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
              ${mspFile && !uploadingMsp ? "bg-orange-600 hover:bg-orange-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
            {uploadingMsp ? <><RefreshCw size={14} className="animate-spin" /> Uploading...</> : <><Upload size={14} /> Upload MSP Rate Sheet</>}
          </button>
        </div>

      {/* ── Cost Budget (BP) Sheet ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet size={20} className="text-indigo-600" />
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-sm">Cost Budget (BP) Sheet</h4>
              <p className="text-gray-400 text-xs">Quarter-wise cost outflow budget</p>
            </div>
          </div>

          {existingCostBp && (
            <div className="mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between">
              <div>
                <p className="text-indigo-700 text-xs font-bold">Last Uploaded</p>
                <p className="text-indigo-500 text-xs">{new Date(existingCostBp.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                <p className="text-indigo-400 text-xs">{existingCostBp.fileName}</p>
              </div>
            </div>
          )}

          <FileUploadBox
            label="Upload Cost Budget Sheet"
            subtitle="Cost BP Excel file (.xlsx)"
            file={costBpFile}
            onFileSelect={setCostBpFile}
            onClear={() => setCostBpFile(null)}
            accent="blue"
          />

          {costBpStatus && (
            <div className={`mt-3 p-3 rounded-xl text-xs font-medium flex items-center gap-2
              ${costBpStatus.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {costBpStatus.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {costBpStatus.message}
            </div>
          )}

          <button onClick={handleCostBPUpload} disabled={!costBpFile || uploadingCostBp}
            className={`mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
              ${costBpFile && !uploadingCostBp ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
            {uploadingCostBp ? <><RefreshCw size={14} className="animate-spin" /> Uploading...</> : <><Upload size={14} /> Upload Cost Budget Sheet</>}
          </button>
        </div>

      </div>

    </Layout>
  );
}