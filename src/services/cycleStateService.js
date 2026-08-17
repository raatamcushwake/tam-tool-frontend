import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";


export const STAGES = {
  DRAFT: "DRAFT",
  SANITY_RUN: "SANITY_RUN",
  ANALYSIS_PENDING_REVIEW: "ANALYSIS_PENDING_REVIEW",
  ANALYSIS_PENDING_MANAGER: "ANALYSIS_PENDING_MANAGER",
  ANALYSIS_REJECTED: "ANALYSIS_REJECTED",
  APPROVED_FROZEN: "APPROVED_FROZEN",
};

export async function getCycleState(projectId) {
  try {
    const ref = doc(db, "projects", projectId, "cycleState", "current");
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("getCycleState error:", err);
    return null;
  }
}

export async function setCycleState(projectId, data) {
  try {
    const ref = doc(db, "projects", projectId, "cycleState", "current");
    await setDoc(ref, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
    return { success: true };
  } catch (err) {
    console.error("setCycleState error:", err);
    return { success: false };
  }
}