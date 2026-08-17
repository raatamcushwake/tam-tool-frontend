import { db, storage, auth } from "./firebase";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";

export { db, storage, auth };

// ─── Escrow Workflow Status ─────────────────────────────────
// A single field on projects/{projectId}/escrow/accounts drives
// who sees what, in what order, for the whole Escrow module.

export const ESCROW_STATUS = {
  MANAGER_SETUP: "MANAGER_SETUP",         // Manager uploads bank flow + sets allowed inflow/outflow
  MAKER_INPUT: "MAKER_INPUT",             // Maker uploads statements + tags everything
  REVIEWER_APPROVAL: "REVIEWER_APPROVAL", // Reviewer checks (read-only) and approves
  MANAGER_APPROVAL: "MANAGER_APPROVAL",   // Manager gives final approval
  COMPLETED: "COMPLETED",                 // Locked, Manager-only view
};

// Reads the current stage. Defaults to MANAGER_SETUP if nothing exists yet
// (i.e. this is a brand-new project that hasn't started the workflow).
export const getEscrowStatus = async (projectId) => {
  try {
    const snap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
    if (!snap.exists()) return ESCROW_STATUS.MANAGER_SETUP;
    return snap.data().workflowStatus || ESCROW_STATUS.MANAGER_SETUP;
  } catch (e) {
    console.error("Could not fetch escrow status:", e);
    return ESCROW_STATUS.MANAGER_SETUP;
  }
};

