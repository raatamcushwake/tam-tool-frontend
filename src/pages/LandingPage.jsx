import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import {
  BarChart3, FileSpreadsheet, DollarSign, ShieldCheck,
  ClipboardList, FolderKanban, ArrowRight, LogOut,
  TrendingUp, Shield, Zap, LayoutDashboard, Users, Settings
} from "lucide-react";

const features = [
  { icon: FileSpreadsheet, label: "MIS Sanity Check", desc: "Validate MIS data before analysis", color: "text-blue-600", bg: "bg-blue-50" },
  { icon: BarChart3, label: "MIS Analysis", desc: "Compare monthly MIS and extract delta", color: "text-indigo-600", bg: "bg-indigo-50" },
  { icon: DollarSign, label: "Cost Analysis", desc: "Track project costs and variances", color: "text-emerald-600", bg: "bg-emerald-50" },
  { icon: ShieldCheck, label: "Compliance Progress", desc: "Monitor compliance milestones", color: "text-purple-600", bg: "bg-purple-50" },
  { icon: ClipboardList, label: "Approval Tracker", desc: "Track approvals and sign-offs", color: "text-orange-600", bg: "bg-orange-50" },
  { icon: FolderKanban, label: "Project Progress", desc: "Monitor overall project status", color: "text-rose-600", bg: "bg-rose-50" },
];

const ROLE_COLORS = {
  MAKER: "bg-blue-100 text-blue-700 border-blue-200",
  REVIEWER: "bg-amber-100 text-amber-700 border-amber-200",
  MANAGER: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const ROLE_DESCRIPTIONS = {
  MAKER: "Submit and manage MIS data",
  REVIEWER: "Review and approve submissions",
  MANAGER: "Manage costs, compliance and progress",
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { userProfile, logout, isAdmin } = useAuth();
const { selectProject } = useProject();

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
    localStorage.removeItem("sanityPassed");
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md">
            <span className="text-white font-black text-xl">T</span>
          </div>
          <div>
            <p className="text-gray-900 font-bold text-base leading-tight">TAM Tool</p>
            <p className="text-gray-400 text-[11px]">Cushman & Wakefield Pvt. Ltd.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {userProfile?.name && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {userProfile.name[0].toUpperCase()}
                </span>
              </div>
              <div className="hidden md:block">
  <p className="text-gray-800 text-sm font-semibold leading-tight">{userProfile.name}</p>
  <p className="text-gray-400 text-xs">Cushman & Wakefield</p>
</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-xl transition-all">
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-blue-900 px-8 py-20 text-center">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-20 w-72 h-72 bg-blue-400 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-indigo-400 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold px-4 py-2 rounded-full mb-6 uppercase tracking-widest">
            <Zap size={12} /> Project Management Dashboard
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-white leading-tight mb-4">
            Welcome to<br />
            <span className="text-blue-400">TAM Tool</span>
          </h1>
          {userProfile?.name && (
            <p className="text-blue-200 text-xl font-medium mb-4">
              👋 Hello, {userProfile.name}!
            </p>
          )}
          <p className="text-slate-400 text-base max-w-2xl mx-auto">
            A comprehensive platform for MIS analysis, cost tracking, compliance monitoring, and project management — built for Cushman & Wakefield.
          </p>

          {/* Stats row */}
          <div className="flex items-center justify-center gap-8 mt-10">
            {[
              { icon: TrendingUp, label: "MIS Tracking", value: "Real-time" },
              { icon: Shield, label: "Compliance", value: "Automated" },
              { icon: Zap, label: "Analysis", value: "AI-Powered" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center mb-1">
                  <Icon size={18} className="text-blue-300" />
                </div>
                <p className="text-white font-bold text-sm">{value}</p>
                <p className="text-slate-400 text-xs">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Project Selector */}
      <div className="bg-gray-50 px-8 py-12">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-gray-900 font-black text-2xl">Select Your Project</h2>
            <p className="text-gray-500 text-sm mt-1">Choose a project to access your dashboard and tools</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {isAdmin ? (
  <div className="text-center py-12 px-6">
    <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
      <Shield size={28} className="text-purple-600" />
    </div>
    <p className="text-gray-800 font-bold text-base">Admin Access</p>
    <p className="text-gray-400 text-sm mt-1 mb-5">You have full access to all projects and settings.</p>
    <div className="flex flex-col gap-3">
      <button onClick={() => navigate("/dashboard")}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition">
        <LayoutDashboard size={16} /> Go to Dashboard
      </button>
      <button onClick={() => navigate("/admin")}
        className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition">
        <Users size={16} /> User Management
      </button>
      <button onClick={() => navigate("/admin/projects")}
        className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-3 rounded-xl transition">
        <Settings size={16} /> Project Assignment
      </button>
    </div>
  </div>
) : projectRoles.length === 0 ? (
  <div className="text-center py-12 px-6">
    <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
      <FolderKanban size={28} className="text-gray-400" />
    </div>
    <p className="text-gray-700 font-semibold">No projects assigned yet</p>
    <p className="text-gray-400 text-sm mt-1">Contact your administrator to get assigned.</p>
  </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {projectRoles.map((pr, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectProject(pr)}
                    className="w-full text-left px-6 py-5 hover:bg-blue-50 transition-all group flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition">
                        <FolderKanban size={22} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-gray-900 font-bold text-base">{pr.projectName || pr.projectId}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{ROLE_DESCRIPTIONS[pr.role] || "Access this project"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${ROLE_COLORS[pr.role] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {pr.role}
                      </span>
                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <ArrowRight size={14} className="text-white" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-white px-8 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-blue-600 text-xs font-black uppercase tracking-widest mb-2">Platform Features</p>
            <h3 className="text-gray-900 font-black text-3xl">Everything You Need</h3>
            <p className="text-gray-500 text-sm mt-2 max-w-lg mx-auto">A complete suite of tools for real estate project management and MIS analysis.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, label, desc, color, bg }) => (
              <div key={label} className="border border-gray-200 rounded-2xl p-6 hover:shadow-md hover:border-blue-200 transition-all group">
                <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon size={22} className={color} />
                </div>
                <p className="text-gray-900 font-bold text-sm">{label}</p>
                <p className="text-gray-500 text-xs mt-1 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 px-8 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">T</span>
            </div>
            <span className="text-gray-600 text-sm font-semibold">TAM Tool</span>
          </div>
          <p className="text-gray-400 text-xs">© 2026 Cushman & Wakefield Pvt. Ltd. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}