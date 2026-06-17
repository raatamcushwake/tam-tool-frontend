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

  const login = async (email, password) => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  // Clear stale cycle state on every fresh login
  localStorage.removeItem("sanityPassed");
  localStorage.removeItem("misSubmitted");
  return result;
};

  const logout = async () => {
  await signOut(auth);
  setUserProfile(null);
  localStorage.removeItem("selectedProject");
  localStorage.removeItem("sanityPassed");
  localStorage.removeItem("misSubmitted");
};

  const fetchUserProfile = async (uid) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const res = await axios.get(`${apiUrl}/api/auth/user/${uid}`);
      setUserProfile(res.data);
      return res.data;
    } catch (err) {
      console.error("Error fetching user profile:", err);
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await fetchUserProfile(user.uid);
        setLoading(false);
      } else {
        setCurrentUser(null);
        setUserProfile(null);
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
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
