import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import Layout from "../components/common/Layout";
import axios from "axios";
import { Users, FolderKanban, CheckCircle, Clock, XCircle } from "lucide-react";

export default function AdminPanel() {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingUid, setUpdatingUid] = useState(null);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/auth/users`);
      setUsers(res.data);
    } catch (err) {
      console.error("Error fetching users:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const updateStatus = async (uid, status) => {
    setUpdatingUid(uid);
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/api/auth/user/${uid}/status`,
        { status }
      );
      await fetchUsers();
    } catch (err) {
      console.error("Error updating status:", err);
    }
    setUpdatingUid(null);
  };

  const pendingUsers = users.filter(u => u.status === "PENDING");
  const activeUsers = users.filter(u => u.status === "ACTIVE" || u.status === "active");

  const statusBadge = (status) => {
    if (status === "PENDING" || status === "pending")
      return <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-medium px-2.5 py-1 rounded-full"><Clock size={11} /> Pending</span>;
    if (status === "ACTIVE" || status === "active")
      return <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full"><CheckCircle size={11} /> Active</span>;
    if (status === "REJECTED" || status === "rejected")
      return <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full"><XCircle size={11} /> Rejected</span>;
    return <span className="text-xs text-gray-400">{status}</span>;
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Admin Panel</h1>
          <p className="text-gray-400 text-sm mt-1">Manage users and their access</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Users size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{users.length}</p>
                <p className="text-gray-400 text-xs">Total Users</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                <Clock size={20} className="text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{pendingUsers.length}</p>
                <p className="text-gray-400 text-xs">Pending Approval</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{activeUsers.length}</p>
                <p className="text-gray-400 text-xs">Active Users</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Users */}
        {pendingUsers.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">Pending Approvals</h2>
              <p className="text-gray-400 text-xs mt-0.5">These users are waiting for your approval</p>
            </div>
            <div className="divide-y divide-gray-50">
              {pendingUsers.map(user => (
                <div key={user.uid} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 font-semibold text-sm">
                        {(user.name || user.email || "U")[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-gray-800 text-sm font-semibold">{user.name}</p>
                      <p className="text-gray-400 text-xs">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(user.status)}
                    <button
                      onClick={() => updateStatus(user.uid, "ACTIVE")}
                      disabled={updatingUid === user.uid}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => updateStatus(user.uid, "REJECTED")}
                      disabled={updatingUid === user.uid}
                      className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium px-3 py-1.5 rounded-lg transition"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Users */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-800">All Users</h2>
            <p className="text-gray-400 text-xs mt-0.5">Everyone registered in the system</p>
          </div>
          {loading ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">Loading users...</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {users.map(user => (
                <div key={user.uid} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-sm">
                        {(user.name || user.email || "U")[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-gray-800 text-sm font-semibold">{user.name}</p>
                      <p className="text-gray-400 text-xs">{user.email}</p>
                      {user.phone && (
                        <p className="text-gray-400 text-xs">{user.phone}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.isAdmin && (
                      <span className="bg-purple-100 text-purple-700 text-xs font-medium px-2.5 py-1 rounded-full">Admin</span>
                    )}
                    {statusBadge(user.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}