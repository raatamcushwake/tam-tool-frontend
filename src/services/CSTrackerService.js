import { doc, setDoc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage, auth } from "./firebase";

export const CS_STATUS_CONFIG = {
  PENDING_REVIEW:       { label: "Pending Review",       color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  PENDING_MANAGER:      { label: "Pending Manager",      color: "bg-blue-50 text-blue-700 border-blue-200" },
  APPROVED:             { label: "Approved & Frozen",    color: "bg-green-50 text-green-700 border-green-200" },
  REJECTED_BY_REVIEWER: { label: "Rejected by Reviewer", color: "bg-red-50 text-red-700 border-red-200" },
  REJECTED_BY_MANAGER:  { label: "Rejected by Manager",  color: "bg-red-50 text-red-700 border-red-200" },
};

export const submitCSTrackerForReview = async (projectId, period, payload) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await setDoc(doc(db, "projects", projectId, "csTrackerSubmissions", docId), {
      period,
      status: "PENDING_REVIEW",
      submittedBy: payload.submittedBy,
      submittedAt: new Date().toISOString(),
      makerComment: payload.makerComment || "",
      csDataUrl: payload.csDataUrl || "",
      csFileUrl: payload.csFileUrl || "",
      summary: payload.summary || {},
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const getAllCSSubmissions = async (projectId) => {
  try {
    const snap = await getDocs(collection(db, "projects", projectId, "csTrackerSubmissions"));
    const results = [];
    snap.forEach(d => results.push({ id: d.id, ...d.data() }));
    results.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return results;
  } catch (err) { return []; }
};

export const reviewerApproveCS = async (projectId, period, email, comment) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "csTrackerSubmissions", docId), {
      status: "PENDING_MANAGER",
      reviewedBy: email,
      reviewedAt: new Date().toISOString(),
      reviewerComment: comment || "",
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
};

export const reviewerRejectCS = async (projectId, period, email, comment) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "csTrackerSubmissions", docId), {
      status: "REJECTED_BY_REVIEWER",
      reviewedBy: email,
      reviewedAt: new Date().toISOString(),
      rejectionComment: comment || "",
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
};

export const managerApproveCS = async (projectId, period, email, comment, approvedDataUrl = "") => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "csTrackerSubmissions", docId), {
      status: "APPROVED",
      approvedBy: email,
      approvedAt: new Date().toISOString(),
      managerComment: comment || "",
      csDataUrl: approvedDataUrl,
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
};

export const managerRejectCS = async (projectId, period, email, comment) => {
  try {
    const docId = period.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    await updateDoc(doc(db, "projects", projectId, "csTrackerSubmissions", docId), {
      status: "REJECTED_BY_MANAGER",
      approvedBy: email,
      approvedAt: new Date().toISOString(),
      rejectionComment: comment || "",
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
};