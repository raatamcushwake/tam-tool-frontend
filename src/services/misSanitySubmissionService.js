import { db, storage } from "./firebase";
import {
  doc, setDoc, getDoc, getDocs,
  collection, updateDoc, serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export const STATUS_CONFIG = {
  PENDING_REVIEW: { label: "Pending Review", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  PENDING_MANAGER: { label: "Pending Manager", color: "bg-blue-100 text-blue-700 border-blue-300" },
  APPROVED: { label: "Approved & Frozen", color: "bg-green-100 text-green-700 border-green-300" },
  REJECTED_BY_REVIEWER: { label: "Rejected by Reviewer", color: "bg-red-100 text-red-700 border-red-300" },
  REJECTED_BY_MANAGER: { label: "Rejected by Manager", color: "bg-red-100 text-red-700 border-red-300" },
};

// Submit sanity for review (Maker)
export const submitSanityForReview = async (projectId, monthYear, payload) => {
  try {
    const docRef = doc(db, "projects", projectId, "misSanitySubmissions", monthYear);
    await setDoc(docRef, {
      monthYear,
      status: "PENDING_REVIEW",
      submittedBy: payload.submittedBy,
      submittedAt: serverTimestamp(),
      makerComment: payload.makerComment || "",
      makerProofDocuments: payload.makerProofDocuments || [],
      unitAnnotations: payload.unitAnnotations || {},
      currFileURL: payload.currFileURL || "",
      sanityCheckPassed: payload.sanityCheckPassed,
      issues: payload.issues || [],
      summary: payload.summary || {},
      units: payload.units || [],
      newBookings: payload.newBookings || [],
      transferredUnits: payload.transferredUnits || [],
      nameCorrections: payload.nameCorrections || [],
      cancelledUnits: payload.cancelledUnits || [],
      duplicateUnits: payload.duplicateUnits || [],
      anomalyUnits: payload.anomalyUnits || [],
      decreases: payload.decreases || {},
      increases: payload.increases || {},
      unitStats: payload.unitStats || {},
      reviewerComment: "",
      reviewedBy: "",
      reviewedAt: null,
      managerComment: "",
      approvedBy: "",
      approvedAt: null,
      rejectionComment: "",
    }, { merge: true });
    return { success: true };
  } catch (error) {
    console.error("submitSanityForReview error:", error);
    return { success: false, error: error.message };
  }
};

// Get single submission
export const getSanitySubmission = async (projectId, monthYear) => {
  try {
    const docRef = doc(db, "projects", projectId, "misSanitySubmissions", monthYear);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (error) {
    console.error("getSanitySubmission error:", error);
    return null;
  }
};

// Get all submissions
export const getAllSanitySubmissions = async (projectId) => {
  try {
    const colRef = collection(db, "projects", projectId, "misSanitySubmissions");
    const snap = await getDocs(colRef);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
  } catch (error) {
    console.error("getAllSanitySubmissions error:", error);
    return [];
  }
};

// Reviewer approve
export const reviewerApproveSanity = async (projectId, monthYear, email, comment, proofDocuments = [], unitAnnotations = {}) => {
  try {
    const docRef = doc(db, "projects", projectId, "misSanitySubmissions", monthYear);
    await updateDoc(docRef, {
      status: "PENDING_MANAGER",
      reviewerComment: comment || "",
      reviewerProofDocuments: proofDocuments,
      unitAnnotations,
      reviewedBy: email,
      reviewedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error("reviewerApproveSanity error:", error);
    return { success: false, error: error.message };
  }
};

// Reviewer reject
export const reviewerRejectSanity = async (projectId, monthYear, email, comment, proofDocuments = [], unitAnnotations = {}) => {
  try {
    const docRef = doc(db, "projects", projectId, "misSanitySubmissions", monthYear);
    await updateDoc(docRef, {
      status: "REJECTED_BY_REVIEWER",
      rejectionComment: comment || "",
      reviewerProofDocuments: proofDocuments,
      unitAnnotations,
      reviewedBy: email,
      reviewedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error("reviewerRejectSanity error:", error);
    return { success: false, error: error.message };
  }
};

// Manager approve
export const managerApproveSanity = async (projectId, monthYear, email, comment) => {
  try {
    const docRef = doc(db, "projects", projectId, "misSanitySubmissions", monthYear);
    await updateDoc(docRef, {
      status: "APPROVED",
      managerComment: comment || "",
      approvedBy: email,
      approvedAt: serverTimestamp(),
      sanityFrozen: true,
    });

    // ✅ Write cycle state to Firestore — MIS Analysis now unlocked
    const { setCycleState } = await import("./cycleStateService");
    await setCycleState(projectId, {
      sanityApproved: true,
      misAnalysisLocked: false,
      cycleMonth: monthYear,
      sanityApprovedAt: new Date().toISOString(),
      misApprovedAt: null,
    });

    return { success: true };
  } catch (error) {
    console.error("managerApproveSanity error:", error);
    return { success: false, error: error.message };
  }
};

// Manager reject
export const managerRejectSanity = async (projectId, monthYear, email, comment) => {
  try {
    const docRef = doc(db, "projects", projectId, "misSanitySubmissions", monthYear);
    await updateDoc(docRef, {
      status: "REJECTED_BY_MANAGER",
      rejectionComment: comment || "",
      approvedBy: email,
      approvedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error("managerRejectSanity error:", error);
    return { success: false, error: error.message };
  }
};

const getStoragePath = async (projectId) => {
  const snap = await getDoc(doc(db, "projects", projectId));
  const name = snap.data()?.projectName || snap.data()?.name || projectId;
  return name.trim();
};

export const uploadFrozenSanityFile = async (projectId, monthYear, file, projectName) => {
  try {
    const storagePath = projectName || await getStoragePath(projectId);
    const fileRef = ref(storage, `projects/${storagePath}/frozenSanityMIS/${monthYear}.xlsx`);
    await uploadBytes(fileRef, file, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const downloadURL = await getDownloadURL(fileRef);
    const metaRef = doc(db, "projects", projectId, "frozenSanityMIS", "metadata");
    await setDoc(metaRef, {
      monthYear,
      frozenAt: serverTimestamp(),
      frozenBy: "",
      downloadURL,
      fileName: `${monthYear}.xlsx`,
    }, { merge: true });
    return { success: true, downloadURL };
  } catch (error) {
    console.error("uploadFrozenSanityFile error:", error);
    return { success: false, error: error.message };
  }
};

// Get frozen sanity metadata
export const getFrozenSanityMetadata = async (projectId) => {
  try {
    const metaRef = doc(db, "projects", projectId, "frozenSanityMIS", "metadata");
    const snap = await getDoc(metaRef);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (error) {
    console.error("getFrozenSanityMetadata error:", error);
    return null;
  }
};

// Download frozen sanity file as File object
export const downloadFrozenSanityAsFile = async (projectId) => {
  try {
    const meta = await getFrozenSanityMetadata(projectId);
    if (!meta?.downloadURL) return { success: false };
    const response = await fetch(meta.downloadURL);
    const blob = await response.blob();
    const file = new File([blob], `${meta.monthYear}.xlsx`, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return { success: true, file, monthYear: meta.monthYear };
  } catch (error) {
    console.error("downloadFrozenSanityAsFile error:", error);
    return { success: false, error: error.message };
  }
};

// Check if sanity is approved
export const isSanityApproved = async (projectId, monthYear) => {
  try {
    const sub = await getSanitySubmission(projectId, monthYear);
    return sub?.status === "APPROVED";
  } catch (error) {
    return false;
  }
};

// Upload proof document (Maker or Reviewer)
export const uploadProofDocument = async (projectId, monthYear, file, uploadedBy = "maker", projectName) => {
  try {
    const storagePath = projectName || await getStoragePath(projectId);
    const ext = file.name.split('.').pop();
    const fileName = `${uploadedBy}_proof_${Date.now()}.${ext}`;
    const fileRef = ref(storage, `projects/${storagePath}/sanityProofs/${monthYear}/${fileName}`);
    await uploadBytes(fileRef, file, { contentType: file.type });
    const downloadURL = await getDownloadURL(fileRef);
    return { success: true, downloadURL, fileName };
  } catch (error) {
    console.error("uploadProofDocument error:", error);
    return { success: false, error: error.message };
  }
};
