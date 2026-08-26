// Fixed catalog of TAM services. Shown identically to every user on /home.
// "live: false" tiles render as disabled/"Coming Soon" and are not clickable.
import {
  FileCheck2, Search, CheckSquare, BarChart3, Calendar,
  TrendingUp, Building2, KeyRound, LineChart
} from "lucide-react";

export const SERVICES_CATALOG = [
  {
    key: "continuous-monitoring",
    label: "Continuous Monitoring",
    icon: Search,
    live: true,
  },
  {
    key: "periodic-monitoring",
    label: "Periodic Monitoring",
    icon: Calendar,
    live: true,
  },
  {
    key: "tdd",
    label: "TDD",
    icon: CheckSquare,
    live: true,
  },
  {
    key: "lie",
    label: "LIE",
    icon: BarChart3,
    live: true,
  },
  {
    key: "bill-certification",
    label: "Bill Certification",
    icon: FileCheck2,
    live: true,
  },
  {
    key: "sales-review",
    label: "Sales Review",
    icon: TrendingUp,
    live: false,
  },
  {
    key: "base-building-review",
    label: "Base Building Review",
    icon: Building2,
    live: false,
  },
  {
    key: "project-handover-review",
    label: "Project Handover Review",
    icon: KeyRound,
    live: false,
  },
  {
    key: "project-investment-performance-review",
    label: "Project Investment Performance Review",
    icon: LineChart,
    live: false,
  },
];
