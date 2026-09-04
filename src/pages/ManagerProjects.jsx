import { useEffect, useState } from "react";
import Layout from "../components/common/Layout";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Plus, FolderKanban, ChevronDown, ChevronRight } from "lucide-react";

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

const SERVICES_LIST = [
  { key: "continuous-monitoring", label: "Continuous Monitoring" },
  { key: "periodic-monitoring", label: "Periodic Monitoring" },
  { key: "tdd", label: "TDD" },
  { key: "lie", label: "Lender Independent Engineering" },
];

const REGIONS = [
  { key: "WES", label: "West" },
  { key: "NOR", label: "North" },
  { key: "SOU", label: "South" },
];

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

export default function ManagerProjects() {
  // NOTE: pulled fetchUserProfile out of useAuth() as well — this is the only
  // change to this line. Everything else in the component is untouched.
  const { currentUser, userProfile, fetchUserProfile } = useAuth();
  const navigate = useNavigate();
  const [myProjects, setMyProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Basic project fields
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [clientName, setClientName] = useState("");
  const [fundingAgency, setFundingAgency] = useState("");
  const [configuration, setConfiguration] = useState("");
  const [totalBuiltUpArea, setTotalBuiltUpArea] = useState("");
  const [totalUnits, setTotalUnits] = useState("");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [reraCompletionDate, setReraCompletionDate] = useState("");
  const [cityName, setCityName] = useState("");
  const [developerName, setDeveloperName] = useState("");
  const [projectType, setProjectType] = useState("");
  const [projectTypeOther, setProjectTypeOther] = useState("");
  const [plotArea, setPlotArea] = useState("");
  const [fsiBuiltUpArea, setFsiBuiltUpArea] = useState("");
  const [googleCoordinates, setGoogleCoordinates] = useState("");

  const PROJECT_TYPES = ["Residential", "Commercial", "Residential + Commercial", "Other"];

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

    const fetchMyProjects = async () => {
    if (!currentUser) return;
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/projects/user/${currentUser.uid}`
      );

      console.log("Raw projects from API:", res.data);
      console.log("userProfile.projectRoles:", userProfile?.projectRoles);

      const roles = userProfile?.projectRoles || [];

      // Build a map of projectId -> role for THIS user
      const roleByProjectId = {};
      roles.forEach((r) => {
        roleByProjectId[r.projectId] = r.role;
      });

      // Keep ALL projects this user has any role on, tagging each with their role.
      const allWithRole = res.data
        .filter((p) => roleByProjectId[p.id])
        .map((p) => ({ ...p, myRole: roleByProjectId[p.id] }));

      console.log("All projects with role:", allWithRole);

      setMyProjects(allWithRole);
    } catch (err) {
      console.error("Error fetching my projects:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMyProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const resetForm = () => {
    setName(""); setRegion(""); setClientName(""); setFundingAgency("");
    setConfiguration(""); setTotalBuiltUpArea(""); setTotalUnits("");
    setProjectStartDate(""); setReraCompletionDate("");
    setCityName(""); setDeveloperName(""); setProjectType(""); setProjectTypeOther("");
    setPlotArea(""); setFsiBuiltUpArea(""); setGoogleCoordinates("");
    setSelectedServices([]); setModuleSelectionByService({});
  };

  const createProject = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const enabledServices = {};
      selectedServices.forEach((key) => {
        enabledServices[key] = moduleSelectionByService[key] || [];
      });

      await axios.post(`${import.meta.env.VITE_API_URL}/api/projects`, {
        name: name.trim(),
        region,
        enabledServices,
        basicInfo: {
          clientName,
          fundingAgency,
          configuration,
          totalBuiltUpArea,
          totalUnits,
          projectStartDate,
          reraCompletionDate,
          cityName,
          developerName,
          projectType: projectType === "Other" ? projectTypeOther : projectType,
          plotArea,
          fsiBuiltUpArea,
          googleCoordinates,
        },
        creatorUid: currentUser.uid,
        creatorName: userProfile?.name || "",
        creatorRole: "MANAGER",
      });

      resetForm();
      setShowCreateForm(false);

      // FIX: the project just got a new projectRoles entry written in Firestore
      // (backend does this for MANAGER-created projects), but our local
      // userProfile in AuthContext was only ever fetched once at login, so it
      // doesn't know about that new entry yet. Refresh it from the DB first,
      // THEN re-filter projects against the now-current projectRoles —
      // otherwise fetchMyProjects() silently drops the brand-new project.
      await fetchUserProfile(currentUser.uid);
      await fetchMyProjects();
    } catch (err) {
      console.error("Error creating project:", err);
    }
    setCreating(false);
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">My Projects</h1>
            <p className="text-gray-400 text-sm mt-1">
              Projects you manage, and creating new ones
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-1.5"
          >
            <Plus size={16} />
            {showCreateForm ? "Close" : "Create New Project"}
          </button>
        </div>

        {showCreateForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-gray-800">Project Basic Information</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Project Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Region</label>
                <select value={region} onChange={(e) => setRegion(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50">
                  <option value="">-- Region --</option>
                  {REGIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">City Name</label>
                <input value={cityName} onChange={(e) => setCityName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Developer Name</label>
                <input value={developerName} onChange={(e) => setDeveloperName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Client</label>
                <input value={clientName} onChange={(e) => setClientName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Funding Agency</label>
                <input value={fundingAgency} onChange={(e) => setFundingAgency(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Configuration</label>
                <input value={configuration} onChange={(e) => setConfiguration(e.target.value)}
                  placeholder="e.g. 7 Residential Towers + Commercial"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Total Built-up Area (SQM)</label>
                <input value={totalBuiltUpArea} onChange={(e) => setTotalBuiltUpArea(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Type of Project</label>
                <select value={projectType} onChange={(e) => setProjectType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50">
                  <option value="">-- Select Type --</option>
                  {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {projectType === "Other" && (
                  <input
                    value={projectTypeOther}
                    onChange={(e) => setProjectTypeOther(e.target.value)}
                    placeholder="Specify project type"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 mt-2"
                  />
                )}
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Plot Area</label>
                <input value={plotArea} onChange={(e) => setPlotArea(e.target.value)}
                  placeholder="e.g. 25000 sqft"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">FSI Area / Built Up Area</label>
                <input value={fsiBuiltUpArea} onChange={(e) => setFsiBuiltUpArea(e.target.value)}
                  placeholder="e.g. 90000 sqft"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Google Coordinates</label>
                <input value={googleCoordinates} onChange={(e) => setGoogleCoordinates(e.target.value)}
                  placeholder="e.g. 19.0760, 72.8777"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Total No. of Units</label>
                <input value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">Project Start Date</label>
                <input type="month" value={projectStartDate} onChange={(e) => setProjectStartDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="block text-gray-700 text-xs font-semibold mb-1.5">RERA Completion Date</label>
                <input type="date" value={reraCompletionDate} onChange={(e) => setReraCompletionDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50" />
              </div>
            </div>

            <div>
              <label className="block text-gray-700 text-xs font-semibold mb-2">
                Enable Services for this Project
              </label>
              <ServicesEditor
                selectedServices={selectedServices}
                moduleSelectionByService={moduleSelectionByService}
                onToggleService={toggleService}
                onToggleModule={toggleModule}
              />
            </div>

            <button
              onClick={createProject}
              disabled={creating || !name.trim() || !region || selectedServices.length === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition"
            >
              {creating ? "Creating..." : "Create Project"}
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-800">Projects You Manage</h2>
          </div>
          {loading ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">Loading...</div>
          ) : myProjects.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">
              No projects yet. Create one to get started.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {myProjects.map((p) => {
                const isManager = p.myRole === "MANAGER";
                const badgeColor =
                  p.myRole === "MANAGER"
                    ? "bg-emerald-100 text-emerald-700"
                    : p.myRole === "REVIEWER"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-blue-100 text-blue-700"; // MAKER or other

                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/manager/projects/${p.id}`)}
                    className="px-6 py-4 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition"
                  >
                    <FolderKanban size={15} className="text-blue-500" />
                    <span className="text-gray-800 font-semibold text-sm">{p.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto ${badgeColor}`}>
                      {p.myRole}
                    </span>
                    {!isManager && (
                      <span className="text-[10px] text-gray-400 font-medium ml-2">
                        View only
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
