import { doc, setDoc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "./firebase";

// ── STATUS CONFIG (like MIS) ──────────────────────────────────
export const COST_STATUS_CONFIG = {
  PENDING_REVIEW:    { label: "Pending Review",    color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  PENDING_MANAGER:   { label: "Pending Manager",   color: "bg-blue-50 text-blue-700 border-blue-200" },
  APPROVED:          { label: "Approved & Frozen", color: "bg-green-50 text-green-700 border-green-200" },
  REJECTED_BY_REVIEWER: { label: "Rejected by Reviewer", color: "bg-red-50 text-red-700 border-red-200" },
  REJECTED_BY_MANAGER:  { label: "Rejected by Manager",  color: "bg-red-50 text-red-700 border-red-200" },
};

// ── Upload Cost BP File (Manager) ─────────────────────────────
const getStoragePath = async (projectId) => {
  const snap = await getDoc(doc(db, "projects", projectId));
  const name = snap.data()?.projectName || snap.data()?.name || projectId;
  return name.trim();
};

export const uploadCostBPFile = async (projectId, file, projectName) => {
  try {
    const storagePath = projectName || await getStoragePath(projectId);
    const fileRef = ref(storage, `projects/${storagePath}/reference/businessPlan_latest.xlsx`);
    await uploadBytes(fileRef, file);
    const fileUrl = await getDownloadURL(fileRef);

    await setDoc(doc(db, "projects", projectId, "costReferenceData", "businessPlan"), {
      fileUrl,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: auth.currentUser?.uid || "unknown",
      uploadedByEmail: auth.currentUser?.email || "unknown",
    });
    return { success: true };
  } catch (err) {
    console.error("uploadCostBPFile error:", err);
    return { success: false, error: err.message };
  }
};

// ── Get Cost BP Metadata (to show status) ────────────────────
export const getCostBPMetadata = async (projectId) => {
  try {
    const snap = await getDoc(doc(db, "projects", projectId, "costReferenceData", "businessPlan"));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("getCostBPMetadata error:", err);
    return null;
  }
};

// ── Submit Cost Analysis for Review (Maker) ───────────────────
export const submitCostForReview = async (projectId, period, payload) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await setDoc(doc(db, "projects", projectId, "costSubmissions", docId), {
  period,
  status: "PENDING_REVIEW",
  submittedBy: payload.submittedBy,
  submittedAt: new Date().toISOString(),
  makerComment: payload.makerComment || "",
  allBillMonths: payload.allBillMonths || [],
  bpStats: payload.bpStats || {},
  clearedBillsUrl: payload.clearedBillsUrl || "",
  rawRowsUrl: payload.rawRowsUrl || "",
});
    return { success: true };
  } catch (err) {
    console.error("submitCostForReview error:", err);
    return { success: false, error: err.message };
  }
};

// ── Get All Cost Submissions ──────────────────────────────────
export const getAllCostSubmissions = async (projectId) => {
  try {
    const snap = await getDocs(collection(db, "projects", projectId, "costSubmissions"));
    const results = [];
    snap.forEach(d => results.push({ id: d.id, ...d.data() }));
    results.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return results;
  } catch (err) {
    console.error("getAllCostSubmissions error:", err);
    return [];
  }
};

// ── Get Single Cost Submission ────────────────────────────────
export const getCostSubmission = async (projectId, period) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    const snap = await getDoc(doc(db, "projects", projectId, "costSubmissions", docId));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("getCostSubmission error:", err);
    return null;
  }
};

// ── Reviewer Approve ──────────────────────────────────────────
export const reviewerApproveCost = async (projectId, period, reviewerEmail, comment) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "costSubmissions", docId), {
      status: "PENDING_MANAGER",
      reviewedBy: reviewerEmail,
      reviewedAt: new Date().toISOString(),
      reviewerComment: comment || "",
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── Reviewer Reject ───────────────────────────────────────────
export const reviewerRejectCost = async (projectId, period, reviewerEmail, comment) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "costSubmissions", docId), {
      status: "REJECTED_BY_REVIEWER",
      reviewedBy: reviewerEmail,
      reviewedAt: new Date().toISOString(),
      rejectionComment: comment || "",
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── Manager Approve ───────────────────────────────────────────
export const managerApproveCost = async (projectId, period, managerEmail, comment) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "costSubmissions", docId), {
      status: "APPROVED",
      approvedBy: managerEmail,
      approvedAt: new Date().toISOString(),
      managerComment: comment || "",
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── Manager Reject ────────────────────────────────────────────
export const managerRejectCost = async (projectId, period, managerEmail, comment) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "costSubmissions", docId), {
      status: "REJECTED_BY_MANAGER",
      approvedBy: managerEmail,
      approvedAt: new Date().toISOString(),
      rejectionComment: comment || "",
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
// ── Save Approved Bills to persistent store (called on Manager Approve) ──
export const saveApprovedCostBills = async (projectId, period, rawRowsUrl, clearedBillsUrl, allBillMonths) => {
  try {
    await setDoc(doc(db, "projects", projectId, "costApprovedData", "latestApproved"), {
      period,
      approvedAt: new Date().toISOString(),
      rawRowsUrl: rawRowsUrl || "",
      clearedBillsUrl: clearedBillsUrl || "", 
      allBillMonths: allBillMonths || [],
    });
    return { success: true };
  } catch (err) {
    console.error("saveApprovedCostBills error:", err);
    return { success: false, error: err.message };
  }
};

// ── Get Last Approved Bills (used by backend to know what was last approved) ──
export const getLastApprovedCostData = async (projectId) => {
  try {
    const snap = await getDoc(doc(db, "projects", projectId, "costApprovedData", "latestApproved"));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("getLastApprovedCostData error:", err);
    return null;
  }
};
