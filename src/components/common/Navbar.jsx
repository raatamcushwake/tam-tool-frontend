import { useAuth } from "../../context/AuthContext";
import { useProject } from "../../context/ProjectContext";
import { Bell, Search, FolderKanban } from "lucide-react";

const ROLE_COLORS = {
  MAKER: "bg-blue-100 text-blue-700",
  REVIEWER: "bg-yellow-100 text-yellow-700",
  MANAGER: "bg-green-100 text-green-700",
  ADMIN: "bg-purple-100 text-purple-700",
};

export default function Navbar({ title = "Dashboard" }) {
  const { userProfile, currentUser, isAdmin } = useAuth();
  const { selectedProject } = useProject();

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
      {/* Left - Page Title */}
      <div>
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        <p className="text-gray-400 text-xs mt-0.5">{today}</p>
      </div>

      {/* Right - Search + Notifications + User */}
      <div className="flex items-center gap-4">

        {/* Single selected project badge */}
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
        <button className="relative w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200 transition">
          <Bell size={17} className="text-gray-600" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

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