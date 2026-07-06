import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useProject } from "../../context/ProjectContext";
import { useNavigate } from "react-router-dom";
import { Bell, Search, FolderKanban, X, CheckCircle, AlertCircle, Clock, User, KeyRound } from "lucide-react";
import { getNotificationsForRole } from "../../services/notificationService";

const ROLE_COLORS = {
  MAKER: "bg-blue-100 text-blue-700",
  REVIEWER: "bg-yellow-100 text-yellow-700",
  MANAGER: "bg-green-100 text-green-700",
  ADMIN: "bg-purple-100 text-purple-700",
};

const MODULE_COLORS = {
  "MIS Sanity":       "bg-blue-100 text-blue-700",
  "MIS Analysis":     "bg-indigo-100 text-indigo-700",
  "Cost Analysis":    "bg-emerald-100 text-emerald-700",
  "CS Tracker":       "bg-purple-100 text-purple-700",
  "Approval Tracker": "bg-orange-100 text-orange-700",
};

const formatTime = (date) => {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

export default function Navbar({ title = "Dashboard" }) {
  const { userProfile, currentUser, isAdmin } = useAuth();
  const { selectedProject } = useProject();

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dismissedNotifications") || "[]"); }
    catch { return []; }
  });

  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const userMenuRef = useRef(null);
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Fetch notifications when project changes
  useEffect(() => {
    // ADMIN: fetch all projects and collect notifications from each
    if (isAdmin) {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      fetch(`${apiUrl}/api/projects`)
        .then(r => r.json())
        .then(async (projects) => {
          const all = [];
          for (const project of projects) {
            const projectId = project.projectId || project.id;
            if (!projectId) {
              console.warn("Skipping project with no ID (notifications):", project);
              continue;
            }
            const notifs = await getNotificationsForRole(projectId, "ADMIN");
            // Tag each notification with project name
            notifs.forEach(n => {
              n.projectName = project.name || project.projectName || projectId;
            });
            all.push(...notifs);
          }
          // Sort newest first
          all.sort((a, b) => (b.time || 0) - (a.time || 0));
          setNotifications(all);
        })
        .finally(() => setLoading(false));
      return;
    }

    // Non-admin: fetch for selected project only
    const projectId = selectedProject?.projectId;
    const role = selectedProject?.role;
    if (!projectId || !role) return;

    setLoading(true);
    getNotificationsForRole(projectId, role)
      .then(setNotifications)
      .finally(() => setLoading(false));
  }, [selectedProject, isAdmin]);

  // Close panel on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        bellRef.current && !bellRef.current.contains(e.target)
      ) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const visibleNotifications = notifications.filter(n => !dismissed.includes(n.id));
  const unreadCount = visibleNotifications.length;

  const dismissOne = (id) => {
    const updated = [...dismissed, id];
    setDismissed(updated);
    localStorage.setItem("dismissedNotifications", JSON.stringify(updated));
  };

  const dismissAll = () => {
    const updated = [...dismissed, ...visibleNotifications.map(n => n.id)];
    setDismissed(updated);
    localStorage.setItem("dismissedNotifications", JSON.stringify(updated));
  };

  const getIcon = (type) => {
    if (type === "approved") return <CheckCircle size={14} className="text-green-500 shrink-0 mt-0.5" />;
    if (type === "rejected") return <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />;
    return <Clock size={14} className="text-amber-500 shrink-0 mt-0.5" />;
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
      {/* Left */}
      <div>
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        <p className="text-gray-400 text-xs mt-0.5">{today}</p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">

        {/* Project badge */}
        {!isAdmin && selectedProject && (
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
              <FolderKanban size={13} className="text-gray-400" />
              <span className="text-gray-700 text-xs font-medium">
                {selectedProject.projectName || selectedProject.projectId}
              </span>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${ROLE_COLORS[selectedProject.role] || "bg-gray-100 text-gray-600"}`}>
                {selectedProject.role}
              </span>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="hidden md:flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
          <Search size={15} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent text-sm text-gray-600 outline-none w-40 placeholder-gray-400"
          />
        </div>

        {/* Notification Bell */}
        <div className="relative">
          <button
            ref={bellRef}
            onClick={() => setShowNotifications(p => !p)}
            className="relative w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200 transition"
          >
            <Bell size={17} className="text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-black">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Panel */}
          {showNotifications && (
            <div
              ref={panelRef}
              className="absolute right-0 top-12 w-96 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div>
                  <h3 className="font-black text-gray-800 text-sm">Notifications</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {isAdmin ? "ADMIN · All Projects" : `${selectedProject?.role} · ${selectedProject?.projectName || ""}`}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={dismissAll}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 transition"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="max-h-[420px] overflow-y-auto">
                {loading ? (
                  <div className="py-10 text-center">
                    <p className="text-gray-400 text-sm animate-pulse">Loading notifications...</p>
                  </div>
                ) : visibleNotifications.length === 0 ? (
                  <div className="py-12 text-center px-6">
                    <Bell size={32} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm font-semibold">All caught up!</p>
                    <p className="text-gray-300 text-xs mt-1">No pending actions for you.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {visibleNotifications.map((n) => (
                      <div
                        key={n.id}
                        className={`px-5 py-4 flex gap-3 hover:bg-gray-50 transition group
                          ${n.type === "action_needed" ? "bg-amber-50/30" : ""}
                          ${n.type === "rejected" ? "bg-red-50/20" : ""}
                          ${n.type === "approved" ? "bg-green-50/20" : ""}
                        `}
                      >
                        {getIcon(n.type)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${MODULE_COLORS[n.module] || "bg-gray-100 text-gray-600"}`}>
                              {n.module}
                            </span>
                            {isAdmin && n.projectName && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                {n.projectName}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400">{n.period}</span>
                          </div>
                          <p className="text-xs text-gray-700 font-medium leading-relaxed">{n.message}</p>
                          {n.time && (
                            <p className="text-[10px] text-gray-400 mt-1">{formatTime(n.time)}</p>
                          )}
                        </div>
                        <button
                          onClick={() => dismissOne(n.id)}
                          className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-gray-500 shrink-0"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {visibleNotifications.length > 0 && (
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">
                    {unreadCount} pending action{unreadCount !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow">
            <span className="text-white text-sm font-bold">
              {(userProfile?.name || currentUser?.email || "U")[0].toUpperCase()}
            </span>
          </div>
          <div className="hidden md:block">
            <p className="text-gray-800 text-sm font-semibold leading-none">
              {userProfile?.name || "User"}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">
              {isAdmin ? "Administrator" : selectedProject?.role || "User"}
            </p>
          </div>
        </div>

      </div>
    </header>
  );
}
