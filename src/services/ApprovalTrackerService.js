import { doc, setDoc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage, auth } from "./firebase";

export const APPROVAL_STATUS_CONFIG = {
  PENDING_REVIEW:       { label: "Pending Review",    color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  PENDING_MANAGER:      { label: "Pending Manager",   color: "bg-blue-50 text-blue-700 border-blue-200" },
  APPROVED:             { label: "Approved & Frozen", color: "bg-green-50 text-green-700 border-green-200" },
  REJECTED_BY_REVIEWER: { label: "Rejected by Reviewer", color: "bg-red-50 text-red-700 border-red-200" },
  REJECTED_BY_MANAGER:  { label: "Rejected by Manager",  color: "bg-red-50 text-red-700 border-red-200" },
};

// ── Manager: upload required approvals list ──
export const uploadRequiredApprovalsList = async (projectId, file) => {
  try {
    const projSnap = await getDoc(doc(db, "projects", projectId));
const projName = projSnap.data()?.projectName || projSnap.data()?.name || projectId;
const storagePath = projName.trim();

const fileRef = ref(storage, `projects/${storagePath}/approvalReference/required_approvals.xlsx`);
    await uploadBytes(fileRef, file);
    const fileUrl = await getDownloadURL(fileRef);
    await setDoc(doc(db, "projects", projectId, "approvalReference", "masterList"), {
      fileUrl,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: auth.currentUser?.email || "unknown",
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── Get required approvals metadata ──
export const getRequiredApprovalsMetadata = async (projectId) => {
  try {
    const snap = await getDoc(doc(db, "projects", projectId, "approvalReference", "masterList"));
    return snap.exists() ? snap.data() : null;
  } catch (err) { return null; }
};

// ── Maker: submit approval for review ──
export const submitApprovalForReview = async (projectId, period, payload) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await setDoc(doc(db, "projects", projectId, "approvalSubmissions", docId), {
      period,
      status: "PENDING_REVIEW",
      submittedBy: payload.submittedBy,
      submittedAt: new Date().toISOString(),
      makerComment: payload.makerComment || "",
      approvalDataUrl: payload.approvalDataUrl || "",
      approvalFileUrl: payload.approvalFileUrl || "",
      summary: payload.summary || {},
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── Get all submissions ──
export const getAllApprovalSubmissions = async (projectId) => {
  try {
    const snap = await getDocs(collection(db, "projects", projectId, "approvalSubmissions"));
    const results = [];
    snap.forEach(d => results.push({ id: d.id, ...d.data() }));
    results.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return results;
  } catch (err) { return []; }
};

// ── Reviewer approve ──
export const reviewerApproveApproval = async (projectId, period, email, comment) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "approvalSubmissions", docId), {
      status: "PENDING_MANAGER",
      reviewedBy: email,
      reviewedAt: new Date().toISOString(),
      reviewerComment: comment || "",
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
};

// ── Reviewer reject ──
export const reviewerRejectApproval = async (projectId, period, email, comment) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "approvalSubmissions", docId), {
      status: "REJECTED_BY_REVIEWER",
      reviewedBy: email,
      reviewedAt: new Date().toISOString(),
      rejectionComment: comment || "",
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
};

// ── Manager approve (moves files from pending → approved) ──
export const managerApproveApproval = async (projectId, period, email, comment, approvedDataUrl = "") => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "approvalSubmissions", docId), {
      status: "APPROVED",
approvedBy: email,
approvedAt: new Date().toISOString(),
managerComment: comment || "",
approvalDataUrl: approvedDataUrl,
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
};

// ── Manager reject ──
export const managerRejectApproval = async (projectId, period, email, comment) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "approvalSubmissions", docId), {
      status: "REJECTED_BY_MANAGER",
      approvedBy: email,
      approvedAt: new Date().toISOString(),
      rejectionComment: comment || "",
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
};
