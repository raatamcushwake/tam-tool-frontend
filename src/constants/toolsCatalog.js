import {
  FileSpreadsheet, BarChart3, IndianRupee, ShieldCheck,
  ClipboardList, FolderKanban, Landmark, Map, FileCheck2,
  Layers, LayoutDashboard, Upload
} from "lucide-react";

// Each top-level entry = one card on the "Available Tools" grid.
// moduleKey / children[].moduleKey must exactly match values already
// stored in a project's enabledModules array.
// roleOnly on a bundle child restricts it to specific roles (e.g. Manager-only).

export const TOOLS_CATALOG = [
  {
    type: "bundle",
    key: "sales-collection",
    label: "Sales & Collection",
    icon: Layers,
    desc: "MIS validation, analysis, dashboard & reference data",
    children: [
      {
        path: "/dashboard",
        icon: LayoutDashboard,
        label: "Overview",
        desc: "Sales & inventory dashboard for this project",
        moduleKey: null, // available whenever the bundle itself is enabled
      },
      {
        path: "/mis-sanity",
        icon: FileSpreadsheet,
        label: "Sanity Check",
        desc: "Validate MIS data before analysis",
        moduleKey: "mis-sanity",
      },
      {
        path: "/mis-analysis",
        icon: BarChart3,
        label: "MIS Analysis",
        desc: "Compare monthly MIS and extract delta",
        moduleKey: "mis-analysis",
      },
      {
        path: "/reference-upload",
        icon: Upload,
        label: "Reference Upload",
        desc: "Upload business plan & reference sheets",
        moduleKey: null,
        roleOnly: ["MANAGER"],
      },
    ],
  },
  {
    type: "single",
    path: "/cost-analysis",
    icon: IndianRupee,
    label: "Cost Analysis",
    desc: "Track project costs and variances",
    moduleKey: "cost-analysis",
  },
  {
    type: "single",
    path: "/projects",
    icon: FolderKanban,
    label: "Project Progress",
    desc: "Monitor overall project status",
    moduleKey: "project-progress",
  },
  {
    type: "single",
    path: "/approvals",
    icon: ClipboardList,
    label: "Approval Tracker",
    desc: "Track approvals and sign-offs",
    moduleKey: "approvals",
  },
  {
    type: "single",
    path: "/cs-tracker",
    icon: ShieldCheck,
    label: "CS Tracker",
    desc: "Monitor compliance milestones",
    moduleKey: "cs-tracker",
  },
  {
    type: "single",
    path: "/escrow-analysis",
    icon: Landmark,
    label: "Escrow Analysis",
    desc: "Escrow account setup and monitoring",
    moduleKey: "escrow-analysis",
    roleAware: true, // resolves to /escrow-upload for MAKER
  },
  {
    type: "single",
    path: "/collection-mapping",
    icon: Map,
    label: "Collection Mapping",
    desc: "Map collections against demand",
    moduleKey: "collection-mapping",
  },
  {
  type: "single",
  path: "/tdd-service",
  icon: FileCheck2,
  label: "TDD Service",
  desc: "Technical due diligence workflow",
  moduleKey: "tdd-service",
  services: ["tdd"], // only show this tool on the TDD service page
},
];
