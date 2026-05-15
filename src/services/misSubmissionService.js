import { db, storage } from "./firebase";
import {
  doc, setDoc, getDoc, collection,
  query, where, getDocs, updateDoc, orderBy
} from "firebase/firestore";
import {
  ref, uploadBytes, getDownloadURL, getMetadata
} from "firebase/storage";

export const STATUS_CONFIG = {
  PENDING_REVIEW: { label: "Pending Review", color: "bg-amber-100 text-amber-700 border-amber-200" },
  PENDING_MANAGER: { label: "Pending Manager", color: "bg-blue-100 text-blue-700 border-blue-200" },
  APPROVED: { label: "Approved & Frozen", color: "bg-green-100 text-green-700 border-green-200" },
  REJECTED_BY_REVIEWER: { label: "Rejected by Reviewer", color: "bg-red-100 text-red-700 border-red-200" },
  REJECTED_BY_MANAGER: { label: "Rejected by Manager", color: "bg-red-100 text-red-700 border-red-200" },
};

export const submitMISForReview = async (projectId, monthYear, payload) => {
  try {
    const ref = doc(db, "projects", projectId, "misSubmissions", monthYear);
    await setDoc(ref, {
      ...payload,
      monthYear,
      status: "PENDING_REVIEW",
      submittedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const getMISSubmission = async (projectId, monthYear) => {
  const ref = doc(db, "projects", projectId, "misSubmissions", monthYear);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
};

export const getAllMISSubmissions = async (projectId) => {
  try {
    const ref = collection(db, "projects", projectId, "misSubmissions");
    const q = query(ref, orderBy("submittedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch {
    return [];
  }
};

export const getLastApprovedMIS = async (projectId) => {
  try {
    const ref = collection(db, "projects", projectId, "misSubmissions");
    const q = query(ref, where("status", "==", "APPROVED"), orderBy("submittedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.length > 0 ? snap.docs[0].data() : null;
  } catch {
    return null;
  }
};

export const reviewerApproveMIS = async (projectId, monthYear, reviewerEmail, comment) => {
  const ref = doc(db, "projects", projectId, "misSubmissions", monthYear);
  await updateDoc(ref, {
    status: "PENDING_MANAGER",
    reviewedBy: reviewerEmail,
    reviewedAt: new Date().toISOString(),
    reviewerComment: comment || "",
  });
};

export const reviewerRejectMIS = async (projectId, monthYear, reviewerEmail, comment) => {
  const ref = doc(db, "projects", projectId, "misSubmissions", monthYear);
  await updateDoc(ref, {
    status: "REJECTED_BY_REVIEWER",
    rejectedBy: reviewerEmail,
    rejectedAt: new Date().toISOString(),
    rejectionComment: comment || "",
  });
};

export const managerApproveMIS = async (projectId, monthYear, managerEmail, comment) => {
  const ref = doc(db, "projects", projectId, "misSubmissions", monthYear);
  await updateDoc(ref, {
    status: "APPROVED",
    frozen: true,
    approvedBy: managerEmail,
    approvedAt: new Date().toISOString(),
    managerComment: comment || "",
  });
};

export const managerRejectMIS = async (projectId, monthYear, managerEmail, comment) => {
  const ref = doc(db, "projects", projectId, "misSubmissions", monthYear);
  await updateDoc(ref, {
    status: "REJECTED_BY_MANAGER",
    rejectedBy: managerEmail,
    rejectedAt: new Date().toISOString(),
    rejectionComment: comment || "",
  });
};

// ── NEW: Upload frozen MIS file to Firebase Storage ──────────────────────────
export const uploadFrozenMISFile = async (projectId, monthYear, file) => {
  try {
    // Save as latest.xlsx (used as prev month next time)
    const latestRef = ref(storage, `projects/${projectId}/frozenMIS/latest.xlsx`);
    await uploadBytes(latestRef, file, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      customMetadata: {
        monthYear: monthYear,
        frozenAt: new Date().toISOString(),
      },
    });

    // Also save a historical copy with monthYear name
    const historyRef = ref(storage, `projects/${projectId}/frozenMIS/${monthYear}.xlsx`);
    await uploadBytes(historyRef, file, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      customMetadata: {
        monthYear: monthYear,
        frozenAt: new Date().toISOString(),
      },
    });

    const downloadURL = await getDownloadURL(latestRef);

    // Save metadata to Firestore so Maker can see it
    const metaDocRef = doc(db, "projects", projectId, "frozenMIS", "latest");
    await setDoc(metaDocRef, {
      monthYear,
      frozenAt: new Date().toISOString(),
      downloadURL,
      fileName: `${monthYear}.xlsx`,
    });

    return { success: true, downloadURL };
  } catch (err) {
    console.error("uploadFrozenMISFile error:", err);
    return { success: false, error: err.message };
  }
};

// ── NEW: Get frozen MIS metadata from Firestore ───────────────────────────────
export const getFrozenMISMetadata = async (projectId) => {
  try {
    const metaDocRef = doc(db, "projects", projectId, "frozenMIS", "latest");
    const snap = await getDoc(metaDocRef);
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
};

// ── NEW: Download frozen MIS file as File object (for FormData) ───────────────
export const downloadFrozenMISAsFile = async (projectId) => {
  try {
    const storageRef = ref(storage, `projects/${projectId}/frozenMIS/latest.xlsx`);
    const metadata = await getMetadata(storageRef);
    const monthYear = metadata.customMetadata?.monthYear || "previous";

    const { getBlob } = await import("firebase/storage");
    const blob = await getBlob(storageRef);
    
    const file = new File([blob], `${monthYear}.xlsx`, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return { success: true, file, monthYear };
  } catch (err) {
    console.error("downloadFrozenMISAsFile error:", err);
    return { success: false, file: null };
  }
};