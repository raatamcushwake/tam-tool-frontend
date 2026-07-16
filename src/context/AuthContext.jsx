import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../services/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import axios from "axios";

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
const [profileLoading, setProfileLoading] = useState(true);

  const login = async (email, password) => {
  console.log("[LOGIN] start");
  const result = await signInWithEmailAndPassword(auth, email, password);
  console.log("[LOGIN] signInWithEmailAndPassword resolved, uid:", result.user.uid);
  setCurrentUser(result.user);
  setProfileLoading(true);
  console.log("[LOGIN] setCurrentUser + setProfileLoading(true) called");
  localStorage.removeItem("sanityPassed");
  localStorage.removeItem("misSubmitted");
  return result;
};

  const logout = async () => {
  console.log("[LOGOUT] start");
  setProfileLoading(true);
  await signOut(auth);
  console.log("[LOGOUT] signOut resolved");
  setUserProfile(null);
  console.log("[LOGOUT] setUserProfile(null) called");
  localStorage.removeItem("selectedProject");
  localStorage.removeItem("sanityPassed");
  localStorage.removeItem("misSubmitted");
};

  const fetchUserProfile = async (uid) => {
  try {
    console.log("[FETCH_PROFILE] start for", uid);
    const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    const res = await axios.get(`${apiUrl}/api/auth/user/${uid}`);
    console.log("[FETCH_PROFILE] got status:", res.data?.status);
    setUserProfile(res.data);
    return res.data;
  } catch (err) {
    console.error("Error fetching user profile:", err);
    return null;
  }
};

  useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    console.log("[LISTENER] fired, user:", user ? user.uid : null);
    if (user) {
      setCurrentUser(user);
      setProfileLoading(true);
      console.log("[LISTENER] fetching profile for", user.uid);
      await fetchUserProfile(user.uid);
      console.log("[LISTENER] profile fetched, setProfileLoading(false)");
      setProfileLoading(false);
      setLoading(false);
    } else {
      console.log("[LISTENER] no user, clearing state");
      setCurrentUser(null);
      setUserProfile(null);
      setProfileLoading(false);
      setLoading(false);
    }
  });
  return unsubscribe;
}, []);

  // ─── Derived helpers ───────────────────────────────────────
  const isAdmin = userProfile?.isAdmin === true;

  const isActive = userProfile?.status === "active" || 
                   userProfile?.status === "ACTIVE";

  const isPending = userProfile?.status === "PENDING" || 
                    userProfile?.status === "pending";

  const value = {
  currentUser,
  userProfile,
  login,
  logout,
  fetchUserProfile,
  isAdmin,
  isActive,
  isPending,
  profileLoading,
};

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