// Moves the workflow to a new stage. Also stamps who moved it and when,
// so you have a basic audit trail (visible later if you want to show it).
export const setEscrowStatus = async (projectId, status, actorEmail = "") => {
  try {
    await setDoc(
      doc(db, "projects", projectId, "escrow", "accounts"),
      {
        workflowStatus: status,
        [`${status}_by`]: actorEmail,
        [`${status}_at`]: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (e) {
    console.error("Could not update escrow status:", e);
    throw e;
  }
};

// ─── Escrow History (Archiving + live status tracking) ──────

// Archives the full current escrow cycle under a month key (e.g. "JAN 2026")
// and then wipes the live working docs so the next cycle starts clean.
// If an "active" PENDING history entry already exists for this cycle
// (created via ensureActiveHistoryEntry), it completes that same entry
// instead of creating a brand new one — so the doc ID stays stable
// throughout Pending → Completed.
export async function archiveAndResetEscrow(projectId, monthKey) {
  const accountsSnap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
  const documentsSnap = await getDoc(doc(db, "projects", projectId, "escrow", "documents"));
  const commentSnap = await getDoc(doc(db, "projects", projectId, "escrow", "workflowComment"));

  const accountsData = accountsSnap.exists() ? accountsSnap.data() : { accounts: {} };
  const accountNos = Object.keys(accountsData.accounts || {});
  const activeHistoryId = accountsData.activeHistoryId || null;

  const remarksByAcc = {};
  for (const accNo of accountNos) {
    const safeKey = accNo.replace(/[^a-zA-Z0-9]/g, "_");
    const remarksSnap = await getDoc(doc(db, "projects", projectId, "escrow", "remarks_" + safeKey));
    if (remarksSnap.exists()) {
      remarksByAcc[accNo] = remarksSnap.data();
    }
  }

  const finalData = {
    monthKey: monthKey.trim(),
    status: "COMPLETED",
    terminal: true,
    accounts: accountsData.accounts || {},
    accountDescriptions: accountsData.accountDescriptions || {},
    globalInflowRemarks: accountsData.globalInflowRemarks || [],
    globalOutflowRemarks: accountsData.globalOutflowRemarks || [],
    remarksByAcc,
    documents: documentsSnap.exists() ? documentsSnap.data() : null,
    finalComment: commentSnap.exists() ? commentSnap.data() : null,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (activeHistoryId) {
    // Complete the existing PENDING entry that's been tracking this cycle
    await setDoc(doc(db, "projects", projectId, "escrowHistory", activeHistoryId), finalData, { merge: true });
  } else {
    // Fallback for older cycles that started before this tracking existed
    const fallbackId = monthKey.trim().replace(/\s+/g, "_").toUpperCase() + "_" + Date.now();
    await setDoc(doc(db, "projects", projectId, "escrowHistory", fallbackId), finalData);
  }

  // Delete the live working docs so the next cycle starts clean.
  // NOTE: this includes escrow/accounts (which also stores workflowStatus
  // and activeHistoryId) — that's fine, because setEscrowStatus() below
  // recreates it immediately with { merge: true }.
  await deleteDoc(doc(db, "projects", projectId, "escrow", "accounts"));
  await deleteDoc(doc(db, "projects", projectId, "escrow", "period"));
  await deleteDoc(doc(db, "projects", projectId, "escrow", "documents"));
  await deleteDoc(doc(db, "projects", projectId, "escrow", "lastResults"));
  await deleteDoc(doc(db, "projects", projectId, "escrow", "workflowComment"));
  for (const accNo of accountNos) {
    const safeKey = accNo.replace(/[^a-zA-Z0-9]/g, "_");
    await deleteDoc(doc(db, "projects", projectId, "escrow", "remarks_" + safeKey));
  }

  // Recreate escrow/accounts with a fresh workflowStatus for the next month
  await setEscrowStatus(projectId, ESCROW_STATUS.MANAGER_SETUP, "system");
}

// Creates a fresh "PENDING" history entry for a new cycle attempt, unless
// one is already live. Called whenever Manager sends to Maker, or when
// Maker resubmits to Reviewer after a rejection cleared the previous entry.
export async function ensureActiveHistoryEntry(projectId) {
  try {
    const accSnap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
    const activeId = accSnap.exists() ? accSnap.data().activeHistoryId : null;

    if (activeId) {
      const activeSnap = await getDoc(doc(db, "projects", projectId, "escrowHistory", activeId));
      if (activeSnap.exists() && !activeSnap.data().terminal) {
        return activeId; // already have a live pending entry, nothing to do
      }
    }

    const newRef = doc(collection(db, "projects", projectId, "escrowHistory"));
    await setDoc(newRef, {
      monthKey: "",
      status: "PENDING",
      terminal: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(
      doc(db, "projects", projectId, "escrow", "accounts"),
      { activeHistoryId: newRef.id },
      { merge: true }
    );
    return newRef.id;
  } catch (e) {
    console.error("Could not ensure active history entry:", e);
    return null;
  }
}

// Marks the current active history entry as rejected (terminal), and
// clears the pointer so the next resubmission starts a fresh entry.
export async function markActiveHistoryRejected(projectId, rejectedBy) {
  try {
    const accSnap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
    const activeId = accSnap.exists() ? accSnap.data().activeHistoryId : null;
    if (!activeId) return;

    const accountsData = accSnap.exists() ? accSnap.data() : { accounts: {} };
    const accountNos = Object.keys(accountsData.accounts || {});

    const documentsSnap = await getDoc(doc(db, "projects", projectId, "escrow", "documents"));
    const commentSnap = await getDoc(doc(db, "projects", projectId, "escrow", "workflowComment"));

    const remarksByAcc = {};
    for (const accNo of accountNos) {
      const safeKey = accNo.replace(/[^a-zA-Z0-9]/g, "_");
      const remarksSnap = await getDoc(doc(db, "projects", projectId, "escrow", "remarks_" + safeKey));
      if (remarksSnap.exists()) {
        remarksByAcc[accNo] = remarksSnap.data();
      }
    }

    await setDoc(
      doc(db, "projects", projectId, "escrowHistory", activeId),
      {
        status: rejectedBy === "REVIEWER" ? "REJECTED_BY_REVIEWER" : "REJECTED_BY_MANAGER",
        rejectedBy,
        terminal: true,
        accounts: accountsData.accounts || {},
        accountDescriptions: accountsData.accountDescriptions || {},
        globalInflowRemarks: accountsData.globalInflowRemarks || [],
        globalOutflowRemarks: accountsData.globalOutflowRemarks || [],
        remarksByAcc,
        documents: documentsSnap.exists() ? documentsSnap.data() : null,
        finalComment: commentSnap.exists() ? commentSnap.data() : null,
        rejectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    await setDoc(
      doc(db, "projects", projectId, "escrow", "accounts"),
      { activeHistoryId: null },
      { merge: true }
    );
  } catch (e) {
    console.error("Could not mark history entry rejected:", e);
  }
}

// Updates the monthKey label on the currently active history entry —
// called when the Maker types and saves the Escrow Period month.
export async function updateActiveHistoryMonth(projectId, monthKey) {
  try {
    const accSnap = await getDoc(doc(db, "projects", projectId, "escrow", "accounts"));
    const activeId = accSnap.exists() ? accSnap.data().activeHistoryId : null;
    if (!activeId) return;

    await setDoc(
      doc(db, "projects", projectId, "escrowHistory", activeId),
      { monthKey, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (e) {
    console.error("Could not update history entry month:", e);
  }
}

// Returns list of history entries (Pending, Rejected, Completed), newest first
export async function getEscrowHistoryList(projectId) {
  const snap = await getDocs(collection(db, "projects", projectId, "escrowHistory"));
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));

  // Backward-compatibility fix: older history entries (created before the
  // status/terminal fields existed on every write) may be missing `status`
  // entirely. Without this, they fall through to the default "Pending"
  // badge and become un-clickable everywhere, even if they were actually
  // completed or rejected. Infer the correct status from whatever fields
  // the entry actually has.
  list.forEach(item => {
    if (!item.status) {
      if (item.completedAt) {
        item.status = "COMPLETED";
      } else if (item.rejectedAt) {
        item.status = item.rejectedBy === "MANAGER" ? "REJECTED_BY_MANAGER" : "REJECTED_BY_REVIEWER";
      } else {
        item.status = "PENDING";
      }
    }
  });

  list.sort((a, b) => {
    const aKey = a.completedAt || a.updatedAt || a.createdAt || "";
    const bKey = b.completedAt || b.updatedAt || b.createdAt || "";
    return bKey.localeCompare(aKey);
  });
  return list;
}

// Returns one archived month's full snapshot (only meaningful for
// COMPLETED entries — Pending/Rejected entries have no remarksByAcc yet)
export async function getEscrowHistoryMonth(projectId, monthKey) {
  const snap = await getDoc(doc(db, "projects", projectId, "escrowHistory", monthKey));
  return snap.exists() ? snap.data() : null;
}