import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/common/Layout";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import { SERVICES_CATALOG } from "../constants/servicesCatalog";
import { TOOLS_CATALOG } from "../constants/toolsCatalog";
import { ArrowLeft, FolderKanban, ChevronRight, Layers } from "lucide-react";

const ROLE_COLORS = {
  MAKER: "bg-blue-100 text-blue-700 border-blue-200",
  REVIEWER: "bg-amber-100 text-amber-700 border-amber-200",
  MANAGER: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function ServiceClients() {
  const { serviceKey } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { selectProject, selectedProject } = useProject();

  const service = SERVICES_CATALOG.find((s) => s.key === serviceKey);

  const clients = useMemo(() => {
  const roles = userProfile?.projectRoles || [];
  console.log("serviceKey from URL:", serviceKey);
  console.log("projectRoles:", JSON.stringify(roles, null, 2));
  return roles.filter((pr) => pr.serviceKey === serviceKey);
}, [userProfile, serviceKey]);

  const [selectedClient, setSelectedClient] = useState(null);
  const [openBundle, setOpenBundle] = useState(null);

  // Re-hydrate selectedClient from context when navigating back (e.g. Back button
  // from a tool page uses browser history, which remounts this component and
  // would otherwise reset the dropdown to empty even though a project is
  // already selected in context).
  useEffect(() => {
    if (selectedProject?.projectId && !selectedClient) {
      const match = clients.find((c) => c.projectId === selectedProject.projectId);
      if (match) setSelectedClient(match);
    }
  }, [selectedProject, clients]);

  const handleClientChange = (e) => {
  const projectId = e.target.value;
  const pr = clients.find((c) => c.projectId === projectId);
  setOpenBundle(null);
  if (!pr) {
    setSelectedClient(null);
    return;
  }
  setSelectedClient(pr);
  selectProject({
    projectId: pr.projectId,
    projectName: pr.projectName,
    role: pr.role,
    serviceLabel: pr.serviceLabel,
    serviceKey: pr.serviceKey,
    enabledModules: pr.enabledModules || [],
  });

  // TDD has exactly one form — skip the tools grid entirely and jump straight in.
  // Periodic Monitoring / LIE keep the normal multi-tool grid below.
  if (serviceKey === "tdd") {
    navigate("/tdd-service");
  }
};

  const enabledModules = selectedClient?.enabledModules || [];
  const role = selectedClient?.role;
  const isMaker = role === "MAKER";

  const availableTools = useMemo(() => {
  return TOOLS_CATALOG.filter((item) => {
    // If a tool declares which services it belongs to, it must match the
    // service page currently open. Tools with no `services` field are
    // unrestricted (shown on any service page, same as before).
    if (item.services && !item.services.includes(serviceKey)) {
      return false;
    }
    if (item.type === "bundle") {
      return item.children.some((c) => !c.moduleKey || enabledModules.includes(c.moduleKey));
    }
    return enabledModules.includes(item.moduleKey);
  });
}, [enabledModules, serviceKey]);

  const handleToolClick = (item) => {
    if (item.type === "bundle") {
      setOpenBundle(item.key);
      return;
    }
    const path = item.roleAware && isMaker ? "/escrow-upload" : item.path;
    navigate(path);
  };

  const bundle = openBundle ? TOOLS_CATALOG.find((t) => t.key === openBundle) : null;
  const bundleChildren = bundle
    ? bundle.children.filter((c) => {
        const moduleOk = !c.moduleKey || enabledModules.includes(c.moduleKey);
        const roleOk = !c.roleOnly || c.roleOnly.includes(role);
        return moduleOk && roleOk;
      })
    : [];

  return (
    <Layout title={service?.label || "Service"}>
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/services")}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-blue-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-blue-300 hover:bg-blue-50 transition"
        >
          <ArrowLeft size={13} /> Back
        </button>
        <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
          <span>SERVICES</span>
          <ChevronRight size={12} />
          <span className="text-gray-700 font-bold">{service?.label || serviceKey}</span>
        </div>
      </div>

      {/* Client selector */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-6 max-w-xl">
        <label className="block text-sm font-bold text-gray-700 mb-2">Select Client</label>
        {clients.length === 0 ? (
          <div className="text-center py-8">
            <FolderKanban size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm font-medium">
              No projects assigned to you for this service
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Contact your administrator if this looks wrong.
            </p>
          </div>
        ) : (
          <select
            value={selectedClient?.projectId || ""}
            onChange={handleClientChange}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 focus:outline-none focus:border-blue-400"
          >
            <option value="">-- Select a client --</option>
            {clients.map((c) => (
              <option key={c.projectId} value={c.projectId}>
                {c.projectName || c.projectId}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Available Tools grid */}
      {selectedClient && !openBundle && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FolderKanban size={18} className="text-blue-600" />
              <h3 className="font-black text-gray-800 text-base">
                {selectedClient.projectName} — Available Tools
              </h3>
              <span className="text-xs text-gray-400 font-medium">
                {availableTools.length} tool{availableTools.length !== 1 ? "s" : ""}
              </span>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${ROLE_COLORS[role] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
              {role}
            </span>
          </div>

          {availableTools.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm text-center py-14">
              <p className="text-gray-400 text-sm font-medium">
                No tools have been enabled for this project yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableTools.map((item) => (
                <button
                  key={item.key || item.path}
                  onClick={() => handleToolClick(item)}
                  className="bg-white border border-gray-200 rounded-2xl p-5 text-left hover:shadow-md hover:border-blue-300 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition">
                      <item.icon size={20} className="text-blue-600" />
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all mt-1" />
                  </div>
                  <p className="font-bold text-gray-900 text-sm">{item.label}</p>
                  {item.desc && (
                    <p className="text-gray-400 text-xs mt-1 leading-relaxed">{item.desc}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bundle drill-down */}
      {selectedClient && openBundle && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setOpenBundle(null)}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 transition"
            >
              <ArrowLeft size={13} /> Back
            </button>
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-blue-600" />
              <h3 className="font-black text-gray-800 text-base">{bundle.label}</h3>
            </div>
          </div>

          {bundleChildren.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm text-center py-14">
              <p className="text-gray-400 text-sm font-medium">
                No tools available here for your role yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {bundleChildren.map((child) => (
                <button
                  key={child.path}
                  onClick={() => navigate(child.path)}
                  className="bg-white border border-gray-200 rounded-2xl p-5 text-left hover:shadow-md hover:border-blue-300 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition">
                      <child.icon size={20} className="text-blue-600" />
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all mt-1" />
                  </div>
                  <p className="font-bold text-gray-900 text-sm">{child.label}</p>
                  {child.desc && (
                    <p className="text-gray-400 text-xs mt-1 leading-relaxed">{child.desc}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
