import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProjectProvider, useProject } from "./context/ProjectContext";
import Login from "./pages/Login";
import LandingPage from "./pages/LandingPage";
import Register from "./pages/Register";
import PendingApproval from "./pages/PendingApproval";
import ProjectSelector from "./pages/ProjectSelector";
import Dashboard from "./pages/Dashboard";
import MISSanityCheck from "./pages/MISSanityCheck";
import MISAnalysis from "./pages/MISAnalysis";
import CostAnalysis from "./pages/CostAnalysis";
import CSTracker from "./pages/CSTracker";
import ApprovalTracker from "./pages/ApprovalTracker";
import ProjectProgress from "./pages/ProjectProgress";
import AdminPanel from "./pages/AdminPanel";
import ProjectAssignment from "./pages/ProjectAssignment";
import ReferenceUpload from "./pages/ReferenceUpload";
import AdminTracker from "./pages/AdminTracker";
import EscrowAnalysis from "./pages/EscrowAnalysis";
import EscrowCumulativeSummary from "./pages/EscrowCumulativeSummary";
import EscrowUpload from "./pages/EscrowUpload";
import EscrowSummary from "./pages/EscrowSummary";
import EscrowHistory from "./pages/EscrowHistory";
import CollectionMapping from "./pages/CollectionMapping";
import CollectionMappingResults from "./pages/CollectionMappingResults";
// import Approval from "./pages/Approval";

// ─── Route Guards ────────────────────────────────────────────

const ProtectedRoute = ({ children }) => {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" />;
  return children;
};

const ActiveRoute = ({ children }) => {
  const { currentUser, isPending, isAdmin, userProfile } = useAuth();
  const { selectedProject } = useProject();
  if (!currentUser) return <Navigate to="/login" />;
  if (!isAdmin && isPending) return <Navigate to="/pending" />;
  if (!isAdmin && !selectedProject && userProfile?.projectRoles?.length > 0) {
    return <Navigate to="/select-project" />;
  }
  return children;
};

const AdminRoute = ({ children }) => {
  const { currentUser, isAdmin } = useAuth();
  if (!currentUser) return <Navigate to="/login" />;
  if (!isAdmin) return <Navigate to="/dashboard" />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { currentUser, isPending, isAdmin, userProfile } = useAuth();
  if (currentUser) {
    if (!isAdmin && isPending) return <Navigate to="/pending" />;
    if (!isAdmin && userProfile?.projectRoles?.length > 0) return <Navigate to="/select-project" />;
    return <Navigate to="/home" />;
  }
  return children;
};

// ─── Routes ──────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>

      {/* Public */}
      <Route path="/" element={
  <PublicRoute><Login /></PublicRoute>
} />
<Route path="/home" element={
  <ProtectedRoute><LandingPage /></ProtectedRoute>
} />
      <Route path="/register" element={
        <PublicRoute><Register /></PublicRoute>
      } />

      {/* Pending */}
      <Route path="/pending" element={
        <ProtectedRoute><PendingApproval /></ProtectedRoute>
      } />

      <Route path="/select-project" element={
        <ProtectedRoute><ProjectSelector /></ProtectedRoute>
      } />

      {/* Active users only */}
      <Route path="/dashboard" element={
        <ActiveRoute><Dashboard /></ActiveRoute>
      } />
      <Route path="/mis-sanity" element={
        <ActiveRoute><MISSanityCheck /></ActiveRoute>
      } />
      <Route path="/mis-analysis" element={
        <ActiveRoute><MISAnalysis /></ActiveRoute>
      } />
      <Route path="/cost-analysis" element={
        <ActiveRoute><CostAnalysis /></ActiveRoute>
      } />
      <Route path="/cs-tracker" element={
        <ActiveRoute><CSTracker /></ActiveRoute>
      } />
      <Route path="/approvals" element={
        <ActiveRoute><ApprovalTracker /></ActiveRoute>
      } />
      <Route path="/projects" element={
        <ActiveRoute><ProjectProgress /></ActiveRoute>
      } />
      <Route path="/escrow-analysis" element={
        <ActiveRoute><EscrowAnalysis /></ActiveRoute>
      } />
      <Route path="/escrow-cumulative-summary" element={
  <ActiveRoute><EscrowCumulativeSummary /></ActiveRoute>
} />
      <Route path="/escrow-upload" element={
  <ActiveRoute><EscrowUpload /></ActiveRoute>
      } />
      <Route path="/escrow-summary" element={
  <ActiveRoute><EscrowSummary /></ActiveRoute>
} />
      <Route path="/escrow-history" element={
  <ActiveRoute><EscrowHistory /></ActiveRoute>
} />
      <Route path="/collection-mapping" element={
  <ActiveRoute><CollectionMapping /></ActiveRoute>
} />
      <Route path="/collection-mapping/results" element={
  <ActiveRoute><CollectionMappingResults /></ActiveRoute>
} />
      {/* <Route path="/approval-form" element={
  <ActiveRoute><Approval /></ActiveRoute>
} /> */}

      {/* Admin only */}
      <Route path="/admin" element={
        <AdminRoute><AdminPanel /></AdminRoute>
      } />
      <Route path="/admin/projects" element={
        <AdminRoute><ProjectAssignment /></AdminRoute>
      } />
      <Route path="/admin/tracker" element={
        <AdminRoute><AdminTracker /></AdminRoute>
      } />
      <Route path="/reference-upload" element={
        <ActiveRoute><ReferenceUpload /></ActiveRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />

    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ProjectProvider>
    </AuthProvider>
  );
}