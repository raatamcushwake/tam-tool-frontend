import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import Layout from "../components/common/Layout";
import { getEscrowHistoryList } from "../services/escrow";
import { Landmark, Clock, ChevronRight, AlertCircle } from "lucide-react";

export default function EscrowHistory() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { selectedProject } = useProject();
  const projectId = selectedProject?.projectId;

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);

  const role = userProfile?.projectRoles?.find(r => r.projectId === projectId)?.role;

  useEffect(() => {
    const load = async () => {
      if (!projectId) return;
      setLoading(true);
      const list = await getEscrowHistoryList(projectId);
      setHistory(list);
      setLoading(false);
    };
    load();
  }, [projectId]);

  if (!["MANAGER", "MAKER", "REVIEWER"].includes(role)) {
    return (
      <Layout title="Escrow History">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
            <h3 className="text-gray-700 font-bold text-lg">Access Denied</h3>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title="Escrow History">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400 text-sm">Loading history...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Escrow History">
      <div className="max-w-full mx-auto px-8">
        <h3 className="font-bold text-gray-800 text-lg mb-1">Completed Escrow Cycles</h3>
        <p className="text-gray-400 text-xs mb-6">Click a month to view its approved Escrow Summary & Cumulative Summary.</p>

        {history.length === 0 ? (
          <div className="text-center py-16">
            <Clock size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No completed escrow cycles yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map(item => (
              <button
                key={item.id}
                onClick={() => navigate(`/escrow-analysis?month=${item.id}`)}
                className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:border-indigo-300 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <Landmark size={18} className="text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-gray-800 text-sm">{item.monthKey}</p>
                    <p className="text-gray-400 text-xs">
                      Completed on {new Date(item.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}