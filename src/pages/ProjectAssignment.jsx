import { useEffect, useState } from "react";
import Layout from "../components/common/Layout";
import axios from "axios";
import { Plus, Trash2, FolderKanban, UserCheck, Download } from "lucide-react";
import * as XLSX from "xlsx";

const ROLES = ["MAKER", "REVIEWER", "MANAGER"];

const ROLE_COLORS = {
  MAKER: "bg-blue-100 text-blue-700",
  REVIEWER: "bg-yellow-100 text-yellow-700",
  MANAGER: "bg-green-100 text-green-700",
};

const AVAILABLE_MODULES = [
  { key: "mis-sanity", label: "MIS Sanity Check" },
  { key: "mis-analysis", label: "MIS Analysis" },
  { key: "cost-analysis", label: "Cost Analysis" },
  { key: "cs-tracker", label: "CS Tracker" },
  { key: "approvals", label: "Approval Tracker" },
  { key: "project-progress", label: "Project Progress" },
  { key: "escrow-analysis", label: "Escrow Analysis" },
  { key: "collection-mapping", label: "Collection Mapping" },
];

export default function ProjectAssignment() {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [selectedModules, setSelectedModules] = useState([]);

  const toggleModule = (key) => {
    setSelectedModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  // Assignment form state
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState("MAKER");
  const [assigning, setAssigning] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const fetchData = async () => {
    try {
      const [usersRes, projectsRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/auth/users`),
        axios.get(`${import.meta.env.VITE_API_URL}/api/projects`),
      ]);
      setUsers(usersRes.data.filter(u => !u.isAdmin));
      setProjects(projectsRes.data);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/projects`, {
        name: newProjectName.trim(),
        enabledModules: selectedModules,
      });
      setNewProjectName("");
      setSelectedModules([]);
      await fetchData();
    } catch (err) {
      console.error("Error creating project:", err);
    }
    setCreatingProject(false);
  };

  const assignRole = async () => {
    if (!selectedProject || !selectedUser || !selectedRole) return;
    setAssigning(true);
    setSuccessMsg("");
    setErrorMsg("");
    try {
      const project = projects.find(p => p.id === selectedProject);
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/user/${selectedUser}/assign-project`,
        {
          projectId: selectedProject,
          projectName: project?.name || selectedProject,
          role: selectedRole,
        }
      );
      setSuccessMsg("Role assigned successfully!");
      setSelectedUser("");
      setSelectedRole("MAKER");
      await fetchData();
    } catch (err) {
      setErrorMsg("Failed to assign role. Please try again.");
    }
    setAssigning(false);
  };

  const removeRole = async (uid, projectId, role) => {
    try {
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/api/auth/user/${uid}/remove-project`,
        { data: { projectId, role } }
      );
      await fetchData();
    } catch (err) {
      console.error("Error removing role:", err);
    }
  };

  const [editingModulesFor, setEditingModulesFor] = useState(null); // projectId currently being edited
  const [editModulesSelection, setEditModulesSelection] = useState([]);
  const [savingModules, setSavingModules] = useState(false);

  const openEditModules = (project) => {
    setEditingModulesFor(project.id);
    setEditModulesSelection(project.enabledModules || []);
  };

  const toggleEditModule = (key) => {
    setEditModulesSelection((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const saveEditModules = async (projectId) => {
    setSavingModules(true);
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/api/projects/${projectId}/modules`,
        { enabledModules: editModulesSelection }
      );
      setEditingModulesFor(null);
      await fetchData();
    } catch (err) {
      console.error("Error updating modules:", err);
    }
    setSavingModules(false);
  };

  const exportProjectsToExcel = () => {
    const rows = projects.map((project) => {
      const assignedUsers = users.filter((u) =>
        u.projectRoles?.some((r) => r.projectId === project.id)
      );

      const maker = assignedUsers.find((u) =>
        u.projectRoles.some((r) => r.projectId === project.id && r.role === "MAKER")
      );
      const reviewer = assignedUsers.find((u) =>
        u.projectRoles.some((r) => r.projectId === project.id && r.role === "REVIEWER")
      );
      const manager = assignedUsers.find((u) =>
        u.projectRoles.some((r) => r.projectId === project.id && r.role === "MANAGER")
      );

      return {
        "Project Name": project.name,
        "Maker": maker ? `${maker.name} (${maker.email})` : "Not Assigned",
        "Reviewer": reviewer ? `${reviewer.name} (${reviewer.email})` : "Not Assigned",
        "Manager": manager ? `${manager.name} (${manager.email})` : "Not Assigned",
        "Total Assigned Users": assignedUsers.length,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 32 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Projects");

    const today = new Date().toISOString().split("T")[0];
    XLSX.writeFile(workbook, `Project_List_${today}.xlsx`);
  };

  const activeUsers = users.filter(
    u => u.status === "ACTIVE" || u.status === "active"
  );

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Project Assignment</h1>
          <p className="text-gray-400 text-sm mt-1">
            Create projects and assign roles to users
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left — Create Project + Assign Role */}
          <div className="space-y-6">

            {/* Create Project */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <FolderKanban size={18} className="text-blue-600" />
                <h2 className="text-base font-bold text-gray-800">Create New Project</h2>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createProject()}
                  placeholder="Project name..."
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
                <button
                  onClick={createProject}
                  disabled={creatingProject || !newProjectName.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-1.5"
                >
                  <Plus size={16} />
                  {creatingProject ? "Creating..." : "Create"}
                </button>
              </div>

              {/* Module Access */}
              <div className="mt-4">
                <label className="block text-gray-700 text-xs font-semibold mb-2">
                  Enabled Modules for this Project
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_MODULES.map((m) => (
                    <label
                      key={m.key}
                      className="flex items-center gap-2 text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:border-blue-300"
                    >
                      <input
                        type="checkbox"
                        checked={selectedModules.includes(m.key)}
                        onChange={() => toggleModule(m.key)}
                        className="accent-blue-600"
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Assign Role */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <UserCheck size={18} className="text-green-600" />
                <h2 className="text-base font-bold text-gray-800">Assign Role to User</h2>
              </div>

              {successMsg && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 rounded-xl text-sm mb-4">
                  {successMsg}
                </div>
              )}
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl text-sm mb-4">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-3">
                {/* Select Project */}
                <div>
                  <label className="block text-gray-700 text-xs font-semibold mb-1.5">
                    Select Project
                  </label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  >
                    <option value="">-- Select a project --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Select User */}
                <div>
                  <label className="block text-gray-700 text-xs font-semibold mb-1.5">
                    Select User
                  </label>
                  <select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  >
                    <option value="">-- Select a user --</option>
                    {activeUsers.map(u => (
                      <option key={u.uid} value={u.uid}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Select Role */}
                <div>
                  <label className="block text-gray-700 text-xs font-semibold mb-1.5">
                    Select Role
                  </label>
                  <div className="flex gap-2">
                    {ROLES.map(role => (
                      <button
                        key={role}
                        onClick={() => setSelectedRole(role)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition
                          ${selectedRole === role
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300"
                          }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={assignRole}
                  disabled={assigning || !selectedProject || !selectedUser}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-2.5 rounded-xl transition text-sm mt-1"
                >
                  {assigning ? "Assigning..." : "Assign Role"}
                </button>
              </div>
            </div>
          </div>

          {/* Right — Projects + Assigned Users */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-800">Projects & Assignments</h2>
                <p className="text-gray-400 text-xs mt-0.5">
                  All projects with their assigned users
                </p>
              </div>
              <button
                onClick={exportProjectsToExcel}
                disabled={loading || projects.length === 0}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center gap-1.5"
              >
                <Download size={14} />
                Export Excel
              </button>
            </div>

            {loading ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">
                Loading...
              </div>
            ) : projects.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">
                No projects yet. Create one to get started.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {projects.map(project => {
                  const assignedUsers = users.filter(u =>
                    u.projectRoles?.some(r => r.projectId === project.id)
                  );
                  return (
                    <div key={project.id} className="px-6 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <FolderKanban size={15} className="text-blue-500" />
                          <p className="text-gray-800 font-semibold text-sm">
                            {project.name}
                          </p>
                        </div>
                        <button
                          onClick={() => openEditModules(project)}
                          className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                        >
                          Edit Modules
                        </button>
                      </div>

                      {editingModulesFor === project.id && (
                        <div className="mb-4 ml-5 bg-gray-50 border border-gray-200 rounded-xl p-3">
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {AVAILABLE_MODULES.map((m) => (
                              <label
                                key={m.key}
                                className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={editModulesSelection.includes(m.key)}
                                  onChange={() => toggleEditModule(m.key)}
                                  className="accent-blue-600"
                                />
                                {m.label}
                              </label>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEditModules(project.id)}
                              disabled={savingModules}
                              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                            >
                              {savingModules ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingModulesFor(null)}
                              className="text-gray-500 hover:text-gray-700 text-xs font-medium px-3 py-1.5"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {assignedUsers.length === 0 ? (
                        <p className="text-gray-400 text-xs ml-5">
                          No users assigned yet
                        </p>
                      ) : (
                        <div className="space-y-2 ml-5">
                          {assignedUsers.map(user => {
                            const role = user.projectRoles.find(
                              r => r.projectId === project.id
                            );
                            return (
                              <div
                                key={user.uid}
                                className="flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                                    <span className="text-gray-500 text-xs font-bold">
                                      {(user.name || "U")[0].toUpperCase()}
                                    </span>
                                  </div>
                                  <span className="text-gray-700 text-xs">
                                    {user.name}
                                  </span>
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[role?.role] || "bg-gray-100 text-gray-600"}`}>
                                    {role?.role}
                                  </span>
                                </div>
                                <button
                                  onClick={() => removeRole(user.uid, project.id, role?.role)}
                                  className="text-gray-300 hover:text-red-500 transition"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
