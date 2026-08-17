import { db, storage } from "./firebase";
import {
  doc, setDoc, getDoc, collection,
  query, where, getDocs, updateDoc, orderBy, arrayUnion
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

// ── Helper: get human-readable storage path from project name ─
const getStoragePath = async (projectId) => {
  const snap = await getDoc(doc(db, "projects", projectId));
  const name = snap.data()?.projectName || snap.data()?.name || projectId;
  return name.trim();
};

// ── Submit MIS for Review ─────────────────────────────────────
export const submitMISForReview = async (projectId, monthYear, payload) => {
  try {
    const docRef = doc(db, "projects", projectId, "misSubmissions", monthYear);
    await setDoc(docRef, {
      ...payload,
      monthYear,
      status: "PENDING_REVIEW",
      submittedAt: new Date().toISOString(),
      commentHistory: arrayUnion({
        role: "MAKER",
        email: payload.submittedBy,
        comment: payload.makerComment || "",
        action: "SUBMITTED",
        at: new Date().toISOString(),
      }),
    }, { merge: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ── Get Single MIS Submission ─────────────────────────────────
export const getMISSubmission = async (projectId, monthYear) => {
  const docRef = doc(db, "projects", projectId, "misSubmissions", monthYear);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() : null;
};

// ── Get All MIS Submissions ───────────────────────────────────
export const getAllMISSubmissions = async (projectId) => {
  try {
    const colRef = collection(db, "projects", projectId, "misSubmissions");
    const q = query(colRef, orderBy("submittedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch {
    return [];
  }
};

// ── Get Last Approved MIS ─────────────────────────────────────
// ── Get Last Approved MIS ─────────────────────────────────────
export const getLastApprovedMIS = async (projectId) => {
  try {
    const colRef = collection(db, "projects", projectId, "misSubmissions");
    const q = query(colRef, where("status", "==", "APPROVED"));
    const snap = await getDocs(q);
    if (snap.docs.length === 0) return null;
    const sorted = snap.docs
      .map(d => d.data())
      .sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt));
    return sorted[0];
  } catch (err) {
    console.error("getLastApprovedMIS error:", err);
    return null;
  }
};

// ── Reviewer Approve ──────────────────────────────────────────
export const reviewerApproveMIS = async (projectId, monthYear, reviewerEmail, comment) => {
  const docRef = doc(db, "projects", projectId, "misSubmissions", monthYear);
  await updateDoc(docRef, {
    status: "PENDING_MANAGER",
    reviewedBy: reviewerEmail,
    reviewedAt: new Date().toISOString(),
    reviewerComment: comment || "",
    commentHistory: arrayUnion({
      role: "REVIEWER",
      email: reviewerEmail,
      comment: comment || "",
      action: "APPROVED",
      at: new Date().toISOString(),
    }),
  });
};

// ── Reviewer Reject ───────────────────────────────────────────
export const reviewerRejectMIS = async (projectId, monthYear, reviewerEmail, comment) => {
  const docRef = doc(db, "projects", projectId, "misSubmissions", monthYear);
  await updateDoc(docRef, {
    status: "REJECTED_BY_REVIEWER",
    rejectedBy: reviewerEmail,
    rejectedAt: new Date().toISOString(),
    rejectionComment: comment || "",
    commentHistory: arrayUnion({
      role: "REVIEWER",
      email: reviewerEmail,
      comment: comment || "",
      action: "REJECTED",
      at: new Date().toISOString(),
    }),
  });
};

// ── Manager Approve ───────────────────────────────────────────
export const managerApproveMIS = async (projectId, monthYear, managerEmail, comment) => {
  const docRef = doc(db, "projects", projectId, "misSubmissions", monthYear);
  await updateDoc(docRef, {
    status: "APPROVED",
    frozen: true,
    approvedBy: managerEmail,
    approvedAt: new Date().toISOString(),
    managerComment: comment || "",
    commentHistory: arrayUnion({
      role: "MANAGER",
      email: managerEmail,
      comment: comment || "",
      action: "APPROVED",
      at: new Date().toISOString(),
    }),
  });

  // 🔒 Lock MIS Analysis again — cycle complete
  const { setCycleState } = await import("./cycleStateService");
  await setCycleState(projectId, {
    sanityApproved: false,
    misAnalysisLocked: true,
    misApprovedMonth: monthYear,
    misApprovedAt: new Date().toISOString(),
  });
};

// ── Manager Reject ────────────────────────────────────────────
export const managerRejectMIS = async (projectId, monthYear, managerEmail, comment) => {
  const docRef = doc(db, "projects", projectId, "misSubmissions", monthYear);
  await updateDoc(docRef, {
    status: "REJECTED_BY_MANAGER",
    rejectedBy: managerEmail,
    rejectedAt: new Date().toISOString(),
    rejectionComment: comment || "",
    commentHistory: arrayUnion({
      role: "MANAGER",
      email: managerEmail,
      comment: comment || "",
      action: "REJECTED",
      at: new Date().toISOString(),
    }),
  });
};

// ── Upload Frozen MIS File ────────────────────────────────────
export const uploadFrozenMISFile = async (projectId, monthYear, file) => {
  try {
    const storagePath = await getStoragePath(projectId);

    const latestRef = ref(storage, `projects/${storagePath}/frozenMIS/latest.xlsx`);
    await uploadBytes(latestRef, file, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      customMetadata: {
        monthYear: monthYear,
        frozenAt: new Date().toISOString(),
      },
    });

    const historyRef = ref(storage, `projects/${storagePath}/frozenMIS/${monthYear}.xlsx`);
    await uploadBytes(historyRef, file, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      customMetadata: {
        monthYear: monthYear,
        frozenAt: new Date().toISOString(),
      },
    });

    const downloadURL = await getDownloadURL(latestRef);

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

// ── Get Frozen MIS Metadata ───────────────────────────────────
export const getFrozenMISMetadata = async (projectId) => {
  try {
    const metaDocRef = doc(db, "projects", projectId, "frozenMIS", "latest");
    const snap = await getDoc(metaDocRef);
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
};

// ── Download Frozen MIS As File ───────────────────────────────
export const downloadFrozenMISAsFile = async (projectId) => {
  try {
    const storagePath = await getStoragePath(projectId);

    const storageRef = ref(storage, `projects/${storagePath}/frozenMIS/latest.xlsx`);
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
// ── Get All Approved MIS (for trend charts) ───────────────────
export const getAllApprovedMIS = async (projectId) => {
  try {
    const colRef = collection(db, "projects", projectId, "misSubmissions");
    const q = query(colRef, where("status", "==", "APPROVED"));
    const snap = await getDocs(q);
    if (snap.docs.length === 0) return [];
    return snap.docs
      .map(d => d.data())
      .sort((a, b) => new Date(a.approvedAt) - new Date(b.approvedAt)); // oldest first for charts
  } catch (err) {
    console.error("getAllApprovedMIS error:", err);
    return [];
  }
};
