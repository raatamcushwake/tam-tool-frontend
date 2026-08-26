import { useNavigate } from "react-router-dom";
import Layout from "../components/common/Layout";
import { useAuth } from "../context/AuthContext";
import { SERVICES_CATALOG } from "../constants/servicesCatalog";
import {
  Shield, LayoutDashboard, Users, Settings, ChevronRight, Lock, Grid3x3
} from "lucide-react";

export default function Services() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const handleServiceClick = (service) => {
    if (!service.live) return;
    if (service.key === "tdd") {
      navigate("/tdd-service");
      return;
    }
    navigate(`/services/${service.key}`);
  };

  return (
    <Layout title="Services">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
          <Grid3x3 size={18} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-black text-gray-900">Browse our Services</h1>
          <p className="text-gray-400 text-xs">Select a service to access its dedicated tools and workflows</p>
        </div>
      </div>

      {isAdmin ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm max-w-xl mt-6">
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
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
          {SERVICES_CATALOG.map((service) => (
            <button
              key={service.key}
              onClick={() => handleServiceClick(service)}
              disabled={!service.live}
              className={`text-left border rounded-2xl p-6 transition-all group relative
                ${service.live
                  ? "border-gray-200 bg-white hover:shadow-md hover:border-blue-300 cursor-pointer"
                  : "border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${service.live ? "bg-blue-50 group-hover:bg-blue-100" : "bg-gray-100"} transition`}>
                  <service.icon size={22} className={service.live ? "text-blue-600" : "text-gray-400"} />
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${service.live ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}>
                  {service.live ? "● Live" : "Coming Soon"}
                </span>
              </div>
              <p className="text-gray-900 font-bold text-base">{service.label}</p>
              {service.live ? (
                <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold mt-2">
                  Click to access tools <ChevronRight size={13} />
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-gray-400 text-xs font-medium mt-2">
                  <Lock size={12} /> Under maintenance
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </Layout>
  );
}
