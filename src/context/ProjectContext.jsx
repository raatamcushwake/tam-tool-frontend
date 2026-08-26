import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

const ProjectContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useProject = () => useContext(ProjectContext);

export const ProjectProvider = ({ children }) => {
  const { currentUser } = useAuth();

  const [selectedProject, setSelectedProject] = useState(() => {
    const saved = localStorage.getItem("selectedProject");
    return saved ? JSON.parse(saved) : null;
  });

  const selectProject = (project) => {
    setSelectedProject(project);
    localStorage.setItem("selectedProject", JSON.stringify(project));
    localStorage.setItem("selectedProjectUser", currentUser?.uid || "");
  };

  const clearProject = () => {
    setSelectedProject(null);
    localStorage.removeItem("selectedProject");
    localStorage.removeItem("selectedProjectUser");
  };

  // Whenever the logged-in user changes (login, logout, or switching accounts
  // without a full page reload), make sure the selected project actually
  // belongs to THIS user — otherwise clear it.
  useEffect(() => {
    const savedUser = localStorage.getItem("selectedProjectUser");
    if (!currentUser) {
      clearProject();
    } else if (savedUser && savedUser !== currentUser.uid) {
      clearProject();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  return (
    <ProjectContext.Provider value={{ selectedProject, selectProject, clearProject }}>
      {children}
    </ProjectContext.Provider>
  );
};
