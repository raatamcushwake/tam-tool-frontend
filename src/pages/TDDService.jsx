import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import Layout from "../components/common/Layout";
import {
  ArrowLeft,
  ClipboardList,
  Database,
  Eye,
  Pencil,
  ChevronRight,
  CheckCircle2,
  Clock3,
  FolderOpen,
  FilePlus2,
} from "lucide-react";

/* =========================================================================================
   NOTE ON DATA MODEL
   -----------------------------------------------------------------------------------------
   This file expects a new Firestore collection: "tddAssignments"
   Each document represents one TDD assignment and is expected to look like:
     {
       projectId:      string,
       projectName:    string,
       region:         string,
       city:           string,
       micromarket:    string,
       developerName:  string,
       vendorName:     string,   // lender
       assignedToUid:  string,   // matches userProfile.uid
       assignedToName: string,   // matches userProfile.name (fallback if uid absent)
       status:         "Live" | "Completed",
       tddEntryId:     string | null, // id of the linked doc in "tddService" once filled
       createdAt:      serverTimestamp,
       updatedAt:      serverTimestamp,
     }

   The existing "tddService" collection (your actual TDD data entries) is untouched and
   works exactly as it did before.
   ========================================================================================= */

const REGIONS = ["East", "West", "North", "South"];

const initialFormState = {
  region: "",
  city: "",
  micromarket: "",
  developerName: "",
  vendorName: "",
  constructionArea: "",
  constructionAreaUnit: "sq.ft",
  constructionCost: "",
  constructionCostUnit: "Crores",
  projectName: "",
  noOfTowers: "",
  devRegulations: "",
  managerName: "",
  monthYear: "", // MM-YYYY via <input type="month">
};

const initialFilterState = {
  region: "",
  city: "",
  micromarket: "",
  developerName: "",
  projectName: "",
  vendorName: "",
  makerName: "",
  managerName: "",
  monthYear: "",
  areaMin: "",
  areaMax: "",
  costMin: "",
  costMax: "",
};

const inputClass =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50";
const labelClass = "block text-gray-700 text-xs font-semibold mb-1.5";

/* =========================================================================================
   MAIN COMPONENT — routes between Home / TDD Assignments / Assignment Database
   ========================================================================================= */
export default function TDDService() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();

  const [mainView, setMainView] = useState("home"); // "home" | "assignments" | "database"

  if (mainView === "assignments") {
    return <TDDAssignments onBack={() => setMainView("home")} userProfile={userProfile} />;
  }

  if (mainView === "database") {
    return <AssignmentDatabase onBack={() => setMainView("home")} userProfile={userProfile} />;
  }

  return (
    <Layout title="TDD Service">
      <button
        onClick={() => navigate("/services")}
        className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">TDD Service</h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage TDD assignments and the assignment database.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => setMainView("assignments")}
            className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-8 hover:border-blue-300 hover:shadow-md transition group"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition">
              <ClipboardList className="text-blue-600" size={24} />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
              TDD Assignments
              <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition" />
            </h2>
            <p className="text-gray-400 text-sm">
              View assignments made to you and track other live TDD assignments across projects.
            </p>
          </button>

          <button
            onClick={() => setMainView("database")}
            className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-8 hover:border-blue-300 hover:shadow-md transition group"
          >
            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-4 group-hover:bg-slate-100 transition">
              <Database className="text-slate-600" size={24} />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
              Assignment Database
              <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition" />
            </h2>
            <p className="text-gray-400 text-sm">
              Select a project to view its TDD database or add new TDD data.
            </p>
          </button>
        </div>
      </div>
    </Layout>
  );
}

/* =========================================================================================
   TDD ASSIGNMENTS — "My Assignment" (editable) + "Other Live Assignments" (view only)
   ========================================================================================= */
