  import { useState } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "../../context/AuthContext";

export default function Layout({ children, title }) {
  const [collapsed, setCollapsed] = useState(false);
  const { profileLoading } = useAuth();

  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 animate-pulse">
          <span className="text-white font-bold text-lg">T</span>
        </div>
        <p className="text-gray-400 text-sm font-medium">Loading your workspace...</p>
      </div>
    );
  }

    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
        <div
          className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
          style={{ marginLeft: collapsed ? "64px" : "256px" }}
        >
          <Navbar title={title} />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    );
  }
