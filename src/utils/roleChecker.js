export const getUserRoleForProject = (userProfile, projectId) => {
  if (!userProfile || !userProfile.projectRoles) return null;
  const found = userProfile.projectRoles.find(
    (pr) => pr.projectId === projectId
  );
  return found ? found.role : null;
};

export const isAdmin = (userProfile) => {
  if (!userProfile) return false;
  return userProfile.isAdmin === true;
};

export const getUserProjects = (userProfile) => {
  if (!userProfile || !userProfile.projectRoles) return [];
  return userProfile.projectRoles;
};