function TDDAssignments({ onBack, userProfile }) {
  const [tab, setTab] = useState("mine"); // "mine" | "others"
  const [tddEntries, setTddEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null); // { projectId, projectName, role? }
const [activeModule, setActiveModule] = useState("Project Info"); // module tab within a selected project

  const fetchTddEntries = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "tddService"));
      setTddEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching TDD entries:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTddEntries();
  }, []);

  // Projects this user is assigned to under the TDD service
  const myProjects = (userProfile?.projectRoles || []).filter(
    (pr) => pr.serviceKey === "tdd" || pr.serviceLabel === "TDD"
  );
  const myProjectIds = new Set(myProjects.map((p) => p.projectId));

  // Every project that has TDD data (includes the user's own, view-only)
  const otherProjectsMap = new Map();
  tddEntries.forEach((e) => {
    const key = e.projectId || e.projectName;
    if (key && !otherProjectsMap.has(key)) {
      otherProjectsMap.set(key, { projectId: key, projectName: e.projectName });
    }
  });
  const otherProjects = [...otherProjectsMap.values()].sort((a, b) =>
    a.projectName.localeCompare(b.projectName)
  );
  // ── My Assignment -> Direct editable form (no filters, no list) ──
  if (selectedProject && tab === "mine") {
    const existingEntry = tddEntries.find(
      (e) => (e.projectId || e.projectName) === (selectedProject.projectId || selectedProject.projectName)
    );

    const MODULES = ["Project Info", "Project Review", "Approvals", "Cost Review", "Schedule"];

    return (
      <Layout title="TDD Service">
        <button
          onClick={() => setSelectedProject(null)}
          className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all"
        >
          <ArrowLeft size={14} /> Back to My Assignment
        </button>
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-800">{selectedProject.projectName}</h1>
          <p className="text-gray-400 text-sm mt-1">Select a module to view or update.</p>
        </div>

        <div className="flex gap-2 border-b border-gray-100 mb-6">
          {MODULES.map((m) => (
            <button
              key={m}
              onClick={() => setActiveModule(m)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
                activeModule === m
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {activeModule === "Project Info" && (
          <TDDForm
            userProfile={userProfile}
            lockProjectFields
            initialProjectInfo={{ projectName: selectedProject.projectName, projectId: selectedProject.projectId }}
            docId={existingEntry?.id || null}
            onSaved={() => {
              fetchTddEntries();
            }}
          />
        )}

        {activeModule !== "Project Info" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-gray-400 text-sm">{activeModule} — coming soon.</p>
          </div>
        )}
      </Layout>
    );
  }
  // ── Other Live Assignments -> View only ──
  if (selectedProject && tab === "others") {
    return (
      <Layout title="TDD Service">
        <button
          onClick={() => setSelectedProject(null)}
          className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all"
        >
          <ArrowLeft size={14} /> Back to Other Live Assignments
        </button>
        <TDDDataList lockedProjectName={selectedProject.projectName} />
      </Layout>
    );
  }

  return (
    <Layout title="TDD Service">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">TDD Assignments</h1>
          <p className="text-gray-400 text-sm mt-1">
            Track assignments made to you, and see other live TDD assignments.
          </p>
        </div>

        <div className="flex gap-2 border-b border-gray-100">
          <button
            onClick={() => { setTab("mine"); setSelectedProject(null); }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
              tab === "mine" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            My Assignment
          </button>
          <button
            onClick={() => { setTab("others"); setSelectedProject(null); }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
              tab === "others" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            Other Live Assignments
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {loading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : tab === "mine" ? (
            myProjects.length === 0 ? (
              <p className="text-gray-400 text-sm">No TDD projects have been assigned to you yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {myProjects.map((p) => (
                  <button
                    key={p.projectId}
                    onClick={() => { setSelectedProject(p); setActiveModule("Project Info"); }}
                    className="text-left border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
                  >
                    <p className="font-semibold text-gray-800 text-sm mb-1">{p.projectName}</p>
                    <p className="text-gray-500 text-xs">Role: {p.role || "—"}</p>
                    <p className="text-gray-400 text-xs mt-2 flex items-center gap-1">
                      <Pencil size={11} /> View / add TDD data
                    </p>
                  </button>
                ))}
              </div>
            )
          ) : otherProjects.length === 0 ? (
            <p className="text-gray-400 text-sm">No other live TDD assignments at the moment.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {otherProjects.map((p) => (
                <button
                  key={p.projectId}
                  onClick={() => setSelectedProject(p)}
                  className="text-left border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
                >
                  <p className="font-semibold text-gray-800 text-sm mb-1">{p.projectName}</p>
                  <p className="text-gray-400 text-xs mt-2 flex items-center gap-1">
                    <Eye size={11} /> View only
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

/* =========================================================================================
   READ-ONLY ASSIGNMENT VIEW — used inside "Other Live Assignments"
   ========================================================================================= */

/* =========================================================================================
   ASSIGNMENT DATABASE — select a project, then View Database or Add New Data
   ========================================================================================= */
function AssignmentDatabase({ onBack, userProfile }) {
  const [step, setStep] = useState("select"); // "select" | "view" | "add"

  // ── Step: View Database (all projects, filterable) ──
  if (step === "view") {
    return (
      <Layout title="TDD Service">
        <button
          onClick={() => setStep("select")}
          className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <TDDDataList />
      </Layout>
    );
  }

  // ── Step: Add New Data (project name entered in the form itself) ──
  if (step === "add") {
    return (
      <Layout title="TDD Service">
        <button
          onClick={() => setStep("select")}
          className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-800">New TDD Entry</h1>
          <p className="text-gray-400 text-sm mt-1">
            Fill in the form to add new TDD data.
          </p>
        </div>
        <TDDForm userProfile={userProfile} onSaved={() => setStep("select")} />
      </Layout>
    );
  }

  // ── Step: Select action ──
  return (
    <Layout title="TDD Service">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="space-y-6 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Assignment Database</h1>
          <p className="text-gray-400 text-sm mt-1">Browse the TDD database or add a new entry.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => setStep("view")}
            className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:border-blue-300 hover:shadow-md transition"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <FolderOpen className="text-blue-600" size={20} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-800 text-sm">View Database</p>
              <p className="text-gray-400 text-xs">Browse existing TDD data</p>
            </div>
          </button>

          <button
            onClick={() => setStep("add")}
            className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:border-blue-300 hover:shadow-md transition"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <FilePlus2 className="text-emerald-600" size={20} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-800 text-sm">Add New Data</p>
              <p className="text-gray-400 text-xs">Submit a new TDD entry</p>
            </div>
          </button>
        </div>
      </div>
    </Layout>
  );
}

/* =========================================================================================
   TDD DATA LIST — filterable list + detail view (standalone, or locked to one project)
   ========================================================================================= */
function TDDDataList({ lockedProjectName }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [filters, setFilters] = useState(initialFilterState);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "tddService"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      let data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (lockedProjectName) {
        data = data.filter((e) => e.projectName === lockedProjectName);
      }
      setEntries(data);
    } catch (err) {
      console.error("Error fetching TDD entries:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    setSelectedEntry(null);
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedProjectName]);

  const getUniqueValues = (key) => {
    const values = entries.map((e) => e[key]).filter(Boolean);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  };

  const cityOptions = getUniqueValues("city");
  const micromarketOptions = getUniqueValues("micromarket");
  const developerOptions = getUniqueValues("developerName");
  const projectOptions = getUniqueValues("projectName");
  const vendorOptions = getUniqueValues("vendorName");
  const makerOptions = getUniqueValues("makerName");
  const managerOptions = getUniqueValues("managerName");
  const monthYearOptions = getUniqueValues("monthYear");

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => setFilters(initialFilterState);

  const filteredEntries = entries.filter((e) => {
    if (filters.region && e.region !== filters.region) return false;
    if (filters.city && e.city !== filters.city) return false;
    if (filters.micromarket && e.micromarket !== filters.micromarket) return false;
    if (filters.developerName && e.developerName !== filters.developerName) return false;
    if (!lockedProjectName && filters.projectName && e.projectName !== filters.projectName) return false;
    if (filters.vendorName && e.vendorName !== filters.vendorName) return false;
    if (filters.makerName && e.makerName !== filters.makerName) return false;
    if (filters.managerName && e.managerName !== filters.managerName) return false;
    if (filters.monthYear && e.monthYear !== filters.monthYear) return false;
    const area = parseFloat(e.constructionArea);
    if (filters.areaMin && (isNaN(area) || area < parseFloat(filters.areaMin))) return false;
    if (filters.areaMax && (isNaN(area) || area > parseFloat(filters.areaMax))) return false;
    const cost = parseFloat(e.constructionCost);
    if (filters.costMin && (isNaN(cost) || cost < parseFloat(filters.costMin))) return false;
    if (filters.costMax && (isNaN(cost) || cost > parseFloat(filters.costMax))) return false;

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      const haystack = [
        e.region,
        e.city,
        e.micromarket,
        e.developerName,
        e.vendorName,
        e.projectName,
        e.devRegulations,
        e.makerName,
        e.managerName,
        e.monthYear,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  if (selectedEntry) {
    const e = selectedEntry;
    const rows = [
      ["Region", e.region],
      ["City", e.city],
      ["Micromarket", e.micromarket],
      ["Developer Name", e.developerName],
      ["Lender Name", e.vendorName],
      ["Construction Area", e.constructionArea ? `${e.constructionArea} sq.ft` : ""],
      ["Construction Cost", e.constructionCost ? `${e.constructionCost} Crores` : ""],
      ["Project Name", e.projectName],
      ["No. of Towers", e.noOfTowers],
      ["Development Regulations / Scheme", e.devRegulations],
      ["Maker's Name", e.makerName],
      ["Manager Name", e.managerName],
      ["Month-Year of Study", e.monthYear],
    ];
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
        <button onClick={() => setSelectedEntry(null)} className="text-blue-600 text-sm mb-4">
          ← Back to list
        </button>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">{e.projectName || "TDD Entry"}</h1>
        <div className="divide-y divide-gray-100">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between py-2.5 text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="text-gray-800 font-medium">{value || "—"}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          {lockedProjectName ? `TDD Database — ${lockedProjectName}` : "TDD Database"}
        </h1>
        <p className="text-gray-400 text-sm mt-1">Browse and filter TDD entries.</p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by project, city, developer, vendor, maker, manager..."
          className={inputClass}
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-800">Filters</h2>
          <button
            onClick={() => {
              clearFilters();
              setSearchTerm("");
            }}
            className="text-xs text-blue-600 font-medium"
          >
            Clear all
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Region</label>
            <select name="region" value={filters.region} onChange={handleFilterChange} className={inputClass}>
              <option value="">All Regions</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>City</label>
            <select name="city" value={filters.city} onChange={handleFilterChange} className={inputClass}>
              <option value="">All Cities</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Micromarket</label>
            <select
              name="micromarket"
              value={filters.micromarket}
              onChange={handleFilterChange}
              className={inputClass}
            >
              <option value="">All Micromarkets</option>
              {micromarketOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Developer Name</label>
            <select
              name="developerName"
              value={filters.developerName}
              onChange={handleFilterChange}
              className={inputClass}
            >
              <option value="">All Developers</option>
              {developerOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          {!lockedProjectName && (
            <div>
              <label className={labelClass}>Project Name</label>
              <select
                name="projectName"
                value={filters.projectName}
                onChange={handleFilterChange}
                className={inputClass}
              >
                <option value="">All Projects</option>
                {projectOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelClass}>Lender Name</label>
            <select name="vendorName" value={filters.vendorName} onChange={handleFilterChange} className={inputClass}>
              <option value="">All Lenders</option>
              {vendorOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Maker Name</label>
            <select name="makerName" value={filters.makerName} onChange={handleFilterChange} className={inputClass}>
              <option value="">All Makers</option>
              {makerOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Manager Name</label>
            <select
              name="managerName"
              value={filters.managerName}
              onChange={handleFilterChange}
              className={inputClass}
            >
              <option value="">All Managers</option>
              {managerOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Month-Year of Study</label>
            <select name="monthYear" value={filters.monthYear} onChange={handleFilterChange} className={inputClass}>
              <option value="">All Periods</option>
              {monthYearOptions.map((my) => (
                <option key={my} value={my}>
                  {my}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Construction Area Range</label>
            <div className="flex gap-2">
              <input
                type="number"
                name="areaMin"
                value={filters.areaMin}
                onChange={handleFilterChange}
                className={inputClass}
                placeholder="Min"
                onWheel={(e) => e.target.blur()}
              />
              <input
                type="number"
                name="areaMax"
                value={filters.areaMax}
                onChange={handleFilterChange}
                className={inputClass}
                placeholder="Max"
                onWheel={(e) => e.target.blur()}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Construction Cost Range</label>
            <div className="flex gap-2">
              <input
                type="number"
                name="costMin"
                value={filters.costMin}
                onChange={handleFilterChange}
                className={inputClass}
                placeholder="Min"
                onWheel={(e) => e.target.blur()}
              />
              <input
                type="number"
                name="costMax"
                value={filters.costMax}
                onChange={handleFilterChange}
                className={inputClass}
                placeholder="Max"
                onWheel={(e) => e.target.blur()}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : filteredEntries.length === 0 ? (
          <p className="text-gray-400 text-sm">No TDD entries match your filters.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredEntries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelectedEntry(entry)}
                className="text-left border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
              >
                <p className="font-semibold text-gray-800 text-sm mb-1">
                  {entry.projectName || "Untitled Project"}
                </p>
                <p className="text-gray-500 text-xs">
                  {entry.city}
                  {entry.city && entry.region ? ", " : ""}
                  {entry.region}
                </p>
                <p className="text-gray-500 text-xs mt-1">Developer: {entry.developerName || "—"}</p>
                <p className="text-gray-400 text-xs mt-1">Study: {entry.monthYear || "—"}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================================
   TDD FORM — create or edit a TDD entry
   Used for: "Add New Data" (Assignment Database) and editing "My Assignment"
   ========================================================================================= */
function TDDForm({ userProfile, initialProjectInfo, lockProjectFields, docId, onSaved }) {
  const [formData, setFormData] = useState(initialFormState);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const loadExisting = async () => {
      if (!docId) {
        setFormData((prev) => ({
          ...prev,
          projectName: initialProjectInfo?.projectName || "",
          region: initialProjectInfo?.region || "",
          city: initialProjectInfo?.city || "",
          micromarket: initialProjectInfo?.micromarket || "",
          developerName: initialProjectInfo?.developerName || "",
          vendorName: initialProjectInfo?.vendorName || "",
        }));
        return;
      }
      setLoadingEntry(true);
      try {
        const snap = await getDoc(doc(db, "tddService", docId));
        if (snap.exists()) {
          setFormData((prev) => ({ ...prev, ...snap.data() }));
        }
      } catch (err) {
        console.error("Error loading TDD entry:", err);
      }
      setLoadingEntry(false);
    };
    loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      if (docId) {
        await updateDoc(doc(db, "tddService", docId), {
          ...formData,
          updatedAt: serverTimestamp(),
        });
        setSuccess("TDD entry updated successfully.");
        onSaved && onSaved(docId);
      } else {
        const ref = await addDoc(collection(db, "tddService"), {
          ...formData,
          projectId: initialProjectInfo?.projectId || null,
          createdAt: serverTimestamp(),
        });
        setSuccess("TDD entry saved successfully.");
        setFormData(initialFormState);
        onSaved && onSaved(ref.id);
      }
    } catch (err) {
      console.error("Error saving TDD entry:", err);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loadingEntry) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-3xl">
        <p className="text-gray-400 text-sm">Loading entry...</p>
      </div>
    );
  }

  const lockedClass = `${inputClass} bg-gray-100 text-gray-500 cursor-not-allowed`;

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-3xl space-y-4"
    >
      <div>
        <label className={labelClass}>Region</label>
        <select
          name="region"
          value={formData.region}
          onChange={handleChange}
          required
          disabled={lockProjectFields && !!initialProjectInfo?.region}
          className={lockProjectFields && initialProjectInfo?.region ? lockedClass : inputClass}
        >
          <option value="">Select Region</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>City</label>
        <input
          type="text"
          name="city"
          value={formData.city}
          onChange={handleChange}
          required
          readOnly={lockProjectFields && !!initialProjectInfo?.city}
          className={lockProjectFields && initialProjectInfo?.city ? lockedClass : inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Micromarket</label>
        <input
          type="text"
          name="micromarket"
          value={formData.micromarket}
          onChange={handleChange}
          required
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Developer Name</label>
        <input
          type="text"
          name="developerName"
          value={formData.developerName}
          onChange={handleChange}
          required
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Project Name</label>
        <input
          type="text"
          name="projectName"
          value={formData.projectName}
          onChange={handleChange}
          required
          readOnly={lockProjectFields && !!initialProjectInfo?.projectName}
          className={lockProjectFields && initialProjectInfo?.projectName ? lockedClass : inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Lender Name</label>
        <input
          type="text"
          name="vendorName"
          value={formData.vendorName}
          onChange={handleChange}
          required
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Construction Area (sq.ft)</label>
        <input
          type="number"
          name="constructionArea"
          value={formData.constructionArea}
          onChange={handleChange}
          required
          className={inputClass}
          onWheel={(e) => e.target.blur()}
        />
      </div>

      <div>
        <label className={labelClass}>Construction Cost (Crores)</label>
        <input
          type="number"
          name="constructionCost"
          value={formData.constructionCost}
          onChange={handleChange}
          className={inputClass}
          onWheel={(e) => e.target.blur()}
        />
      </div>

      <div>
        <label className={labelClass}>No. of Towers</label>
        <input
          type="number"
          name="noOfTowers"
          value={formData.noOfTowers}
          onChange={handleChange}
          required
          className={inputClass}
          onWheel={(e) => e.target.blur()}
        />
      </div>

      <div>
        <label className={labelClass}>Development Regulations / Scheme</label>
        <input
          type="text"
          name="devRegulations"
          value={formData.devRegulations}
          onChange={handleChange}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Maker's Name</label>
        <input
          type="text"
          name="makerName"
          value={formData.makerName}
          onChange={handleChange}
          required
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Manager Name</label>
        <input
          type="text"
          name="managerName"
          value={formData.managerName}
          onChange={handleChange}
          required
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Month-Year of Study</label>
        <input
          type="month"
          name="monthYear"
          value={formData.monthYear}
          onChange={handleChange}
          required
          className={inputClass}
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {success && <p className="text-green-600 text-sm">{success}</p>}

      <button
        type="submit"
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-6 py-2.5 rounded-xl transition text-sm"
      >
        {saving ? "Saving..." : docId ? "Update TDD" : "Save TDD"}
      </button>
    </form>
  );
}
