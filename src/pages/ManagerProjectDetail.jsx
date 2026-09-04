import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/common/Layout";
import axios from "axios";
import { ArrowLeft, Pencil, Save, X, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const FIELDS = [
  { key: "cityName", label: "City Name" },
  { key: "developerName", label: "Developer Name" },
  { key: "clientName", label: "Client" },
  { key: "fundingAgency", label: "Funding Agency" },
  { key: "projectType", label: "Type of Project" },
  { key: "configuration", label: "Configuration" },
  { key: "plotArea", label: "Plot Area" },
  { key: "fsiBuiltUpArea", label: "FSI Area / Built Up Area" },
  { key: "totalBuiltUpArea", label: "Total Built-up Area (SQM)" },
  { key: "totalUnits", label: "Total No. of Units" },
  { key: "projectStartDate", label: "Project Start Date", type: "month" },
  { key: "reraCompletionDate", label: "RERA Completion Date", type: "date" },
  { key: "googleCoordinates", label: "Google Coordinates" },
];

const SERVICES_LIST = [
  { key: "continuous-monitoring", label: "Continuous Monitoring" },
  { key: "periodic-monitoring", label: "Periodic Monitoring" },
  { key: "tdd", label: "TDD" },
  { key: "lie", label: "Lender Independent Engineering" },
];

const AVAILABLE_MODULES = [
  { key: "mis-sanity", label: "MIS Sanity Check" },
  { key: "mis-analysis", label: "MIS Analysis" },
  { key: "cost-analysis", label: "Cost Analysis" },
  { key: "cs-tracker", label: "CS Tracker" },
  { key: "approvals", label: "Approval Tracker" },
  { key: "project-progress", label: "Project Progress" },
  { key: "escrow-analysis", label: "Escrow Analysis" },
  { key: "collection-mapping", label: "Collection Mapping" },
  { key: "tdd-service", label: "TDD Service" },
];

// Same reusable services+modules checklist used in ManagerProjects.jsx / ProjectAssignment.jsx
function ServicesEditor({ selectedServices, moduleSelectionByService, onToggleService, onToggleModule }) {
  return (
    <div className="space-y-2">
      {SERVICES_LIST.map((service) => {
        const isOpen = selectedServices.includes(service.key);
        const selectedMods = moduleSelectionByService[service.key] || [];
        return (
          <div key={service.key} className="border border-gray-200 rounded-xl overflow-hidden">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={isOpen}
                onChange={() => onToggleService(service.key)}
                className="accent-blue-600"
              />
              {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
              {service.label}
              {isOpen && selectedMods.length > 0 && (
                <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {selectedMods.length} module{selectedMods.length !== 1 ? "s" : ""}
                </span>
              )}
            </label>
            {isOpen && (
              <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1 bg-gray-50 border-t border-gray-100">
                {AVAILABLE_MODULES.map((m) => (
                  <label
                    key={m.key}
                    className="flex items-center gap-2 text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:border-blue-300 bg-white"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMods.includes(m.key)}
                      onChange={() => onToggleModule(service.key, m.key)}
                      className="accent-blue-600"
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ManagerProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const {
    isManager, isAdmin, isExecutive, isBusinessHead,
    userProfile, currentUser, fetchUserProfile,
  } = useAuth();

  const myRoleForThisProject = (userProfile?.projectRoles || []).find(
    (r) => r.projectId === projectId
  )?.role;

  const canEdit = isAdmin || myRoleForThisProject === "MANAGER";
  const backPath = (isExecutive || isBusinessHead) && !isManager && !isAdmin
    ? "/overview"
    : "/manager/projects";
  const backLabel = (isExecutive || isBusinessHead) && !isManager && !isAdmin
    ? "Back to Overview"
    : "Back to My Projects";
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [name, setName] = useState("");

  // Services & Modules editor state (only meaningful while editing)
  const [selectedServices, setSelectedServices] = useState([]);
  const [moduleSelectionByService, setModuleSelectionByService] = useState({});

  const toggleService = (key) => {
    setSelectedServices((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };
  const toggleModule = (serviceKey, moduleKey) => {
    setModuleSelectionByService((prev) => {
      const current = prev[serviceKey] || [];
      const next = current.includes(moduleKey)
        ? current.filter((m) => m !== moduleKey)
        : [...current, moduleKey];
      return { ...prev, [serviceKey]: next };
    });
  };

  const fetchProject = async () => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/projects/${projectId}`
      );
      setProject(res.data);
      setForm(res.data.basicInfo || {});
      setName(res.data.name || "");
      const existing = res.data.enabledServices || {};
      setSelectedServices(Object.keys(existing));
      setModuleSelectionByService(existing);
    } catch (err) {
      console.error("Error fetching project:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/api/projects/${projectId}/basic-info`,
        { name, basicInfo: form }
      );

      const enabledServices = {};
      selectedServices.forEach((key) => {
        enabledServices[key] = moduleSelectionByService[key] || [];
      });
      const previouslyEnabledKeys = Object.keys(project.enabledServices || {});
      const newlyAddedKeys = selectedServices.filter(
        (key) => !previouslyEnabledKeys.includes(key)
      );

      await axios.patch(
        `${import.meta.env.VITE_API_URL}/api/projects/${projectId}/modules`,
        { enabledServices }
      );

      // A service that's brand new to this project won't be in the manager's
      // own projectRoles yet (that only gets set at project-creation time on
      // the backend), so without this they could see the service listed here
      // but wouldn't be able to open its tools. Give them access the same way
      // Admin's "Assign Role" flow does.
      if (isManager && currentUser) {
        for (const key of newlyAddedKeys) {
          const serviceMeta = SERVICES_LIST.find((s) => s.key === key);
          try {
            await axios.post(
              `${import.meta.env.VITE_API_URL}/api/auth/user/${currentUser.uid}/assign-project`,
              {
                projectId,
                projectName: name,
                role: "MANAGER",
                serviceKey: key,
                serviceLabel: serviceMeta?.label || key,
                enabledModules: enabledServices[key] || [],
              }
            );
          } catch (err) {
            console.error(`Error self-assigning new service "${key}":`, err);
          }
        }
        if (newlyAddedKeys.length > 0) {
          await fetchUserProfile(currentUser.uid);
        }
      }

      await fetchProject();
      setEditing(false);
    } catch (err) {
      console.error("Error saving project info:", err);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setForm(project.basicInfo || {});
    setName(project.name || "");
    const existing = project.enabledServices || {};
    setSelectedServices(Object.keys(existing));
    setModuleSelectionByService(existing);
    setEditing(false);
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 text-gray-400 text-sm">Loading...</div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="p-6 text-gray-400 text-sm">Project not found.</div>
      </Layout>
    );
  }

  const hasEnabledServices = Object.keys(project.enabledServices || {}).length > 0;

  const serviceEntries = hasEnabledServices
    ? Object.entries(project.enabledServices || {}).map(([key, moduleKeys]) => ({
        key,
        label: SERVICES_LIST.find((s) => s.key === key)?.label || key,
        modules: (moduleKeys || []).map(
          (mKey) => AVAILABLE_MODULES.find((m) => m.key === mKey)?.label || mKey
        ),
      }))
    : project.serviceKey
    ? [
        {
          key: project.serviceKey,
          label: project.serviceLabel || project.serviceKey,
          // Older projects never stored a module list at all — nothing to show here.
          modules: [],
        },
      ]
    : [];

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <button
          onClick={() => navigate(backPath)}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm"
        >
          <ArrowLeft size={16} /> {backLabel}
        </button>

        <div className="flex items-center justify-between">
          <div>
            {editing ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-2xl font-bold text-gray-800 border border-gray-200 rounded-lg px-3 py-1"
              />
            ) : (
              <h1 className="text-2xl font-bold text-gray-800">{project.name}</h1>
            )}
          </div>

          {canEdit && editing ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
              >
                <Save size={16} /> {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleCancel}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
              >
                <X size={16} /> Cancel
              </button>
            </div>
          ) : canEdit ? (
            <button
              onClick={() => setEditing(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
            >
              <Pencil size={16} /> Edit
            </button>
          ) : null}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-800 mb-4">Project Basic Information</h2>
          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">
                  {f.label}
                </label>
                {editing ? (
                  <input
                    type={f.type || "text"}
                    value={form[f.key] || ""}
                    onChange={(e) => handleChange(f.key, e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50"
                  />
                ) : (
                  <p className="text-gray-800 text-sm">
                    {project.basicInfo?.[f.key] || <span className="text-gray-300">Not set</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-800 mb-3">Enabled Services</h2>

          {editing ? (
            <ServicesEditor
              selectedServices={selectedServices}
              moduleSelectionByService={moduleSelectionByService}
              onToggleService={toggleService}
              onToggleModule={toggleModule}
            />
          ) : serviceEntries.length === 0 ? (
            <p className="text-gray-400 text-sm">No services enabled yet.</p>
          ) : (
            <div className="space-y-4">
              {serviceEntries.map((service) => (
                <div key={service.key} className="border border-gray-100 rounded-xl p-4">
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-600">
                    {service.label}
                  </span>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {service.modules.length === 0 ? (
                      <span className="text-gray-400 text-xs">No modules enabled yet.</span>
                    ) : (
                      service.modules.map((moduleLabel) => (
                        <span
                          key={moduleLabel}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-200"
                        >
                          {moduleLabel}
                        </span>
                      ))
                    )}
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
