export const ROLES = {
  MAKER: "MAKER",
  REVIEWER: "REVIEWER",
  MANAGER: "MANAGER",
  ADMIN: "ADMIN",
};

export const ROLE_LABELS = {
  MAKER: "Maker",
  REVIEWER: "Reviewer",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

export const ROLE_COLORS = {
  MAKER: "bg-blue-100 text-blue-800",
  REVIEWER: "bg-yellow-100 text-yellow-800",
  MANAGER: "bg-green-100 text-green-800",
  ADMIN: "bg-purple-100 text-purple-800",
};

// TAM level — separate from project ROLES above.
// Sourced from userProfile.projectRoles.tamLevel (see AuthContext), not project-level roles.
export const TAM_LEVELS = {
  EXECUTIVE: "executive",
  BUSINESS_HEAD: "business_head",
};

export const TAM_LEVEL_LABELS = {
  executive: "Executive",
  business_head: "Business Head",
};

export const TAM_LEVEL_COLORS = {
  executive: "bg-indigo-100 text-indigo-800",
  business_head: "bg-pink-100 text-pink-800",
};
