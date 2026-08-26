import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Layout from "../components/common/Layout";
import { useAuth } from "../context/AuthContext";
import { FolderKanban, ChevronRight, LayoutDashboard, Loader2 } from "lucide-react";

const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function Overview() {
  const navigate = useNavigate();
  const { userProfile, isManager, isAdmin, isExecutive, isBusinessHead, tamRegion } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingKey, setClosingKey] = useState(null);

  const projectRoles = userProfile?.projectRoles || [];
  const isRegionScoped = isExecutive || isBusinessHead;

  const fetchProjects = () => {
    axios
      .get(`${apiUrl}/api/projects`)
      .then((res) => setProjects(res.data || []))
      .catch((err) => console.error("Error fetching projects:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCloseService = async (projectId, serviceKey) => {
    if (!window.confirm("Close this service for the project? It will be marked closed.")) return;
    setClosingKey(`${projectId}-${serviceKey}`);
    try {
      await axios.patch(`${apiUrl}/api/projects/${projectId}/close-service`, { serviceKey });
      fetchProjects();
    } catch (err) {
      console.error("Error closing service:", err);
    }
    setClosingKey(null);
  };

  const handleReopenService = async (projectId, serviceKey) => {
    setClosingKey(`${projectId}-${serviceKey}`);
    try {
      await axios.patch(`${apiUrl}/api/projects/${projectId}/reopen-service`, { serviceKey });
      fetchProjects();
    } catch (err) {
      console.error("Error reopening service:", err);
    }
    setClosingKey(null);
  };

  const projectsById = useMemo(() => {
    const map = {};
    projects.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [projects]);

  // Executive / Business Head: one row per service, per project, for every
  // project whose region is in their assigned tamRegion list — not tied to projectRoles at all.
  const regionRows = useMemo(() => {
    if (!isRegionScoped) return [];
    // Business Head sees every project across every region.
    // Executive sees only projects whose region is in their tamRegion list.
    const scopedProjects = isBusinessHead
      ? projects
      : projects.filter((p) => tamRegion.includes(p.region));

    return scopedProjects
      .flatMap((project) => {
        const closedServices = project.closedServices || [];
        const serviceKeys = Object.keys(project.enabledServices || {});

        // Newer projects: multiple services stored in enabledServices/codes maps
        if (serviceKeys.length > 0) {
          return serviceKeys.map((serviceKey) => ({
            projectId: project.id,
            code: project.codes?.[serviceKey] || "—",
            projectName: project.projectName || project.name || project.id,
            service: serviceKey,
            serviceKey,
            role: "EXECUTIVE",
            isClosed: closedServices.includes(serviceKey),
          }));
        }

        // Older projects: single flat code/serviceKey/serviceLabel on the doc itself
        if (project.serviceKey) {
          return [{
            projectId: project.id,
            code: project.code || "—",
            projectName: project.projectName || project.name || project.id,
            service: project.serviceLabel || project.serviceKey,
            serviceKey: project.serviceKey,
            role: "EXECUTIVE",
            isClosed: closedServices.includes(project.serviceKey),
          }];
        }

        // No service info at all on this doc
        return [{
          projectId: project.id,
          code: project.code || "—",
          projectName: project.projectName || project.name || project.id,
          service: "—",
          serviceKey: "",
          role: "EXECUTIVE",
          isClosed: false,
        }];
      });
  }, [isRegionScoped, projects, tamRegion]);

  // Maker/Reviewer/Manager/Admin: one row per project this user is explicitly assigned to.
  const assignedRows = useMemo(() => {
    return projectRoles.map((pr) => {
      const project = projectsById[pr.projectId];
      const closedServices = project?.closedServices || [];
      return {
        projectId: pr.projectId,
        code: project?.codes?.[pr.serviceKey] || "—",
        projectName: pr.projectName || project?.projectName || pr.projectId,
        service: pr.serviceLabel || project?.serviceLabel || pr.serviceKey || "—",
        serviceKey: pr.serviceKey,
        role: pr.role,
        isClosed: closedServices.includes(pr.serviceKey),
      };
    });
  }, [projectRoles, projectsById]);

  const rows = isRegionScoped ? regionRows : assignedRows;

  return (
    <Layout title="Overview">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
          <LayoutDashboard size={18} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-black text-gray-900">My Projects</h1>
          <p className="text-gray-400 text-xs">Every project and role you currently have access to</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 mt-6">
          <Loader2 className="animate-spin mr-2" size={18} />
          Loading your projects…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm text-center py-16 mt-6">
          <FolderKanban size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-semibold text-sm">No projects assigned yet</p>
          <p className="text-gray-400 text-xs mt-1">Contact your administrator to get assigned to a project.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mt-6">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Unique Project Code</th>
                <th className="px-6 py-3 text-left">Project Name</th>
                <th className="px-6 py-3 text-left">Service</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={`${r.projectId}-${r.serviceKey}`} className="hover:bg-blue-50 transition">
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">{r.code}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FolderKanban size={15} className="text-gray-400" />
                      <span className="font-bold text-gray-800">{r.projectName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{r.service}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      r.isClosed ? "bg-gray-100 text-gray-500" : "bg-green-50 text-green-600"
                    }`}>
                      {r.isClosed ? "Closed" : "Active"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          navigate(
                            isRegionScoped
                              ? `/executive/projects/${r.projectId}`
                              : `/services/${r.serviceKey}`
                          )
                        }
                        disabled={!isRegionScoped && r.isClosed}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold text-xs disabled:text-gray-300 disabled:cursor-not-allowed"
                      >
                        Open
                        <ChevronRight size={14} />
                      </button>

                      {(r.role === "MANAGER" || isAdmin) && (
                        r.isClosed ? (
                          <button
                            onClick={() => handleReopenService(r.projectId, r.serviceKey)}
                            disabled={closingKey === `${r.projectId}-${r.serviceKey}`}
                            className="border border-green-200 bg-green-50 hover:bg-green-100 text-green-700 disabled:opacity-50 font-semibold text-xs px-3 py-1.5 rounded-lg transition"
                          >
                            {closingKey === `${r.projectId}-${r.serviceKey}` ? "Reopening..." : "Reopen"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCloseService(r.projectId, r.serviceKey)}
                            disabled={closingKey === `${r.projectId}-${r.serviceKey}`}
                            className="border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50 font-semibold text-xs px-3 py-1.5 rounded-lg transition"
                          >
                            {closingKey === `${r.projectId}-${r.serviceKey}` ? "Closing..." : "Close"}
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
