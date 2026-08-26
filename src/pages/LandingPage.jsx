import { useNavigate } from "react-router-dom";
import Layout from "../components/common/Layout";
import { useAuth } from "../context/AuthContext";
import { TrendingUp, ShieldCheck, Sparkles, ArrowRight, Grid3x3, Building2 } from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();
  const { userProfile, isExecutive, isBusinessHead, tamRegion } = useAuth();

  const scopeLabel = isBusinessHead
    ? "All regions"
    : isExecutive && tamRegion.length
    ? tamRegion.join(", ")
    : null;

  return (
    <Layout title="Home">
      {/* Hero */}
      <div className="relative overflow-hidden bg-slate-800 rounded-2xl p-8 md:p-12 mb-6 shadow-sm">
        {/* Blueprint grid texture — signature element, restrained */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none"
          aria-hidden="true"
        >
          <defs>
            <pattern id="blueprint-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#blueprint-grid)" />
        </svg>

        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={14} className="text-blue-300" />
            <p className="text-blue-300 text-xs font-bold uppercase tracking-widest">
              Technical Assessment &amp; Monitoring
            </p>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
            Welcome to TAM Tool
          </h1>

          {userProfile?.name && (
            <p className="text-slate-300 text-sm mb-4">
              Hello, {userProfile.name} 👋
              {scopeLabel && (
                <span className="ml-2 text-slate-400">
                  · Scope: <span className="text-blue-300 font-semibold">{scopeLabel}</span>
                </span>
              )}
            </p>
          )}

          <p className="text-slate-300 text-sm max-w-2xl leading-relaxed mb-7">
            A comprehensive platform for MIS analysis, cost tracking, compliance
            monitoring, and project management — built for Cushman &amp; Wakefield.
          </p>

          <button
            onClick={() => navigate("/services")}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-800 font-semibold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Grid3x3 size={16} /> Browse Services
            <ArrowRight size={14} />
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-9 pt-7 border-t border-white/10">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <TrendingUp size={15} className="text-blue-300" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">Real-time MIS</p>
                <p className="text-slate-400 text-xs mt-0.5">Live tracking across every active project</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <ShieldCheck size={15} className="text-blue-300" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">Compliance</p>
                <p className="text-slate-400 text-xs mt-0.5">Automated checks, built into the workflow</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <Sparkles size={15} className="text-blue-300" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">AI-Powered Analysis</p>
                <p className="text-slate-400 text-xs mt-0.5">Faster review, fewer manual passes</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          <div className="border-l-2 border-blue-600 pl-5">
            <h3 className="text-gray-900 font-bold text-lg mb-3">
              About Cushman &amp; Wakefield India
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-3">
              Cushman &amp; Wakefield India stands as a premier international
              property consultant, delivering exceptional value through
              specialized Valuation &amp; Advisory (V&amp;A) services. With
              over 20 years of cumulative expertise, our dedicated team of
              175+ professionals offers a broad spectrum of solutions,
              including Real Estate Asset Advisory (RAA) across all asset
              classes — from office and residential to data centers and
              infrastructure — and comprehensive Technical Assessment &amp;
              Monitoring (TAM).
            </p>
            <p className="text-gray-500 text-sm leading-relaxed">
              Our approach is built on deep property understanding, backed by
              robust market knowledge and local insights. We provide clients —
              including PE funds, banks, developers, and corporates — with
              data-driven insights for financing, financial reporting, M&amp;A,
              strategic planning, and risk mitigation.
            </p>
          </div>
          <div>
            <h4 className="text-gray-900 font-bold text-base mb-3">
              AI-Powered Project Management
            </h4>
            <p className="text-gray-500 text-sm leading-relaxed mb-5">
              Our AI-powered TAM Tool revolutionizes construction project
              management by enabling real-time MIS tracking, automated
              compliance monitoring, and intelligent analysis — helping
              clients make informed, impactful decisions faster than ever
              before.
            </p>
            <div className="flex gap-4">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex-1">
                <p className="text-blue-600 font-bold text-2xl">20+</p>
                <p className="text-gray-500 text-xs mt-1 font-medium">
                  Years of Expertise
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex-1">
                <p className="text-blue-600 font-bold text-2xl">175+</p>
                <p className="text-gray-500 text-xs mt-1 font-medium">
                  Professionals
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
