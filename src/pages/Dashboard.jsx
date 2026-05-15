import Layout from "../components/common/Layout";
import { useAuth } from "../context/AuthContext";
import {
  FolderKanban,
  FileSpreadsheet,
  CheckCircle,
  Clock,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

const stats = [
  {
    label: "Total Projects",
    value: "50+",
    icon: FolderKanban,
    color: "bg-blue-500",
    light: "bg-blue-50",
    text: "text-blue-600",
    change: "+3 this month",
  },
  {
    label: "MIS Submitted",
    value: "124",
    icon: FileSpreadsheet,
    color: "bg-violet-500",
    light: "bg-violet-50",
    text: "text-violet-600",
    change: "+12 this week",
  },
  {
    label: "Approved",
    value: "98",
    icon: CheckCircle,
    color: "bg-emerald-500",
    light: "bg-emerald-50",
    text: "text-emerald-600",
    change: "79% approval rate",
  },
  {
    label: "Pending Review",
    value: "26",
    icon: Clock,
    color: "bg-amber-500",
    light: "bg-amber-50",
    text: "text-amber-600",
    change: "Needs attention",
  },
];

const recentActivity = [
  { project: "Project Alpha", action: "MIS Submitted", by: "Maker", time: "2 mins ago", status: "pending" },
  { project: "Project Beta", action: "MIS Approved", by: "Manager", time: "1 hour ago", status: "approved" },
  { project: "Project Gamma", action: "MIS Rejected", by: "Reviewer", time: "3 hours ago", status: "rejected" },
  { project: "Project Delta", action: "MIS Submitted", by: "Maker", time: "5 hours ago", status: "pending" },
  { project: "Project Epsilon", action: "MIS Approved", by: "Manager", time: "1 day ago", status: "approved" },
];

const statusStyles = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export default function Dashboard() {
  const { userProfile, currentUser, isAdmin } = useAuth();

  console.log("=== AUTH DEBUG ===");
  console.log("currentUser uid:", currentUser?.uid);
  console.log("userProfile:", userProfile);
  console.log("isAdmin:", isAdmin);

  return (
    <Layout title="Dashboard">

      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 mb-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-2xl font-bold">
              Welcome back, {userProfile?.name || currentUser?.email?.split("@")[0]}! 👋
            </h2>
            <p className="text-blue-100 mt-1 text-sm">
              Here's what's happening across all your projects today.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-white/20 rounded-xl px-4 py-2">
            <TrendingUp size={18} className="text-white" />
            <span className="text-white text-sm font-medium">All Systems Operational</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-11 h-11 ${stat.light} rounded-xl flex items-center justify-center`}>
                <stat.icon size={22} className={stat.text} />
              </div>
              <span className="text-xs text-gray-400 font-medium">{stat.change}</span>
            </div>
            <p className="text-3xl font-bold text-gray-800">{stat.value}</p>
            <p className="text-gray-500 text-sm mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-base">Recent Activity</h3>
          <button className="text-blue-600 text-sm font-medium hover:underline">View All</button>
        </div>
        <div className="divide-y divide-gray-50">
          {recentActivity.map((item, index) => (
            <div key={index} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-gray-800 text-sm font-semibold">{item.project}</p>
                  <p className="text-gray-400 text-xs">{item.action} · by {item.by}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusStyles[item.status]}`}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </span>
                <span className="text-gray-400 text-xs">{item.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </Layout>
  );
}