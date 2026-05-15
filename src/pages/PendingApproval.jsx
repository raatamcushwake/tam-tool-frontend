import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Clock, LogOut, Mail } from "lucide-react";

export default function PendingApproval() {
  const { logout, userProfile, currentUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-blue-600 rounded-2xl items-center justify-center mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl">T</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">TAM Tool</h1>
          <p className="text-gray-400 text-sm mt-1">Project Management Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">

          {/* Icon */}
          <div className="inline-flex w-16 h-16 bg-yellow-100 rounded-full items-center justify-center mb-4">
            <Clock size={32} className="text-yellow-500" />
          </div>

          <h2 className="text-xl font-bold text-gray-800 mb-2">
            Awaiting Admin Approval
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            Your account has been created successfully. Please wait for the
            administrator to approve your access.
          </p>

          {/* User Info Box */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">
              Registered As
            </p>
            <p className="text-gray-800 font-semibold text-sm">
              {userProfile?.name || "User"}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <Mail size={12} className="text-gray-400" />
              <p className="text-gray-400 text-xs">
                {currentUser?.email}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
            Status: Pending Approval
          </div>

          <p className="text-gray-400 text-xs mb-6">
            You will be notified once your account is approved. Contact your
            administrator if this takes too long.
          </p>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 font-medium py-3 rounded-xl transition duration-200 text-sm"
          >
            <LogOut size={16} />
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