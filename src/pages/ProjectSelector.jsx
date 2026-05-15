import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import { useNavigate } from "react-router-dom";
import { FolderKanban, LogOut } from "lucide-react";

const ROLE_COLORS = {
  MAKER: "bg-blue-100 text-blue-700 border-blue-200",
  REVIEWER: "bg-yellow-100 text-yellow-700 border-yellow-200",
  MANAGER: "bg-green-100 text-green-700 border-green-200",
};

const ROLE_DESCRIPTIONS = {
  MAKER: "Submit and manage MIS data for this project",
  REVIEWER: "Review and approve MIS submissions",
  MANAGER: "Manage costs, compliance and project progress",
};

export default function ProjectSelector() {
  const { userProfile, logout } = useAuth();
  const { selectProject } = useProject();
  const navigate = useNavigate();

  const projectRoles = userProfile?.projectRoles || [];

  const handleSelectProject = (pr) => {
    selectProject({
      projectId: pr.projectId,
      projectName: pr.projectName,
      role: pr.role,
    });
    navigate("/dashboard");
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-blue-600 rounded-2xl items-center justify-center mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl">T</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">TAM Tool</h1>
          <p className="text-gray-400 text-sm mt-1">Project Management Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-1">
            Select a Project
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            Welcome back, {userProfile?.name}! Choose a project to continue.
          </p>

          {projectRoles.length === 0 ? (
            <div className="text-center py-8">
              <FolderKanban size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">
                No projects assigned yet
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Please contact your administrator to get assigned to a project.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {projectRoles.map((pr, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectProject(pr)}
                  className="w-full text-left border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl p-4 transition-all duration-150 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition">
                        <FolderKanban size={18} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-gray-800 font-semibold text-sm">
                          {pr.projectName || pr.projectId}
                        </p>
                        <p className="text-gray-400 text-xs mt-0.5">
                          {ROLE_DESCRIPTIONS[pr.role] || "Access this project"}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${ROLE_COLORS[pr.role] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {pr.role}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 font-medium py-2.5 rounded-xl transition duration-200 text-sm mt-6"
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>

        <p className="text-gray-400 text-xs text-center mt-4">
          © 2026 TAM Tool. All rights reserved.
        </p>
      </div>
    </div>
  );
}