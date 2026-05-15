import { doc, setDoc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { auth } from "./firebase";

// ── Upload Inventory Sheet ────────────────────────────────────
export const uploadInventoryData = async (projectId, rows, file) => {
  try {
    // Save raw file to Storage
    const fileRef = ref(storage, `projects/${projectId}/reference/inventory_latest.xlsx`);
    await uploadBytes(fileRef, file);
    const fileUrl = await getDownloadURL(fileRef);

    // Save parsed data to Firestore
    await setDoc(doc(db, "projects", projectId, "referenceData", "inventory"), {
      rows,
      fileUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy: auth.currentUser?.uid || "unknown",
      uploadedByEmail: auth.currentUser?.email || "unknown",
    });
    return { success: true };
  } catch (err) {
    console.error("uploadInventoryData error:", err);
    return { success: false, error: err.message };
  }
};

// ── Upload Business Plan Sheet ────────────────────────────────
export const uploadBusinessPlanData = async (projectId, quarters, file) => {
  try {
    // Save raw file to Storage
    const fileRef = ref(storage, `projects/${projectId}/reference/businessplan_latest.xlsx`);
    await uploadBytes(fileRef, file);
    const fileUrl = await getDownloadURL(fileRef);

    // Save parsed data to Firestore
    await setDoc(doc(db, "projects", projectId, "referenceData", "businessPlan"), {
      quarters,
      fileUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy: auth.currentUser?.uid || "unknown",
      uploadedByEmail: auth.currentUser?.email || "unknown",
    });
    return { success: true };
  } catch (err) {
    console.error("uploadBusinessPlanData error:", err);
    return { success: false, error: err.message };
  }
};

// ── Get Inventory Data ────────────────────────────────────────
export const getInventoryData = async (projectId) => {
  try {
    const snap = await getDoc(doc(db, "projects", projectId, "referenceData", "inventory"));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("getInventoryData error:", err);
    return null;
  }
};

// ── Get Business Plan Data ────────────────────────────────────
export const getBusinessPlanData = async (projectId) => {
  try {
    const snap = await getDoc(doc(db, "projects", projectId, "referenceData", "businessPlan"));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("getBusinessPlanData error:", err);
    return null;
  }
};
// ── Upload MSP Data ───────────────────────────────────────────
export const uploadMSPData = async (projectId, rates, file) => {
  try {
    const fileRef = ref(storage, `projects/${projectId}/reference/msp_latest.xlsx`);
    await uploadBytes(fileRef, file);
    const fileUrl = await getDownloadURL(fileRef);
    await setDoc(doc(db, "projects", projectId, "referenceData", "msp"), {
      rates,
      fileUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy: auth.currentUser?.uid || "unknown",
      uploadedByEmail: auth.currentUser?.email || "unknown",
    });
    return { success: true };
  } catch (err) {
    console.error("uploadMSPData error:", err);
    return { success: false, error: err.message };
  }
};

// ── Get MSP Data ──────────────────────────────────────────────
export const getMSPData = async (projectId) => {
  try {
    const snap = await getDoc(doc(db, "projects", projectId, "referenceData", "msp"));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("getMSPData error:", err);
    return null;
  }
};