import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useProject } from "../../context/ProjectContext";
import {
  LayoutDashboard, FileSpreadsheet, BarChart3, DollarSign,
  ShieldCheck, ClipboardList, FolderKanban, LogOut,
  ChevronLeft, ChevronRight, Users, Settings, Upload
} from "lucide-react";

const navItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/mis-sanity", icon: FileSpreadsheet, label: "MIS Sanity Check" },
  { path: "/mis-analysis", icon: BarChart3, label: "MIS Analysis" },
  { path: "/cost-analysis", icon: DollarSign, label: "Cost Analysis" },
  { path: "/compliance", icon: ShieldCheck, label: "Compliance Progress" },
  { path: "/approvals", icon: ClipboardList, label: "Approval Tracker" },
  { path: "/projects", icon: FolderKanban, label: "Project Progress" },
];

const managerItems = [
  { path: "/reference-upload", icon: Upload, label: "Reference Upload" },
];

const adminItems = [
  { path: "/admin", icon: Users, label: "User Management" },
  { path: "/admin/projects", icon: Settings, label: "Project Assignment" },
];

export default function Sidebar({ collapsed, setCollapsed }) {
 const { logout, userProfile, currentUser, isAdmin } = useAuth();
const { selectedProject } = useProject();
const navigate = useNavigate();
  // Role checks
const currentRole = selectedProject?.role;
const isManager = currentRole === "MANAGER";
const isMaker = currentRole === "MAKER";

  // Safe localStorage read
  let sanityPassed = false;
  try {
    sanityPassed = JSON.parse(localStorage.getItem("sanityPassed")) || false;
  } catch {
    sanityPassed = false;
  }

  const handleLogout = async () => {
  localStorage.removeItem("sanityPassed");
  await logout();
  navigate("/");
};

  return (
    <div
      style={{ width: collapsed ? "64px" : "256px" }}
      className="fixed top-0 left-0 h-screen bg-slate-700 flex flex-col z-50 shadow-2xl transition-all duration-300 ease-in-out overflow-hidden"
    >
      {/* Logo + Toggle */}
      <div className="flex items-center justify-between h-16 px-3 border-b border-slate-600">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-sm">TAM Tool</h1>
              <p className="text-slate-400 text-xs">Dashboard</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-8 h-8 bg-slate-600 hover:bg-slate-500 rounded-lg flex items-center justify-center"
        >
          {collapsed
            ? <ChevronRight size={16} className="text-slate-300" />
            : <ChevronLeft size={16} className="text-slate-300" />
          }
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto">

        {/* Main Menu */}
        {!collapsed && (
          <p className="text-slate-500 text-xs font-semibold uppercase px-2 mb-3">
            Main Menu
          </p>
        )}

        <ul className="space-y-1">
          {navItems.map((item) => {
            const isMisAnalysis = item.path === "/mis-analysis";
            const isLocked = isMisAnalysis && isMaker && !sanityPassed && !isAdmin;

            return (
              <li key={item.path}>
                {isLocked ? (
                  <div
                    title="Complete Sanity Check first"
                    className={`flex items-center rounded-lg text-sm font-medium cursor-not-allowed opacity-40
                      ${collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5"}
                      text-slate-400`}
                  >
                    <item.icon size={18} />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                ) : (
                  <NavLink
                    to={item.path}
                    title={item.label}
                    className={({ isActive }) =>
                      `flex items-center rounded-lg text-sm font-medium transition
                      ${collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5"}
                      ${isActive
                        ? "bg-blue-600 text-white shadow-lg"
                        : "text-slate-400 hover:text-white hover:bg-slate-600"}`
                    }
                  >
                    <item.icon size={18} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                )}
              </li>
            );
          })}
        </ul>

        {/* Manager Menu */}
        {isManager && (
          <>
            {!collapsed && (
              <p className="text-slate-500 text-xs font-semibold uppercase px-2 mt-6 mb-3">
                Manager
              </p>
            )}
            {collapsed && <div className="border-t border-slate-600 my-3" />}

            <ul className="space-y-1">
              {managerItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    title={item.label}
                    className={({ isActive }) =>
                      `flex items-center rounded-lg text-sm font-medium transition
                      ${collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5"}
                      ${isActive
                        ? "bg-emerald-600 text-white shadow-lg"
                        : "text-slate-400 hover:text-white hover:bg-slate-600"}`
                    }
                  >
                    <item.icon size={18} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Admin Menu */}
        {isAdmin && (
          <>
            {!collapsed && (
              <p className="text-slate-500 text-xs font-semibold uppercase px-2 mt-6 mb-3">
                Admin
              </p>
            )}
            {collapsed && <div className="border-t border-slate-600 my-3" />}

            <ul className="space-y-1">
              {adminItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    title={item.label}
                    className={({ isActive }) =>
                      `flex items-center rounded-lg text-sm font-medium transition
                      ${collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5"}
                      ${isActive
                        ? "bg-purple-600 text-white shadow-lg"
                        : "text-slate-400 hover:text-white hover:bg-slate-600"}`
                    }
                  >
                    <item.icon size={18} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        )}

      </nav>

      {/* User + Logout */}
      <div className="px-2 py-3 border-t border-slate-600">
        {!collapsed && (
          <div className="flex items-center gap-2 px-2 py-2 mb-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">
                {(userProfile?.name || currentUser?.email || "U")[0].toUpperCase()}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <p className="text-white text-sm font-medium">
                  {userProfile?.name || "User"}
                </p>
                {isAdmin && (
                  <span className="bg-purple-600 text-white text-xs px-1 rounded">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs">
                {currentUser?.email}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className={`w-full flex items-center rounded-lg text-slate-400 hover:text-white hover:bg-red-600/20 text-sm font-medium
          ${collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5"}`}
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );
}