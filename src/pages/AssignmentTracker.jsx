import { useEffect, useState } from "react";
import axios from "axios";
import { ClipboardList, Loader2, FolderKanban } from "lucide-react";
import Layout from "../components/common/Layout";

const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function AssignmentTracker() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState("ALL");

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${apiUrl}/api/projects`);
      setProjects(res.data || []);
    } catch (err) {
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const SERVICE_LABELS = {
    "continuous-monitoring": "Continuous Monitoring",
    "periodic-monitoring": "Periodic Monitoring",
    "tdd": "TDD",
    "lie": "Lender Independent Engineering",
  };

  const rows = projects.flatMap((p, projectIndex) => {
    const projectKey = p.id || `noid-${projectIndex}`;
    const enabledServices = p.enabledServices || {};
    const serviceKeys = Object.keys(enabledServices);

    // Legacy projects: single serviceKey/serviceLabel/code stored directly on the doc.
    if (serviceKeys.length === 0) {
      if (p.serviceKey) {
        return [{
          id: `${projectKey}-legacy`,
          projectName: p.projectName || p.name,
          code: p.code || "—",
          serviceLabel: p.serviceLabel || SERVICE_LABELS[p.serviceKey] || p.serviceKey,
          region: p.region || null,
          status: p.status || null,
          hasAssignment: true,
        }];
      }
      return [{
        id: `${projectKey}-none`,
        projectName: p.projectName || p.name,
        code: "—",
        serviceLabel: null,
        region: p.region || null,
        status: p.status || null,
        hasAssignment: false,
      }];
    }

    return serviceKeys.map((serviceKey) => ({
      id: `${projectKey}-${serviceKey}`,
      projectName: p.projectName || p.name,
      code: p.codes?.[serviceKey] || "—",
      serviceLabel: SERVICE_LABELS[serviceKey] || serviceKey,
      region: p.region || null,
      status: p.status || null,
      hasAssignment: true,
    }));
  });

  const projectNames = [...new Set(rows.map((r) => r.projectName))];
  const filtered = rows.filter(
    (r) => filterProject === "ALL" || r.projectName === filterProject
  );

  if (loading) {
    return (
      <Layout title="Assignment Tracker">
        <div className="flex items-center justify-center h-64 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={18} />
          Loading assignments…
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Assignment Tracker">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-blue-600" />
          <h3 className="text-gray-800 font-bold text-lg">Assignment Tracker</h3>
        </div>
        <p className="text-gray-400 text-sm mt-1">
          Every project and the service it's been assigned, with its unique code.
        </p>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none shadow-sm"
        >
          <option value="ALL">All Projects</option>
          {projectNames.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-400 font-bold self-center">
          {filtered.length} records
        </span>
      </div>

      <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Project</th>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Service</th>
              <th className="px-4 py-3 text-left">Region</th>
              <th className="px-4 py-3 text-left">Assigned To</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-bold text-gray-700 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <FolderKanban size={14} className="text-blue-500" />
                    {r.projectName}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.code}</td>
                {r.hasAssignment ? (
                  <>
                    <td className="px-4 py-3 text-gray-600">{r.serviceLabel}</td>
                    <td className="px-4 py-3 text-gray-600">{r.region}</td>
                    <td className="px-4 py-3 text-gray-600">{r.assignedName}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                        {r.status}
                      </span>
                    </td>
                  </>
                ) : (
                  <td colSpan={4} className="px-4 py-3 text-gray-300 text-xs font-semibold italic">
                    No service assigned yet
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
