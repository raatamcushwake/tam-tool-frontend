import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Scans all users' projectRoles arrays to find who is Reviewer/Manager
 * for a given project. Returns whether the project has a Reviewer who
 * is a different person from the Manager.
 */
export async function getProjectRoleMembers(projectId) {
  const snap = await getDocs(collection(db, "users"));
  let reviewer = null;
  let manager = null;

  snap.forEach(docSnap => {
    const data = docSnap.data();
    const roles = data.projectRoles || [];
    roles.forEach(r => {
      if (r.projectId !== projectId) return;
      if (r.role === "REVIEWER") reviewer = { email: data.email, uid: docSnap.id };
      if (r.role === "MANAGER") manager = { email: data.email, uid: docSnap.id };
    });
  });

  const hasDistinctReviewer = !!reviewer && (!manager || reviewer.email !== manager.email);

  return { hasDistinctReviewer, reviewer, manager };
}
