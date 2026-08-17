import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";

const MODULES = [
  { label: "MIS Sanity",       collection: "misSanitySubmissions",  periodField: "monthYear" },
  { label: "MIS Analysis",     collection: "misSubmissions",        periodField: "monthYear" },
  { label: "Cost Analysis",    collection: "costSubmissions",       periodField: "period" },
  { label: "CS Tracker",       collection: "csTrackerSubmissions",  periodField: "period" },
  { label: "Approval Tracker", collection: "approvalSubmissions",   periodField: "period" },
];

// Returns notifications relevant to the given role
export const getNotificationsForRole = async (projectId, role) => {
  const notifications = [];

  for (const module of MODULES) {
    try {
      const snap = await getDocs(
        collection(db, "projects", projectId, module.collection)
      );

      snap.docs.forEach(d => {
        const data = d.data();
        const period = data[module.periodField] || d.id;
        const submittedBy = data.submittedBy?.split("@")[0] || "Maker";
        const reviewedBy = data.reviewedBy?.split("@")[0] || "Reviewer";
        const approvedBy = data.approvedBy?.split("@")[0] || "Manager";

        const getTime = (field) => {
          const val = data[field];
          if (!val) return null;
          if (val?.seconds) return new Date(val.seconds * 1000);
          return new Date(val);
        };

        // REVIEWER sees: new submissions from Maker (PENDING_REVIEW)
        if (role === "REVIEWER" && data.status === "PENDING_REVIEW") {
          notifications.push({
            id: `${module.collection}-${d.id}-pending_review`,
            module: module.label,
            period,
            message: `${submittedBy} submitted ${module.label} for your review`,
            time: getTime("submittedAt"),
            type: "action_needed",
          });
        }

        // MANAGER sees: reviewer approved, now needs manager action (PENDING_MANAGER)
        if (role === "MANAGER" && data.status === "PENDING_MANAGER") {
          notifications.push({
            id: `${module.collection}-${d.id}-pending_manager`,
            module: module.label,
            period,
            message: `${reviewedBy} approved ${module.label} — awaiting your final approval`,
            time: getTime("reviewedAt"),
            type: "action_needed",
          });
        }

        // MAKER sees: rejected by reviewer
        if (role === "MAKER" && data.status === "REJECTED_BY_REVIEWER") {
          notifications.push({
            id: `${module.collection}-${d.id}-rejected_reviewer`,
            module: module.label,
            period,
            message: `${reviewedBy} rejected your ${module.label} submission`,
            time: getTime("reviewedAt"),
            type: "rejected",
          });
        }

        // MAKER sees: rejected by manager
        if (role === "MAKER" && data.status === "REJECTED_BY_MANAGER") {
          notifications.push({
            id: `${module.collection}-${d.id}-rejected_manager`,
            module: module.label,
            period,
            message: `${approvedBy} (Manager) rejected your ${module.label} submission`,
            time: getTime("approvedAt"),
            type: "rejected",
          });
        }

        // MAKER sees: approved by manager
        if (role === "MAKER" && data.status === "APPROVED") {
          notifications.push({
            id: `${module.collection}-${d.id}-approved`,
            module: module.label,
            period,
            message: `Your ${module.label} for ${period} has been approved & frozen`,
            time: getTime("approvedAt"),
            type: "approved",
          });
        }

        // ADMIN sees: everything — any status change across all projects
        if (role === "ADMIN") {
          if (data.status === "PENDING_REVIEW") {
            notifications.push({
              id: `${module.collection}-${d.id}-admin-pending_review`,
              module: module.label,
              period,
              message: `${submittedBy} submitted ${module.label} (${period}) — awaiting reviewer`,
              time: getTime("submittedAt"),
              type: "action_needed",
            });
          }
          if (data.status === "PENDING_MANAGER") {
            notifications.push({
              id: `${module.collection}-${d.id}-admin-pending_manager`,
              module: module.label,
              period,
              message: `${reviewedBy} reviewed ${module.label} (${period}) — awaiting manager`,
              time: getTime("reviewedAt"),
              type: "action_needed",
            });
          }
          if (data.status === "REJECTED_BY_REVIEWER") {
            notifications.push({
              id: `${module.collection}-${d.id}-admin-rejected_reviewer`,
              module: module.label,
              period,
              message: `${reviewedBy} rejected ${module.label} (${period}) by ${submittedBy}`,
              time: getTime("reviewedAt"),
              type: "rejected",
            });
          }
          if (data.status === "REJECTED_BY_MANAGER") {
            notifications.push({
              id: `${module.collection}-${d.id}-admin-rejected_manager`,
              module: module.label,
              period,
              message: `Manager rejected ${module.label} (${period}) by ${submittedBy}`,
              time: getTime("approvedAt"),
              type: "rejected",
            });
          }
          if (data.status === "APPROVED") {
            notifications.push({
              id: `${module.collection}-${d.id}-admin-approved`,
              module: module.label,
              period,
              message: `${module.label} (${period}) by ${submittedBy} fully approved`,
              time: getTime("approvedAt"),
              type: "approved",
            });
          }
        }
      });
    } catch (err) {
      console.error(`Notification fetch failed for ${module.label}:`, err);
    }
  }

  // Sort newest first
  return notifications.sort((a, b) => (b.time || 0) - (a.time || 0));
};