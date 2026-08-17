import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Layout from "../components/common/Layout";
import { CheckCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../services/escrow";
import { useProject } from "../context/ProjectContext";

// Simple deterministic hash so keys stay short + Firestore-safe (no '.', '/', etc.)
function hashKey(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// Firestore field names cannot contain '/', '.', '~', '*', '[', ']'.
// Unit numbers like "T6/187" or "C1/GF/9" need sanitizing before use as a key.
const sanitizeKeyPart = (str) =>
  String(str || "").trim().toUpperCase().replace(/[/.~*\[\]]/g, "_");

const getMatchedKey = (group) =>
  `matched_${sanitizeKeyPart(group.unitNo)}_${sanitizeKeyPart(group.monthKey)}`;
const getMappedUnitKey = (unitNo, month) =>
  `mapped_${sanitizeKeyPart(unitNo)}_${sanitizeKeyPart(month)}`;
const getTxnKey = (txn) =>
  `txn_${hashKey(`${txn.date}|${txn.referenceNo || ""}|${txn.depositAmount}|${txn.narration}`)}`;
const getUnmatchedUnitKey = (unitNo, month) =>
  `unit_${sanitizeKeyPart(unitNo)}_${sanitizeKeyPart(month)}`;

export default function CollectionMappingResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const result = location.state?.result;
  const { selectedProject } = useProject();
  const projectId = selectedProject?.projectId;
  const month = result?.month;

  const [remarks, setRemarks] = useState({});
  const [unitSelections, setUnitSelections] = useState({});

  useEffect(() => {
    console.log("[LoadRemarks] projectId:", projectId, "| month:", month);
    const loadRemarks = async () => {
      if (!projectId || !month) {
        console.warn("[LoadRemarks] Skipped — missing projectId or month.");
        return;
      }
      try {
        const docRef = doc(db, "projects", projectId, "collectionMappingRemarks", month);
        const snap = await getDoc(docRef);
        console.log("[LoadRemarks] Path:", docRef.path, "| exists:", snap.exists());
        if (snap.exists()) setRemarks(snap.data() || {});
      } catch (err) {
        console.error("[LoadRemarks] Read FAILED:", err.code, err.message, err);
      }
    };
    loadRemarks();
  }, [projectId, month]);

  if (!result) {
    return (
      <Layout title="Collection Mapping Results">
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <AlertCircle size={40} className="text-gray-300" />
          <p className="text-gray-500 text-sm">No comparison data found. Please run a comparison first.</p>
          <button
            onClick={() => navigate("/collection-mapping")}
            className="text-blue-600 text-sm font-semibold hover:underline"
          >
            ← Back to Collection Mapping
          </button>
        </div>
      </Layout>
    );
  }

  const { matched, unmatched, unmatchedTransactions = [], uniqueMatchedUnitsCount, totalUnitsCount } = result;

  const [saveStatus, setSaveStatus] = useState(null); // null | "saving" | "saved" | "error"

  const updateRemark = (key, value) => {
    setRemarks((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveRemarks = async () => {
    console.log("[SaveRemarks] projectId:", projectId, "| month:", month, "| remarks:", remarks);

    if (!projectId) {
      alert("Cannot save: no project selected (projectId is missing). Try reselecting the project from the dashboard.");
      return;
    }
    if (!month) {
      alert("Cannot save: month is missing from the comparison result.");
      return;
    }

    setSaveStatus("saving");
    try {
      const docRef = doc(db, "projects", projectId, "collectionMappingRemarks", month);
      await setDoc(docRef, remarks, { merge: true });
      console.log("[SaveRemarks] Write succeeded at path:", docRef.path);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      console.error("[SaveRemarks] Write FAILED:", err.code, err.message, err);
      alert(`Save failed: ${err.code || ""} ${err.message || err}`);
      setSaveStatus("error");
    }
  };

  const updateUnitSelection = (rowIndex, unitNo) => {
    setUnitSelections((prev) => ({ ...prev, [rowIndex]: unitNo }));
  };

  // Quick lookup: unitNo -> { customerName, receivedIncrementVal, ... }
  const unmatchedUnitMap = {};
  unmatched.forEach((u) => { unmatchedUnitMap[u.unitNo] = u; });

  return (
    <Layout title="Collection Mapping Results">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate("/collection-mapping")}
          className="flex items-center gap-1.5 px-3 py-1.5 mb-4 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all"
        >
          <ArrowLeft size={13} /> Back
        </button>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={18} className="text-green-600" />
            <h3 className="font-bold text-gray-800 text-base">Matched Units</h3>
          </div>
          
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Unit No. (MIS)</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Customer Name</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Date</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Value Date</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Narration (Bank statement)</th>
                  <th className="text-right p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Deposit Amount (Bank statement)</th>
                  <th className="text-right p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Collection Raised (MIS)</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Unit No. (Bank statement)</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Remark</th>
                </tr>
              </thead>
              <tbody>
                {matched.map((group, index) => (
                  <tr key={index} className="border-t bg-green-50 border-green-200 align-top">
                    <td className="p-3 text-gray-700 text-xs whitespace-nowrap font-semibold">{group.unitNo}</td>
                    <td className="p-3 text-gray-700 text-xs whitespace-nowrap">{group.customerName}</td>
                    <td className="p-3 text-gray-700 text-xs whitespace-nowrap">
                      {group.transactions.map((t, i) => <div key={i}>{t.date}</div>)}
                    </td>
                    <td className="p-3 text-gray-700 text-xs whitespace-nowrap">
                      {group.transactions.map((t, i) => <div key={i}>{t.valueDate}</div>)}
                    </td>
                    <td className="p-3 text-gray-700 text-xs max-w-xs">
                      {group.transactions.map((t, i) => (
                        <div key={i} className="truncate mb-1 last:mb-0" title={t.narration}>{t.narration}</div>
                      ))}
                      <div className="mt-2 pt-2 border-t border-gray-300 font-bold">Total</div>
                    </td>
                    <td className="p-3 text-right text-gray-700 text-xs">
                      {group.transactions.map((t, i) => (
                        <div key={i} className="font-medium whitespace-nowrap mb-1 last:mb-0">
                          ₹{Number(t.depositAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                      ))}
                      <div
                        className={`mt-2 pt-2 border-t text-xs font-bold whitespace-nowrap ${
                          Number(group.totalDepositAmount) === Number(group.collectionRaised)
                            ? "border-green-300 text-green-700"
                            : "border-red-300 text-red-600"
                        }`}
                      >
                        ₹{Number(group.totalDepositAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="p-3 text-right text-gray-700 text-xs">
                      {group.transactions.map((_, i) => (
                        <div key={i} className="font-medium whitespace-nowrap mb-1 last:mb-0">
                          {i === 0 ? `₹${Number(group.collectionRaised).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                        </div>
                      ))}
                      <div
                        className={`mt-2 pt-2 border-t text-xs font-bold whitespace-nowrap ${
                          Number(group.totalDepositAmount) === Number(group.collectionRaised)
                            ? "border-green-300 text-green-700"
                            : "border-red-300 text-red-600"
                        }`}
                      >
                        ₹{Number(group.collectionRaised).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="p-3 text-gray-700 text-xs whitespace-nowrap">{group.unitNoBankStmt || "—"}</td>
                    <td className="p-3" style={{ minWidth: "160px" }}>
                      <input
                        type="text"
                        value={remarks[getMatchedKey(group)] || ""}
                        onChange={(e) => updateRemark(getMatchedKey(group), e.target.value)}
                        placeholder="Add remark..."
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={18} className="text-red-500" />
              <h3 className="font-bold text-gray-800 text-base">
                Unmatched Transactions
              </h3>
            </div>
            <p className="text-gray-400 text-xs">
              Manually map each bank transaction to a unit to verify against its MIS value.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Name (MIS)</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Date</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Value Date</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Narration</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Unit No.</th>
                  <th className="text-right p-3 text-gray-600 font-bold text-xs whitespace-nowrap">MIS Value (₹)</th>
                  <th className="text-right p-3 text-gray-600 font-bold text-xs whitespace-nowrap">Deposit Amount (₹)</th>
                  <th className="text-left p-3 text-gray-600 font-bold text-xs">Remark</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group transactions by whichever unit the user has selected
                  // in the dropdown. Transactions with no selection yet stay standalone.
                  const groupMap = {};
                  const standalone = [];

                  const validUnitNumbers = new Set(unmatched.map((u) => u.unitNo));

                  unmatchedTransactions.forEach((txn, index) => {
                    const unitNo = unitSelections[index];
                    // Only group once the typed value is an exact, real unit
                    // number — partial text while typing stays standalone so
                    // the input doesn't remount and lose focus mid-keystroke.
                    if (unitNo && validUnitNumbers.has(unitNo)) {
                      if (!groupMap[unitNo]) groupMap[unitNo] = [];
                      groupMap[unitNo].push({ txn, index });
                    } else {
                      standalone.push({ txn, index });
                    }
                  });

                  const unitDropdown = (index) => (
                    <>
                      <input
                        list="unmatched-unit-options"
                        value={unitSelections[index] || ""}
                        onChange={(e) => updateUnitSelection(index, e.target.value)}
                        placeholder="Search unit..."
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      />
                    </>
                  );

                  const groupRows = Object.entries(groupMap).map(([unitNo, items]) => {
                    const unit = unmatchedUnitMap[unitNo];
                    const totalDeposit = items.reduce((sum, { txn }) => sum + Number(txn.depositAmount), 0);
                    const misValue = unit && unit.receivedIncrementVal ? Number(unit.receivedIncrementVal) : null;

                    return (
                      <tr key={unitNo} className="border-t bg-blue-50 border-blue-200 align-top">
                        <td className="p-3 text-gray-700 text-xs whitespace-nowrap">{unit ? unit.customerName : "-"}</td>
                        <td className="p-3 text-gray-700 text-xs whitespace-nowrap">
                          {items.map(({ index }) => <div key={index} className="mb-1 last:mb-0">{unmatchedTransactions[index].date}</div>)}
                        </td>
                        <td className="p-3 text-gray-700 text-xs whitespace-nowrap">
                          {items.map(({ index }) => <div key={index} className="mb-1 last:mb-0">{unmatchedTransactions[index].valueDate}</div>)}
                        </td>
                        <td className="p-3 text-gray-700 text-xs max-w-xs">
                          {items.map(({ txn, index }) => (
                            <div key={index} className="truncate mb-1 last:mb-0" title={txn.narration}>{txn.narration}</div>
                          ))}
                          <div className="mt-2 pt-2 border-t border-blue-300 font-bold">Total</div>
                        </td>
                        <td style={{ minWidth: "140px" }}>
                          {items.map(({ index }) => (
                            <div key={index} className="mb-1 last:mb-0 p-1.5">{unitDropdown(index)}</div>
                          ))}
                        </td>
                        <td className="p-3 text-right text-gray-700 text-xs font-medium">
                          {items.map(({ index }) => <div key={index} className="mb-1 last:mb-0">-</div>)}
                          <div className="mt-2 pt-2 border-t border-blue-300 font-bold whitespace-nowrap">
                            {misValue !== null ? `₹${misValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                          </div>
                        </td>
                        <td className="p-3 text-right text-gray-700 text-xs font-medium">
                          {items.map(({ txn, index }) => (
                            <div key={index} className="mb-1 last:mb-0 whitespace-nowrap">
                              ₹{Number(txn.depositAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </div>
                          ))}
                          <div className="mt-2 pt-2 border-t border-blue-300 font-bold whitespace-nowrap">
                            ₹{totalDeposit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="p-3" style={{ minWidth: "160px" }}>
                          <input
                            type="text"
                            value={remarks[getMappedUnitKey(unitNo, month)] || ""}
                            onChange={(e) => updateRemark(getMappedUnitKey(unitNo, month), e.target.value)}
                            placeholder="Add remark..."
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                          />
                        </td>
                      </tr>
                    );
                  });

                  const standaloneRows = standalone.map(({ txn, index }) => (
                    <tr key={index} className="border-t bg-red-50 border-red-100 align-top">
                      <td className="p-3 text-gray-700 text-xs whitespace-nowrap">-</td>
                      <td className="p-3 text-gray-700 text-xs whitespace-nowrap">{txn.date}</td>
                      <td className="p-3 text-gray-700 text-xs whitespace-nowrap">{txn.valueDate}</td>
                      <td className="p-3 text-gray-700 text-xs max-w-xs">
                        <div className="truncate" title={txn.narration}>{txn.narration}</div>
                      </td>
                      <td className="p-3" style={{ minWidth: "140px" }}>{unitDropdown(index)}</td>
                      <td className="p-3 text-right text-gray-700 text-xs font-medium whitespace-nowrap">-</td>
                      <td className="p-3 text-right text-gray-700 text-xs font-medium whitespace-nowrap">-</td>
                      <td className="p-3" style={{ minWidth: "160px" }}>
                        <input
                          type="text"
                          value={remarks[getTxnKey(txn)] || ""}
                          onChange={(e) => updateRemark(getTxnKey(txn), e.target.value)}
                          placeholder="Add remark..."
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                        />
                      </td>
                    </tr>
                  ));

                  return [...groupRows, ...standaloneRows];
                })()}
              </tbody>
            </table>
            <datalist id="unmatched-unit-options">
              {unmatched.map((u) => (
                <option key={u.unitNo} value={u.unitNo} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Save Remarks button */}
        <div className="flex items-center justify-end gap-3 mt-6 mb-10">
          {saveStatus === "saved" && (
            <span className="text-green-600 text-xs font-semibold flex items-center gap-1">
              <CheckCircle size={14} /> Remarks saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-red-600 text-xs font-semibold flex items-center gap-1">
              <AlertCircle size={14} /> Failed to save. Try again.
            </span>
          )}
          <button
            onClick={handleSaveRemarks}
            disabled={saveStatus === "saving"}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all
              ${saveStatus === "saving"
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg"}`}
          >
            {saveStatus === "saving" ? "Saving..." : "Save Remarks"}
          </button>
        </div>
      </div>
    </Layout>
  );
}