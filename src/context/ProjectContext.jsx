import { createContext, useContext, useState } from "react";

const ProjectContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useProject = () => useContext(ProjectContext);

export const ProjectProvider = ({ children }) => {
  const [selectedProject, setSelectedProject] = useState(() => {
    const saved = localStorage.getItem("selectedProject");
    return saved ? JSON.parse(saved) : null;
  });

  const selectProject = (project) => {
    setSelectedProject(project);
    localStorage.setItem("selectedProject", JSON.stringify(project));
  };

  const clearProject = () => {
    setSelectedProject(null);
    localStorage.removeItem("selectedProject");
  };

  return (
    <ProjectContext.Provider value={{ selectedProject, selectProject, clearProject }}>
      {children}
    </ProjectContext.Provider>
  );
};