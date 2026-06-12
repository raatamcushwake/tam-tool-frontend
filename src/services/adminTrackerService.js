import { db } from "./firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

export const getAllProjectsWithSubmissions = async (projects) => {
  const results = [];
  for (const project of projects) {
    const projectId = project.projectId || project.id;
    const projectName = project.projectName || project.name || projectId;

    // Fetch all 3 submission types in parallel
    const [sanity, mis, cs, approval] = await Promise.all([
      getDocs(collection(db, "projects", projectId, "misSanitySubmissions")),
      getDocs(collection(db, "projects", projectId, "misSubmissions")),
      getDocs(collection(db, "projects", projectId, "csTrackerSubmissions")),
      getDocs(collection(db, "projects", projectId, "approvalSubmissions")),
    ]);

    const toRows = (snap, type) =>
      snap.docs.map(d => ({ ...d.data(), _type: type, _projectId: projectId, _projectName: projectName }));

    results.push(...toRows(sanity, "MIS Sanity"));
    results.push(...toRows(mis, "MIS"));
    results.push(...toRows(cs, "CS Tracker"));
    results.push(...toRows(approval, "Approval Tracker"));
  }
  // Sort all by submittedAt descending
  return results.sort((a, b) => {
    const ta = a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : new Date(a.submittedAt || 0).getTime();
    const tb = b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : new Date(b.submittedAt || 0).getTime();
    return tb - ta;
  });
};