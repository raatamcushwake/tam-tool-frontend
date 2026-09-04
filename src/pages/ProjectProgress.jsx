import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Layout from "../components/common/Layout";
import projectProgressService from "../services/projectProgressService";
import { useProject } from "../context/ProjectContext";
import * as XLSX from "xlsx-js-style";

const FIELD_ROWS = [
  { key: "constructionArea", label: "Construction Area" },
  { key: "basements", label: "Basements" },
  { key: "ground", label: "Ground" },
  { key: "stilt", label: "Stilt" },
  { key: "podiums", label: "Podiums" },
  { key: "serviceFloor", label: "Service floor" },
  { key: "upperFloors", label: "Upper floors" },
];

const nextTowerName = (towers) => {
  const letter = String.fromCharCode(65 + towers.length);
  return `Tower ${letter}`;
};

const emptyTower = (name) => ({
  name,
  constructionArea: "",
  basements: "",
  ground: "",
  stilt: "",
  podiums: "",
  serviceFloor: "",
  upperFloors: "",
});

// ---------- Weightage config constants ----------
const FLOOR_TYPES = [
  "Footing",
  "Basements",
  "Ground",
  "Stilt",
  "Podiums",
  "Service floor",
  "Upper floors",
  "Terrace",
];

const DEFAULT_COST_WEIGHTAGE = {
  "RCC": 44,
  "Blockwork": 3,
  "Internal Plaster": 3,
  "Waterproofing": 2,
  "Ext Plaster": 3,
  "Flooring- main": 5,
  "Gypsum (except staircase)": 4,
  "Door Shutters": 3,
  "Kitchen Platform": 2,
  "Internal Paint": 3,
  "External Painting": 3,
  "Flooring-lift lobby & staircase": 3,
  "lift Installation": 3,
  "Plumbing Downtakes and looping": 4,
  "AC Installation": 1,
  "Fire fighting & FF": 3,
  "Electrical Wiring": 3,
  "Electrical Fittings": 3,
  "CP Sanitary Fittings": 1,
  "Aluminium Window Installation": 4,
};

const DEFAULT_PACKAGES = [
  {
    name: "RCC & Civil Works",
    activities: [
      "RCC", "Blockwork", "Internal Plaster", "Waterproofing", "Ext Plaster",
    ],
  },
  {
    name: "Finishing",
    activities: [
      "Flooring- main", "Gypsum (except staircase)", "Door Shutters",
      "Kitchen Platform", "Internal Paint", "External Painting",
      "Flooring-lift lobby & staircase",
    ],
  },
  {
    name: "MEP",
    activities: [
      "lift Installation", "Plumbing Downtakes and looping",
      "AC Installation", "Fire fighting & FF",
      "Electrical Wiring", "Electrical Fittings", "CP Sanitary Fittings",
    ],
  },
  { name: "Façade", activities: ["Aluminium Window Installation"] },
];

const emptyActivity = (name = "") => ({
  name,
  values: Object.fromEntries(FLOOR_TYPES.map((f) => [f, 0])),
  costWeightage: DEFAULT_COST_WEIGHTAGE[name] ?? 0,
  remarks: "",
});

const buildDefaultPackages = () =>
  DEFAULT_PACKAGES.map((p) => ({
    name: p.name,
    activities: p.activities.map((a) => emptyActivity(a)),
  }));

const activityTotal = (values) =>
  FLOOR_TYPES.reduce((sum, f) => sum + (Number(values[f]) || 0), 0);

// Maps a Tower Configuration row to the Weightage table's floor-type columns.
// Footing and Terrace have no equivalent in Tower Configuration, so they show "-".
const towerConfigValueForFloorType = (tower, floorType) => {
  const map = {
    Basements: tower.basements,
    Ground: tower.ground,
    Stilt: tower.stilt,
    Podiums: tower.podiums,
    "Service floor": tower.serviceFloor,
    "Upper floors": tower.upperFloors,
  };
  const val = map[floorType];
  return val === undefined || val === "" ? "-" : val;
};

// ---------- Activity matrix helpers ----------
// Floor rows are built manually by the Manager (add / rename / remove), starting from one seed row.
const defaultFloorRows = () => [{ label: "Footing", weightage: 1 }];

// Flat list of activities in package order — used to build matrix columns
const flattenActivities = (packages) =>
  packages.flatMap((p) => p.activities.map((a) => ({ package: p.name, name: a.name })));

// Activities grouped by package, with count — used to build the two-row grouped header
const groupedActivityColumns = (packages) =>
  packages
    .map((p) => ({ name: p.name, activities: p.activities.map((a) => a.name) }))
    .filter((p) => p.activities.length > 0);

function Shell({ embedded, children }) {
  return embedded ? <>{children}</> : <Layout title="Project Progress">{children}</Layout>;
}

export default function ProjectProgress({
  projectIdOverride,
  roleOverride,
  projectNameOverride,
  embedded = false,
}) {
  const navigate = useNavigate();
  const { selectedProject: contextProject } = useProject();
  const selectedProject = projectIdOverride
    ? { projectId: projectIdOverride, role: roleOverride, projectName: projectNameOverride }
    : contextProject;
  const isManager = selectedProject?.role === "MANAGER";
  const isMaker = selectedProject?.role === "MAKER";

  // ---- Tower config state ----
  const [totalTowerArea, setTotalTowerArea] = useState("");
  const [nonTowerArea, setNonTowerArea] = useState("");
  const [towers, setTowers] = useState([emptyTower("Tower A"), emptyTower("Tower B")]);
  const [towerStatus, setTowerStatus] = useState("draft");

  // ---- Non Tower config state ----
  const [includeNonTower, setIncludeNonTower] = useState(false);
  const [nonTowerConfig, setNonTowerConfig] = useState(emptyTower("Non Tower Area"));
  const [nonTowerStatus, setNonTowerStatus] = useState("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nonTowerError, setNonTowerError] = useState("");

  // ---- Weightage config state ----
  const [packages, setPackages] = useState(buildDefaultPackages());
  const [costReviewBudgets, setCostReviewBudgets] = useState({ budgets: {}, grandTotal: 0 });
  const [weightageStatus, setWeightageStatus] = useState("draft");
  const weightageReadOnly = !isManager || weightageStatus === "locked";
  const [weightageLoaded, setWeightageLoaded] = useState(false);
  const [savingWeightage, setSavingWeightage] = useState(false);
  const [weightageError, setWeightageError] = useState("");
  const [activeWeightageTowerTab, setActiveWeightageTowerTab] = useState(0);

  // ---- Activity matrix state ----
  const [activeTowerTab, setActiveTowerTab] = useState(0);
  const [matrixByTower, setMatrixByTower] = useState({});
  const [matrixLoaded, setMatrixLoaded] = useState(false);
  const [savingMatrixStructure, setSavingMatrixStructure] = useState(false);
  const [savingMatrixValues, setSavingMatrixValues] = useState(false);
  const [exportingToStorage, setExportingToStorage] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [matrixError, setMatrixError] = useState("");
  const [valuesSavedMsg, setValuesSavedMsg] = useState("");
  const importFileInputRef = useRef(null);

  // ---------------- Load tower config ----------------
  useEffect(() => {
    if (!selectedProject?.projectId) return;
    (async () => {
      try {
        const config = await projectProgressService.getTowerConfig(selectedProject.projectId);
        if (config) {
          setTotalTowerArea(config.totalTowerArea ?? "");
          setNonTowerArea(config.nonTowerArea ?? "");
          setTowers(config.towers?.length ? config.towers : [emptyTower("Tower A")]);
          setTowerStatus(config.status ?? "draft");
        }
      } catch (err) {
        if (err?.response?.status && err.response.status !== 404) {
          setError("Could not load existing tower configuration.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedProject?.projectId]);

  // ---------------- Load Non Tower config ----------------
  useEffect(() => {
    if (!selectedProject?.projectId) return;
    (async () => {
      try {
        const config = await projectProgressService.getNonTowerConfig(selectedProject.projectId);
        if (config) {
          setNonTowerConfig(config.data ?? emptyTower("Non Tower Area"));
          setNonTowerStatus(config.status ?? "draft");
          setIncludeNonTower(true);
        }
      } catch (err) {
        if (err?.response?.status && err.response.status !== 404) {
          setError("Could not load existing non tower configuration.");
        }
      }
    })();
  }, [selectedProject?.projectId]);

  // ---------------- Load Cost Review budgets (to auto-calc Cost Weightage %) ----------------
  useEffect(() => {
    if (!selectedProject?.projectId) return;
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    axios
      .get(`${API_URL}/api/tdd/cost-review/${selectedProject.projectId}/activity-budgets`)
      .then((res) => setCostReviewBudgets(res.data || { budgets: {}, grandTotal: 0 }))
      .catch(() => setCostReviewBudgets({ budgets: {}, grandTotal: 0 }));
  }, [selectedProject?.projectId]);

  // Cost Weightage % auto-calculated from Cost Review, for activities that
  // have a matching Work Head/Description there. Returns null if unmapped
  // (Manager still types those manually).
  const getComputedCostWeightage = (activityName) => {
    const budget = costReviewBudgets.budgets?.[activityName];
    const grandTotal = costReviewBudgets.grandTotal;
    if (budget === undefined || !grandTotal) return null;
    return (budget / grandTotal) * 100;
  };

  // Keep packages' costWeightage in sync with Cost Review whenever budgets
  // load/change, for any activity that has a mapping. Runs regardless of
  // lock state so every screen (including read-only Tower Activity Matrix)
  // always shows the correct linked %; it only affects local display state,
  // not the saved Firestore config, so nothing is silently overwritten
  // until the Manager actually re-saves.
  useEffect(() => {
    setPackages((prev) =>
      prev.map((p) => ({
        ...p,
        activities: p.activities.map((a) => {
          const computed = getComputedCostWeightage(a.name);
          return computed === null ? a : { ...a, costWeightage: Math.round(computed * 10) / 10 };
        }),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costReviewBudgets]);

  // ---------------- Load weightage config (only once tower config is locked) ----------------
  useEffect(() => {
    if (!selectedProject?.projectId || towerStatus !== "locked") return;
    (async () => {
      try {
        const config = await projectProgressService.getWeightageConfig(selectedProject.projectId);
        if (config?.packages?.length) {
          setPackages(config.packages);
          setWeightageStatus(config.status ?? "draft");
        }
      } catch (err) {
        if (err?.response?.status && err.response.status !== 404) {
          setWeightageError("Could not load existing weightage configuration.");
        }
      } finally {
        setWeightageLoaded(true);
      }
    })();
  }, [selectedProject?.projectId, towerStatus]);

  // ---------------- Load / initialize activity matrix per tower (only once weightage is locked) ----------------
  const ensureTowerMatrix = (towerName) => {
    setMatrixByTower((prev) => {
      if (prev[towerName]) return prev;
      const floors = defaultFloorRows();
      const activities = flattenActivities(packages);
      const values = {};
      activities.forEach((a) => {
        values[a.name] = {};
        floors.forEach((f) => {
          values[a.name][f.label] = 0;
        });
      });
      return { ...prev, [towerName]: { floors, values, status: "draft" } };
    });
  };

  useEffect(() => {
    if (weightageStatus !== "locked" || !selectedProject?.projectId || !towers.length) return;
    (async () => {
      for (const tower of towers) {
        try {
          const data = await projectProgressService.getActivityMatrix(selectedProject.projectId, tower.name);
          if (data) {
            // Defensive normalize — older/partial saves may be missing values
            const normalized = {
              floors: data.floors || [],
              values: data.values || {},
              status: data.status || "draft",
            };
            setMatrixByTower((prev) => ({ ...prev, [tower.name]: normalized }));
          } else {
            ensureTowerMatrix(tower.name);
          }
        } catch {
          ensureTowerMatrix(tower.name);
        }
      }
      setMatrixLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightageStatus, selectedProject?.projectId]);

  // Prevent mouse-wheel scroll from incrementing/decrementing a focused number input
  useEffect(() => {
    const handleWheel = () => {
      if (document.activeElement?.type === "number") {
        document.activeElement.blur();
      }
    };
    document.addEventListener("wheel", handleWheel, { passive: true });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  // ---------------- Tower config handlers ----------------
  const updateTower = (index, field, value) => {
    setTowers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };
  const updateTowerName = (index, value) => updateTower(index, "name", value);
  const addTower = () => setTowers((prev) => [...prev, emptyTower(nextTowerName(prev))]);
  const removeTower = (index) =>
    setTowers((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        totalTowerArea: totalTowerArea === "" ? 0 : totalTowerArea,
        nonTowerArea: nonTowerArea === "" ? 0 : nonTowerArea,
        towers: towers.map((t) => ({
          ...t,
          constructionArea: t.constructionArea === "" ? 0 : t.constructionArea,
          basements: t.basements === "" ? 0 : t.basements,
          ground: t.ground === "" ? 0 : t.ground,
          stilt: t.stilt === "" ? 0 : t.stilt,
          podiums: t.podiums === "" ? 0 : t.podiums,
          serviceFloor: t.serviceFloor === "" ? 0 : t.serviceFloor,
          upperFloors: t.upperFloors === "" ? 0 : t.upperFloors,
        })),
      };
      const result = await projectProgressService.saveTowerConfig(selectedProject.projectId, payload);
      setTowerStatus(result?.status ?? "locked");
    } catch (err) {
      setError("Failed to save tower configuration. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    await projectProgressService.unlockTowerConfig(selectedProject.projectId);
    setTowerStatus("draft");
  };

  // ---------------- Non Tower config handlers ----------------
  const updateNonTower = (field, value) => {
    setNonTowerConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveNonTower = async () => {
    setSaving(true);
    setNonTowerError("");
    try {
      const payload = {
        ...nonTowerConfig,
        constructionArea: nonTowerConfig.constructionArea === "" ? 0 : nonTowerConfig.constructionArea,
        basements: nonTowerConfig.basements === "" ? 0 : nonTowerConfig.basements,
        ground: nonTowerConfig.ground === "" ? 0 : nonTowerConfig.ground,
        stilt: nonTowerConfig.stilt === "" ? 0 : nonTowerConfig.stilt,
        podiums: nonTowerConfig.podiums === "" ? 0 : nonTowerConfig.podiums,
        serviceFloor: nonTowerConfig.serviceFloor === "" ? 0 : nonTowerConfig.serviceFloor,
        upperFloors: nonTowerConfig.upperFloors === "" ? 0 : nonTowerConfig.upperFloors,
      };
      const result = await projectProgressService.saveNonTowerConfig(selectedProject.projectId, payload);
      setNonTowerStatus(result?.status ?? "locked");
    } catch (err) {
      setNonTowerError("Failed to save non tower configuration. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlockNonTower = async () => {
    await projectProgressService.unlockNonTowerConfig(selectedProject.projectId);
    setNonTowerStatus("draft");
  };

  // ---------------- Weightage config handlers ----------------
  const updatePackageName = (pIndex, value) => {
    setPackages((prev) => prev.map((p, i) => (i === pIndex ? { ...p, name: value } : p)));
  };

  const updateActivityName = (pIndex, aIndex, value) => {
    setPackages((prev) =>
      prev.map((p, i) =>
        i !== pIndex
          ? p
          : { ...p, activities: p.activities.map((a, j) => (j === aIndex ? { ...a, name: value } : a)) }
      )
    );
  };

  const updateActivityValue = (pIndex, aIndex, floorType, value) => {
    setPackages((prev) =>
      prev.map((p, i) =>
        i !== pIndex
          ? p
          : {
              ...p,
              activities: p.activities.map((a, j) =>
                j !== aIndex ? a : { ...a, values: { ...a.values, [floorType]: value } }
              ),
            }
      )
    );
  };

  const updateActivityField = (pIndex, aIndex, field, value) => {
    setPackages((prev) =>
      prev.map((p, i) =>
        i !== pIndex
          ? p
          : { ...p, activities: p.activities.map((a, j) => (j === aIndex ? { ...a, [field]: value } : a)) }
      )
    );
  };

  const addPackage = () => {
    setPackages((prev) => [...prev, { name: "New Package", activities: [emptyActivity()] }]);
  };

  const removePackage = (pIndex) => {
    setPackages((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== pIndex) : prev));
  };

  const addActivity = (pIndex) => {
    setPackages((prev) =>
      prev.map((p, i) => (i !== pIndex ? p : { ...p, activities: [...p.activities, emptyActivity()] }))
    );
  };

  const removeActivity = (pIndex, aIndex) => {
    setPackages((prev) =>
      prev.map((p, i) =>
        i !== pIndex
          ? p
          : { ...p, activities: p.activities.length > 1 ? p.activities.filter((_, j) => j !== aIndex) : p.activities }
      )
    );
  };

  const totalCostWeightage = packages
    .flatMap((p) => p.activities)
    .reduce((sum, a) => sum + (Number(a.costWeightage) || 0), 0);

  const handleSaveWeightage = async () => {
    setSavingWeightage(true);
    setWeightageError("");
    try {
      const result = await projectProgressService.saveWeightageConfig(selectedProject.projectId, { packages });
      setWeightageStatus(result?.status ?? "locked");
    } catch (err) {
      setWeightageError("Failed to save weightage configuration. Please try again.");
    } finally {
      setSavingWeightage(false);
    }
  };

  const handleUnlockWeightage = async () => {
    await projectProgressService.unlockWeightageConfig(selectedProject.projectId);
    setWeightageStatus("draft");
  };
  // TEMPORARY: resets packages/activities to the DEFAULT_PACKAGES grouping defined in code.
  // Remove this handler + its button once the saved data has been cleaned up.
  const handleResetToDefaults = () => {
    if (!window.confirm("This will replace all current packages/activities with the default grouping. Continue?")) {
      return;
    }
    setPackages(buildDefaultPackages());
  };

  // ---------------- Activity matrix handlers ----------------

  // Maker: enter actual progress value for an activity on a given floor — clamped to
  // 0..floor.weightage (the value can never exceed that floor's own Weightage)
  const updateActivityMatrixValue = (towerName, activityName, floorLabel, rawValue) => {
    setMatrixByTower((prev) => {
      const t = prev[towerName];
      const floor = t.floors.find((f) => f.label === floorLabel);
      const maxAllowed = Number(floor?.weightage) || 0;
      let num = Number(rawValue);
      if (Number.isNaN(num)) num = 0;
      if (num < 0) num = 0;
      if (num > maxAllowed) num = maxAllowed;
      return {
        ...prev,
        [towerName]: {
          ...t,
          values: {
            ...t.values,
            [activityName]: { ...t.values[activityName], [floorLabel]: num },
          },
        },
      };
    });
  };

  const updateFloorWeightage = (towerName, floorLabel, value) => {
    setMatrixByTower((prev) => ({
      ...prev,
      [towerName]: {
        ...prev[towerName],
        floors: prev[towerName].floors.map((f) => (f.label === floorLabel ? { ...f, weightage: value } : f)),
      },
    }));
  };

  const addFloorRow = (towerName) => {
    setMatrixByTower((prev) => {
      const t = prev[towerName];
      const newLabel = `Floor ${t.floors.length + 1}`;
      const newFloors = [...t.floors, { label: newLabel, weightage: 1 }];
      const newValues = {};
      Object.keys(t.values).forEach((actName) => {
        newValues[actName] = { ...t.values[actName], [newLabel]: 0 };
      });
      return { ...prev, [towerName]: { ...t, floors: newFloors, values: newValues } };
    });
  };

  const updateFloorLabel = (towerName, index, newLabel) => {
    setMatrixByTower((prev) => {
      const t = prev[towerName];
      const oldLabel = t.floors[index].label;
      const newFloors = t.floors.map((f, i) => (i === index ? { ...f, label: newLabel } : f));
      const newValues = {};
      Object.keys(t.values).forEach((actName) => {
        const vals = { ...t.values[actName] };
        const val = vals[oldLabel];
        delete vals[oldLabel];
        vals[newLabel] = val ?? 0;
        newValues[actName] = vals;
      });
      return { ...prev, [towerName]: { ...t, floors: newFloors, values: newValues } };
    });
  };

  const removeFloorRow = (towerName, label) => {
    setMatrixByTower((prev) => {
      const t = prev[towerName];
      if (t.floors.length <= 1) return prev;
      const newFloors = t.floors.filter((f) => f.label !== label);
      const newValues = {};
      Object.keys(t.values).forEach((actName) => {
        const vals = { ...t.values[actName] };
        delete vals[label];
        newValues[actName] = vals;
      });
      return { ...prev, [towerName]: { ...t, floors: newFloors, values: newValues } };
    });
  };

  // Sum of Maker-entered progress values for an activity
  const totalEntered = (towerName, activityName) => {
    const values = matrixByTower[towerName]?.values?.[activityName] || {};
    return Object.values(values).reduce((sum, v) => sum + (Number(v) || 0), 0);
  };

  // Sum of every floor's Weightage for this tower — the shared denominator for every activity's completion %
  const totalFloorsForActivity = (towerName) => {
    const matrix = matrixByTower[towerName];
    if (!matrix) return 0;
    return matrix.floors.reduce((sum, f) => sum + (Number(f.weightage) || 0), 0);
  };

  // Pulled from the Weightage Input step's Cost Weightage %
  const getActivityCostWeightage = (activityName) => {
    for (const p of packages) {
      const act = p.activities.find((a) => a.name === activityName);
      if (act) return Number(act.costWeightage) || 0;
    }
    return 0;
  };

  // Pulled from the Weightage Input step's Total column for that activity
  const getActivityWeightageTotal = (activityName) => {
    for (const p of packages) {
      const act = p.activities.find((a) => a.name === activityName);
      if (act) return activityTotal(act.values);
    }
    return 0;
  };

  const activityCompletionNumeric = (towerName, activityName) => {
    const denom = getActivityWeightageTotal(activityName);
    if (!denom) return 0;
    return (totalEntered(towerName, activityName) / denom) * 100;
  };

  const activityCompletionPercent = (towerName, activityName) =>
    activityCompletionNumeric(towerName, activityName).toFixed(1);

  // Tower's share of the whole project = its Construction Area ÷ sum of ALL entities' Construction Area
  // (towers + Non Tower Area, when Non Tower Area is included and locked)
  const towerWeightagePercent = (tower) => {
    const entities = includeNonTower && nonTowerStatus === "locked" ? [...towers, nonTowerConfig] : towers;
    const total = entities.reduce((sum, t) => sum + (Number(t.constructionArea) || 0), 0);
    if (!total) return 0;
    return ((Number(tower.constructionArea) || 0) / total) * 100;
  };

  // Sum of each activity's Completion% weighted by its Cost Weightage% — the tower's overall progress
  const towerProgressPercent = (towerName) => {
    const activities = flattenActivities(packages);
    return activities.reduce((sum, a) => {
      const completion = activityCompletionNumeric(towerName, a.name); // 0-100
      const weightage = getActivityCostWeightage(a.name); // 0-100
      return sum + (completion / 100) * weightage;
    }, 0);
  };

  // Area-weighted total of an activity's Completion% across all towers:
  // (Tower A completion% * Tower A construction area + Tower B completion% * Tower B construction area + ...) / Total construction area
  const activityWeightedTotalPercent = (activityName) => {
    const totalArea = towers.reduce((sum, t) => sum + (Number(t.constructionArea) || 0), 0);
    if (!totalArea) return 0;
    const weightedSum = towers.reduce((sum, t) => {
      const completion = matrixByTower[t.name] ? activityCompletionNumeric(t.name, activityName) : 0;
      const area = Number(t.constructionArea) || 0;
      return sum + completion * area;
    }, 0);
    return weightedSum / totalArea;
  };

  // Sum of each entity's (tower + Non Tower Area) Progress weighted by its share of Total Area
  const projectProgressPercent = () => {
    const entities = includeNonTower && nonTowerStatus === "locked" ? [...towers, nonTowerConfig] : towers;
    return entities.reduce((sum, tower) => {
      const tw = towerWeightagePercent(tower) / 100;
      const tp = towerProgressPercent(tower.name);
      return sum + tw * tp;
    }, 0);
  };

  // Manager: save + lock the floor structure (floor labels + Weightage)
  const handleSaveMatrixStructure = async (towerName) => {
    setSavingMatrixStructure(true);
    setMatrixError("");
    try {
      const matrix = matrixByTower[towerName];
      const payload = { floors: matrix.floors };
      const result = await projectProgressService.saveActivityMatrix(selectedProject.projectId, towerName, payload);
      setMatrixByTower((prev) => ({
        ...prev,
        [towerName]: { ...prev[towerName], status: result?.status ?? "locked" },
      }));
    } catch {
      setMatrixError("Failed to save activity matrix structure. Please try again.");
    } finally {
      setSavingMatrixStructure(false);
    }
  };

  const handleUnlockMatrix = async (towerName) => {
    await projectProgressService.unlockActivityMatrix(selectedProject.projectId, towerName);
    setMatrixByTower((prev) => ({ ...prev, [towerName]: { ...prev[towerName], status: "draft" } }));
  };

  // Maker: save progress values (does not touch structure/lock state)
  const handleSaveMatrixValues = async (towerName) => {
    setSavingMatrixValues(true);
    setMatrixError("");
    setValuesSavedMsg("");
    try {
      const matrix = matrixByTower[towerName];
      await projectProgressService.saveActivityMatrixValues(selectedProject.projectId, towerName, {
        values: matrix.values,
      });
      setValuesSavedMsg("Progress saved.");
      setTimeout(() => setValuesSavedMsg(""), 2500);
    } catch {
      setMatrixError("Failed to save progress. Please try again.");
    } finally {
      setSavingMatrixValues(false);
    }
  };

  const colLetter = (n) => {
    let s = "";
    n++;
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  const BORDER_THIN = {
    top: { style: "thin", color: { rgb: "D9D9D9" } },
    bottom: { style: "thin", color: { rgb: "D9D9D9" } },
    left: { style: "thin", color: { rgb: "D9D9D9" } },
    right: { style: "thin", color: { rgb: "D9D9D9" } },
  };

  const autoFitColumns = (ws, aoa) => {
    const widths = [];
    aoa.forEach((row) => {
      row.forEach((cell, i) => {
        const val = cell && typeof cell === "object" ? cell.v ?? "" : cell;
        const len = String(val ?? "").length;
        widths[i] = Math.max(widths[i] || 10, len + 2);
      });
    });
    ws["!cols"] = widths.map((w) => ({ wch: Math.min(w, 45) }));
  };

  const applyBaseBorders = (ws) => {
    if (!ws["!ref"]) return;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = { ...(ws[addr].s || {}), border: BORDER_THIN };
      }
    }
  };

  const styleRow = (ws, rowIdx, style) => {
    if (!ws["!ref"]) return;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c: C });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      ws[addr].s = { ...(ws[addr].s || {}), ...style };
    }
  };

  const styleCol = (ws, colIdx, rowStart, rowEnd, style) => {
    for (let R = rowStart; R <= rowEnd; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: colIdx });
      if (!ws[addr]) continue;
      ws[addr].s = { ...(ws[addr].s || {}), ...style };
    }
  };

  const HEADER_STYLE = { fill: { fgColor: { rgb: "1F4E78" } }, font: { bold: true, color: { rgb: "FFFFFF" } } };
  const PACKAGE_COL_STYLE = { fill: { fgColor: { rgb: "FCE4D6" } }, font: { bold: true } };
  const WEIGHTAGE_COL_STYLE = { fill: { fgColor: { rgb: "FFF2CC" } } };
  const TOTAL_ROW_STYLE = { fill: { fgColor: { rgb: "C6E0B4" } }, font: { bold: true } };
  const COMPLETION_ROW_STYLE = { fill: { fgColor: { rgb: "D9E1F2" } }, font: { bold: true } };

    const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const activities = flattenActivities(packages);

    const statusAOA = [];
    statusAOA.push(["Activity", ...towers.map((t) => t.name)]);
    activities.forEach((a) => {
      const row = [a.name];
      towers.forEach((t) => {
        const pct = matrixByTower[t.name]
          ? Number(activityCompletionPercent(t.name, a.name)) / 100
          : 0;
        row.push({ t: "n", v: pct, z: "0.0%" });
      });
      statusAOA.push(row);
    });
    const totalRow = ["Tower Total"];
    towers.forEach((t) => {
      const pct = matrixByTower[t.name] ? towerProgressPercent(t.name) / 100 : 0;
      totalRow.push({ t: "n", v: pct, z: "0.00%" });
    });
    statusAOA.push(totalRow);

    const statusWs = XLSX.utils.aoa_to_sheet(statusAOA);
    autoFitColumns(statusWs, statusAOA);
    applyBaseBorders(statusWs);
    styleRow(statusWs, 0, HEADER_STYLE);
    styleRow(statusWs, statusAOA.length - 1, TOTAL_ROW_STYLE);
    XLSX.utils.book_append_sheet(wb, statusWs, "Tower Level Status");

    const summaryAOA = [];
    summaryAOA.push(["Summary"]);
    summaryAOA.push(["", "Weightage", "Tower Progress"]);
    const summaryEntities = includeNonTower && nonTowerStatus === "locked" ? [...towers, nonTowerConfig] : towers;
    summaryEntities.forEach((t) => {
      summaryAOA.push([
        t.name,
        { t: "n", v: towerWeightagePercent(t) / 100, z: "0%" },
        { t: "n", v: matrixByTower[t.name] ? towerProgressPercent(t.name) / 100 : 0, z: "0.00%" },
      ]);
    });
    summaryAOA.push([]);
    summaryAOA.push([
      "Project Progress",
      "",
      { t: "n", v: projectProgressPercent() / 100, z: "0.00%" },
    ]);

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryAOA);
    autoFitColumns(summaryWs, summaryAOA);
    applyBaseBorders(summaryWs);
    styleRow(summaryWs, 1, HEADER_STYLE);
    styleRow(summaryWs, summaryAOA.length - 1, TOTAL_ROW_STYLE);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Project level Summary");

    const today = new Date().toISOString().split("T")[0];
    const projectLabel = (selectedProject?.projectName || "Project").replace(/\s+/g, "_");
    XLSX.writeFile(wb, `Project_Progress_Summary_${projectLabel}_${today}.xlsx`);
  };

  const handleSaveToStorage = async () => {
    setExportingToStorage(true);
    setExportMsg("");
    try {
      await projectProgressService.exportToStorage(selectedProject.projectId);
      setExportMsg("Saved to Storage.");
      setTimeout(() => setExportMsg(""), 3000);
    } catch (err) {
      setExportMsg("Failed to save to Storage. Please try again.");
    } finally {
      setExportingToStorage(false);
    }
  };

  const handleExportActivityMatrix = () => {
    const wb = XLSX.utils.book_new();

    const weightageAOA = [];
    weightageAOA.push(["Package", "Activity", ...FLOOR_TYPES, "Total", "Activity Weightage basis cost", "Remarks"]);
    const activityRowIndex = {};
    packages.forEach((pkg) => {
      pkg.activities.forEach((a, idx) => {
        weightageAOA.push([
          idx === 0 ? pkg.name : "",
          a.name,
          ...FLOOR_TYPES.map((f) => Number(a.values[f]) || 0),
          activityTotal(a.values),
          { t: "n", v: Number(a.costWeightage) || 0, z: '0"%"' },
          a.remarks || "",
        ]);
        activityRowIndex[a.name] = weightageAOA.length;
      });
    });
    const lastActivityRow = weightageAOA.length;
    const weightageColLetter = colLetter(2 + FLOOR_TYPES.length + 1);
    weightageAOA.push([
      "", "Total", ...FLOOR_TYPES.map(() => ""), "",
      { t: "n", f: `SUM(${weightageColLetter}2:${weightageColLetter}${lastActivityRow})`, z: '0"%"' },
      "",
    ]);
    const weightageWs = XLSX.utils.aoa_to_sheet(weightageAOA);
    autoFitColumns(weightageWs, weightageAOA);
    applyBaseBorders(weightageWs);
    styleRow(weightageWs, 0, HEADER_STYLE);
    styleCol(weightageWs, 0, 1, weightageAOA.length - 1, PACKAGE_COL_STYLE);
    styleRow(weightageWs, weightageAOA.length - 1, TOTAL_ROW_STYLE);
    XLSX.utils.book_append_sheet(wb, weightageWs, "Tower wise weightage input");

    const activities = flattenActivities(packages);
    towers.forEach((tower) => {
      const matrix = matrixByTower[tower.name];
      if (!matrix) return;

      const aoa = [];
      aoa.push(["Floor", "Weightage", ...activities.map((a) => a.name)]);
      const floorStartRow = aoa.length + 1;
      matrix.floors.forEach((f) => {
        const rowVals = [f.label, Number(f.weightage) || 0];
        activities.forEach((a) => {
          rowVals.push(Number(matrix.values?.[a.name]?.[f.label]) || 0);
        });
        aoa.push(rowVals);
      });
      const floorEndRow = aoa.length;

      const totalRow = ["Total", ""];
      activities.forEach((a, i) => {
        const col = colLetter(2 + i);
        totalRow.push({ t: "n", f: `SUM(${col}${floorStartRow}:${col}${floorEndRow})` });
      });
      aoa.push(totalRow);
      const totalRowIdx = aoa.length;

      const totalColLetter = colLetter(2 + FLOOR_TYPES.length);
      const tfaRow = ["Total floors for activity", ""];
      activities.forEach((a) => {
        const wRow = activityRowIndex[a.name];
        tfaRow.push({ t: "n", f: `'Tower wise weightage input'!${totalColLetter}${wRow}` });
      });
      aoa.push(tfaRow);
      const tfaRowIdx = aoa.length;

      const awRow = ["Activity Weightage %", ""];
      activities.forEach((a) => {
        const wRow = activityRowIndex[a.name];
        awRow.push({ t: "n", f: `'Tower wise weightage input'!${weightageColLetter}${wRow}/100`, z: "0%" });
      });
      aoa.push(awRow);
      const awRowIdx = aoa.length;

      const acRow = ["Activity Completion %", ""];
      activities.forEach((a, i) => {
        const col = colLetter(2 + i);
        acRow.push({ t: "n", f: `IF(${col}${tfaRowIdx}=0,0,${col}${totalRowIdx}/${col}${tfaRowIdx})`, z: "0.0%" });
      });
      aoa.push(acRow);
      const acRowIdx = aoa.length;

      aoa.push([]);
      const firstCol = colLetter(2);
      const lastCol = colLetter(2 + activities.length - 1);
      aoa.push([
        "Tower completion",
        { t: "n", f: `SUMPRODUCT(${firstCol}${acRowIdx}:${lastCol}${acRowIdx},${firstCol}${awRowIdx}:${lastCol}${awRowIdx})`, z: "0.00%" },
      ]);
      const towerCompletionRowIdx = aoa.length;

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      autoFitColumns(ws, aoa);
      applyBaseBorders(ws);
      styleRow(ws, 0, HEADER_STYLE);
      styleCol(ws, 1, 1, floorEndRow - 1, WEIGHTAGE_COL_STYLE);
      styleRow(ws, totalRowIdx - 1, TOTAL_ROW_STYLE);
      styleRow(ws, acRowIdx - 1, COMPLETION_ROW_STYLE);
      styleRow(ws, towerCompletionRowIdx - 1, TOTAL_ROW_STYLE);
      const safeName = tower.name.replace(/[\[\]*/\\?:]/g, "").slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    });

    const today = new Date().toISOString().split("T")[0];
    const projectLabel = (selectedProject?.projectName || "Project").replace(/\s+/g, "_");
    XLSX.writeFile(wb, `Project_Progress_Matrix_${projectLabel}_${today}.xlsx`);
  };

    const handleImportActivityMatrixClick = () => {
    importFileInputRef.current?.click();
  };

  const handleImportActivityMatrixFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMatrixError("");
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const activities = flattenActivities(packages);

      setMatrixByTower((prev) => {
        const updated = { ...prev };

        towers.forEach((tower) => {
          const safeName = tower.name.replace(/[\[\]*/\\?:]/g, "").slice(0, 31);
          const ws = wb.Sheets[safeName];
          if (!ws) return; // no matching sheet for this tower in the uploaded file

          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 });
          if (!aoa.length) return;

          const header = aoa[0]; // ["Floor", "Weightage", ...activity names]
          const activityCols = [];
          header.forEach((h, idx) => {
            if (idx >= 2 && h) activityCols.push({ name: String(h).trim(), col: idx });
          });

          const newFloors = [];
          const newValues = {};
          activities.forEach((a) => {
            newValues[a.name] = {};
          });

          for (let r = 1; r < aoa.length; r++) {
            const row = aoa[r];
            const floorLabel = row[0];
            if (!floorLabel || floorLabel === "Total") break; // stop before summary rows
            const weightage = Number(row[1]) || 0;
            newFloors.push({ label: String(floorLabel), weightage });

            activityCols.forEach(({ name, col }) => {
              if (newValues[name]) {
                newValues[name][String(floorLabel)] = Number(row[col]) || 0;
              }
            });
          }

          if (newFloors.length) {
            updated[tower.name] = {
              ...updated[tower.name],
              floors: newFloors,
              values: newValues,
            };
          }
        });

        return updated;
      });

      setValuesSavedMsg("Imported from Excel. Review below, then click Save to apply.");
      setTimeout(() => setValuesSavedMsg(""), 4000);
    } catch (err) {
      setMatrixError("Failed to read the uploaded Excel file. Please check the file format.");
    } finally {
      e.target.value = "";
    }
  };

  // ---------------- Render guards ----------------
  if (loading) {
    return (
      <Shell embedded={embedded}>
        <div className="text-center text-gray-400 p-16">Loading...</div>
      </Shell>
    );
  }

  if (!isManager && towerStatus === "draft" && towers.every((t) => !t.constructionArea)) {
    return (
      <Shell embedded={embedded}>
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center shadow-sm">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="text-xl font-black text-gray-700 mb-2">Awaiting Manager Setup</h2>
          <p className="text-gray-400 text-sm">
            The Manager hasn't configured the tower structure for this project yet.
          </p>
        </div>
      </Shell>
    );
  }

  // Maker: Tower Configuration is locked, but Manager hasn't finished the Weightage Input step yet
  if (!isManager && towerStatus === "locked" && weightageLoaded && weightageStatus !== "locked") {
    return (
      <Shell embedded={embedded}>
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center shadow-sm">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="text-xl font-black text-gray-700 mb-2">Awaiting Manager Setup</h2>
          <p className="text-gray-400 text-sm">
            The Manager is still finalizing the weightage configuration for this project.
          </p>
        </div>
      </Shell>
    );
  }

  // Maker: Weightage Input is locked, but Manager hasn't finished the Activity Matrix structure for any tower yet
  if (
    !isManager &&
    weightageStatus === "locked" &&
    matrixLoaded &&
    towers.length > 0 &&
    towers.every((t) => matrixByTower[t.name]?.status !== "locked")
  ) {
    return (
      <Shell embedded={embedded}>
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center shadow-sm">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="text-xl font-black text-gray-700 mb-2">Awaiting Manager Setup</h2>
          <p className="text-gray-400 text-sm">
            The Manager hasn't finalized the activity matrix structure for any tower yet.
          </p>
        </div>
      </Shell>
    );
  }

  const towerReadOnly = !isManager || towerStatus === "locked";
  const nonTowerReadOnly = !isManager || nonTowerStatus === "locked";
  // Combined list used by Weightage Input / Activity Matrix / Tower Level Status
  // so Non Tower Area flows through the exact same per-entity UI as towers.
  const allEntities = includeNonTower && nonTowerStatus === "locked" ? [...towers, nonTowerConfig] : towers;

  return (
    <Shell embedded={embedded}>
      {!embedded && (
        <button onClick={() => navigate("/services/continuous-monitoring")}
          className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all">
          ← Back
        </button>
      )}
      <div className="space-y-6">

        {/* ================= Tower Configuration ================= */}
        {isManager && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-gray-700">Tower Configuration</h2>
            {isManager && towerStatus === "locked" && (
  <button
    onClick={handleUnlock}
    className="border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold text-sm px-4 py-2 rounded-xl"
  >
    Edit configuration
  </button>
)}
            {towerStatus === "locked" && (
              <span className="text-xs font-bold uppercase tracking-wide text-green-600 bg-green-50 px-3 py-1 rounded-full">
                Locked
              </span>
            )}
          </div>

          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">No. of Towers</label>
              <div className="mt-1 text-lg font-bold text-gray-800">{towers.length} nos.</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Total Tower Area (sq m)</label>
              <input
                type="number"
                disabled={towerReadOnly}
                value={totalTowerArea}
                onChange={(e) => setTotalTowerArea(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Non Tower Area (sq m)</label>
              <input
                type="number"
                disabled={towerReadOnly}
                value={nonTowerArea}
                onChange={(e) => setNonTowerArea(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </div>
          </div>

          {isManager && (
            <div className="mb-8 flex items-center gap-2">
              <input
                type="checkbox"
                id="includeNonTower"
                checked={includeNonTower}
                disabled={nonTowerStatus === "locked"}
                onChange={(e) => setIncludeNonTower(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="includeNonTower" className="text-sm font-semibold text-gray-600">
                This project also has a Non Tower Area to track
              </label>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-gray-500 font-semibold py-2 pr-4 w-40">Tower Name</th>
                  {towers.map((tower, i) => (
                    <th key={i} className="text-left py-2 px-3 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <input
                          disabled={towerReadOnly}
                          value={tower.name}
                          onChange={(e) => updateTowerName(i, e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold disabled:bg-gray-50"
                        />
                        {!towerReadOnly && towers.length > 1 && (
                          <button onClick={() => removeTower(i)} className="text-gray-300 hover:text-red-500 text-xs" title="Remove tower">
                            ✕
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  {!towerReadOnly && (
                    <th className="py-2 px-3">
                      <button onClick={addTower} className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap">
                        + Add tower
                      </button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {FIELD_ROWS.map((row) => (
                  <tr key={row.key} className="border-t border-gray-100">
                    <td className="py-2 pr-4 text-gray-600 font-medium">{row.label}</td>
                    {towers.map((tower, i) => (
                      <td key={i} className="py-2 px-3">
                        <input
                          type="number"
                          disabled={towerReadOnly}
                          value={tower[row.key]}
                          onChange={(e) => updateTower(i, row.key, e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isManager && towerStatus !== "locked" && (
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save & Lock Configuration"}
              </button>
            </div>
          )}
        </div>
        )}

        {/* ================= Non Tower Configuration ================= */}
        {isManager && includeNonTower && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-gray-700">Non Tower Configuration</h2>
            {isManager && nonTowerStatus === "locked" && (
              <button
                onClick={handleUnlockNonTower}
                className="border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold text-sm px-4 py-2 rounded-xl"
              >
                Edit configuration
              </button>
            )}
            {nonTowerStatus === "locked" && (
              <span className="text-xs font-bold uppercase tracking-wide text-green-600 bg-green-50 px-3 py-1 rounded-full">
                Locked
              </span>
            )}
          </div>

          {nonTowerError && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
              {nonTowerError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-gray-500 font-semibold py-2 pr-4 w-40">Field</th>
                  <th className="text-left py-2 px-3 min-w-[140px]">Non Tower Area</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100">
                  <td className="py-2 pr-4 text-gray-600 font-medium">Construction Area</td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      disabled={nonTowerReadOnly}
                      value={nonTowerConfig.constructionArea}
                      onChange={(e) => updateNonTower("constructionArea", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50"
                    />
                  </td>
                </tr>
                {FIELD_ROWS.filter((row) => row.key !== "constructionArea").map((row) => (
                  <tr key={row.key} className="border-t border-gray-100">
                    <td className="py-2 pr-4 text-gray-600 font-medium">{row.label}</td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        disabled={nonTowerReadOnly}
                        value={nonTowerConfig[row.key]}
                        onChange={(e) => updateNonTower(row.key, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isManager && nonTowerStatus !== "locked" && (
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleSaveNonTower}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save & Lock Configuration"}
              </button>
            </div>
          )}
        </div>
        )}

                {/* ================= Weightage Configuration ================= */}
        {isManager && towerStatus === "locked" && weightageLoaded && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black text-gray-700">Tower Wise Weightage Input</h2>
              <div className="flex items-center gap-3">
                {isManager && weightageStatus === "locked" && (
                  <button
                    onClick={handleUnlockWeightage}
                    className="border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold text-sm px-4 py-2 rounded-xl"
                  >
                    Edit configuration
                  </button>
                )}
                {weightageStatus === "locked" && (
                  <span className="text-xs font-bold uppercase tracking-wide text-green-600 bg-green-50 px-3 py-1 rounded-full">
                    Locked
                  </span>
                )}
              </div>
            </div>

            {weightageError && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
                {weightageError}
              </div>
            )}

            {/* Tower tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200">
              {allEntities.map((tower, i) => (
                <button
                  key={tower.name}
                  onClick={() => setActiveWeightageTowerTab(i)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
                    activeWeightageTowerTab === i
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {tower.name}
                </button>
              ))}
            </div>

            {(() => {
              const tower = allEntities[activeWeightageTowerTab];
              if (!tower) return null;
              return (
                <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-2 px-3 font-semibold text-gray-500 min-w-[160px]">Package</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-500 min-w-[180px]">Activity</th>
                        {FLOOR_TYPES.map((f) => (
                          <th key={f} className="text-left py-2 px-2 font-semibold text-gray-500 min-w-[80px]">{f}</th>
                        ))}
                        <th className="text-left py-2 px-2 font-semibold text-gray-500">Total</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-500 min-w-[110px]">Cost Weightage %</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-500 min-w-[160px]">Remarks</th>
                        {!weightageReadOnly && <th className="py-2 px-2"></th>}
                      </tr>
                      <tr className="bg-amber-50 border-t border-amber-100">
                        <td className="py-2 px-3 font-bold text-amber-800" colSpan={2}>Tower Configuration</td>
                        {FLOOR_TYPES.map((f) => (
                          <td key={f} className="py-2 px-2 font-semibold text-amber-800">
                            {towerConfigValueForFloorType(tower, f)}
                          </td>
                        ))}
                        <td className="py-2 px-2"></td>
                        <td className="py-2 px-2"></td>
                        <td className="py-2 px-3"></td>
                        {!weightageReadOnly && <td className="py-2 px-2"></td>}
                      </tr>
                    </thead>
                    <tbody>
                      {packages.map((pkg, pIndex) => (
                        <React.Fragment key={pIndex}>
                          {pkg.activities.map((activity, aIndex) => (
                            <tr key={`${pIndex}-${aIndex}`} className="border-t border-gray-100">
                              {aIndex === 0 ? (
                              <td className="py-2 px-3 align-top font-bold text-gray-700 bg-orange-50 border-r border-orange-100" rowSpan={pkg.activities.length}>
                                  <div className="flex items-start gap-1">
                                    <input
                                      disabled={weightageReadOnly}
                                      value={pkg.name}
                                      onChange={(e) => updatePackageName(pIndex, e.target.value)}
                                      className="w-full min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold disabled:bg-transparent disabled:border-transparent whitespace-nowrap"
                                    />
                                    {!weightageReadOnly && packages.length > 1 && (
                                      <button onClick={() => removePackage(pIndex)} className="text-gray-300 hover:text-red-500 text-xs mt-1" title="Remove package">
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                  {!weightageReadOnly && (
                                    <button onClick={() => addActivity(pIndex)} className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 mt-2">
                                      + Add activity
                                    </button>
                                  )}
                                </td>
                              ) : null}
                              <td className="py-2 px-3">
                                <input
                                  disabled={weightageReadOnly}
                                  value={activity.name}
                                  onChange={(e) => updateActivityName(pIndex, aIndex, e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs disabled:bg-gray-50"
                                />
                              </td>
                              {FLOOR_TYPES.map((f) => (
                                <td key={f} className="py-2 px-2">
                                  <input
                                    type="number"
                                    disabled={weightageReadOnly}
                                    value={activity.values[f]}
                                    onChange={(e) => updateActivityValue(pIndex, aIndex, f, e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs disabled:bg-gray-50"
                                  />
                                </td>
                              ))}
                              <td className="py-2 px-2 font-semibold text-gray-700">{activityTotal(activity.values)}</td>
                              <td className="py-2 px-2">
                                {getComputedCostWeightage(activity.name) !== null ? (
                                  <input
                                    type="number"
                                    disabled
                                    value={activity.costWeightage}
                                    title="Auto-calculated from Cost Review (Budget ÷ Grand Total)"
                                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-blue-50 text-blue-700 font-semibold"
                                  />
                                ) : (
                                  <input
                                    type="number"
                                    disabled={weightageReadOnly}
                                    value={activity.costWeightage}
                                    onChange={(e) => updateActivityField(pIndex, aIndex, "costWeightage", e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs disabled:bg-gray-50"
                                  />
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  disabled={weightageReadOnly}
                                  value={activity.remarks}
                                  onChange={(e) => updateActivityField(pIndex, aIndex, "remarks", e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs disabled:bg-gray-50"
                                />
                              </td>
                              {!weightageReadOnly && (
                                <td className="py-2 px-2">
                                  {pkg.activities.length > 1 && (
                                    <button onClick={() => removeActivity(pIndex, aIndex)} className="text-gray-300 hover:text-red-500 text-xs" title="Remove activity">
                                      ✕
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              );
            })()}

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {!weightageReadOnly && (
                  <button onClick={addPackage} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                    + Add package
                  </button>
                )}
                {!weightageReadOnly && (
                  <button
                    onClick={handleResetToDefaults}
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                    title="Replaces all packages/activities with the default grouping from code"
                  >
                    ⟲ Reset to Defaults
                  </button>
                )}
              </div>
              <div className={`text-xs font-bold ${totalCostWeightage === 100 ? "text-green-600" : "text-amber-600"}`}>
                Total Cost Weightage: {totalCostWeightage}% {totalCostWeightage !== 100 && "(should total 100%)"}
              </div>
            </div>

            {isManager && weightageStatus !== "locked" && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSaveWeightage}
                  disabled={savingWeightage}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl disabled:opacity-50"
                >
                  {savingWeightage ? "Saving..." : "Save & Lock Configuration"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= Tower Activity Matrix ================= */}
        {weightageStatus === "locked" && matrixLoaded && towers.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-gray-700">Tower Activity Matrix</h2>
              <p className="text-xs text-gray-400">
                Manager defines the floor list and each floor's Weightage. Maker then fills in progress for every activity, bounded by that floor's Weightage.
              </p>
            </div>

            {matrixError && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
                {matrixError}
              </div>
            )}
            {valuesSavedMsg && (
              <div className="mb-4 text-sm text-green-600 bg-green-50 border border-green-100 rounded-lg px-4 py-2">
                {valuesSavedMsg}
              </div>
            )}

            {/* Tower tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200">
              {allEntities.map((tower, i) => (
                <button
                  key={tower.name}
                  onClick={() => setActiveTowerTab(i)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
                    activeTowerTab === i
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {tower.name}
                  {matrixByTower[tower.name]?.status === "locked" && (
                    <span className="ml-2 text-[10px] font-bold uppercase text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                      Locked
                    </span>
                  )}
                </button>
              ))}
            </div>

            {(() => {
              const tower = allEntities[activeTowerTab];
              const matrix = matrixByTower[tower?.name];
              if (!tower || !matrix) return null;

              const activities = flattenActivities(packages);
              const groupedColumns = groupedActivityColumns(packages);
              const structureLocked = matrix.status === "locked";
              const canEditStructure = isManager && !structureLocked;
              const canEditValues = isMaker && structureLocked;

              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          <th rowSpan={2} className="text-left py-2 px-3 font-semibold text-gray-500 min-w-[90px] align-bottom">Floor</th>
                          <th rowSpan={2} className="text-left py-2 px-2 font-semibold text-gray-500 min-w-[90px] align-bottom">Weightage</th>
                          {groupedColumns.map((pkg, pkgIdx) => (
                            <th
                              key={pkg.name}
                              colSpan={pkg.activities.length}
                              className={`text-center py-1.5 px-2 font-bold text-gray-600 border-b border-gray-200 bg-gray-100 ${
                                pkgIdx < groupedColumns.length - 1 ? "border-r-2 border-r-gray-400" : ""
                              }`}
                            >
                              {pkg.name}
                            </th>
                          ))}
                        </tr>
                        <tr className="bg-gray-50">
                          {activities.map((a) => {
                            const isLastInPackage = groupedColumns.some((pkg) => pkg.activities.slice(-1)[0] === a.name);
                            return (
                              <th
                                key={a.name}
                                className={`text-left py-2 px-2 font-semibold text-gray-500 min-w-[100px] ${
                                  isLastInPackage ? "border-r-2 border-r-gray-300" : ""
                                }`}
                              >
                                {a.name}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.floors.map((floor, floorIndex) => (
                          <tr key={floorIndex} className="border-t border-gray-100">
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1">
                                <input
                                  disabled={!canEditStructure}
                                  value={floor.label}
                                  onChange={(e) => updateFloorLabel(tower.name, floorIndex, e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold disabled:bg-gray-50"
                                />
                                {canEditStructure && matrix.floors.length > 1 && (
                                  <button
                                    onClick={() => removeFloorRow(tower.name, floor.label)}
                                    className="text-gray-300 hover:text-red-500 text-xs shrink-0"
                                    title="Remove floor"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="0.1"
                                disabled={!canEditStructure}
                                value={floor.weightage}
                                onChange={(e) => updateFloorWeightage(tower.name, floor.label, e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs disabled:bg-gray-50"
                              />
                            </td>
                            {activities.map((a, aColIdx) => {
                              const isLastInPackage = a.name === groupedColumns.find((pkg) =>
                                pkg.activities[pkg.activities.length - 1] === a.name
                              )?.activities.slice(-1)[0];
                              return (
                                <td
                                  key={a.name}
                                  className={`py-2 px-2 text-center ${isLastInPackage ? "border-r-2 border-r-gray-300" : ""}`}
                                >
                                  {!structureLocked ? (
                                    <span className="text-gray-300">—</span>
                                  ) : (
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      max={floor.weightage}
                                      disabled={!canEditValues}
                                      value={matrix.values?.[a.name]?.[floor.label] ?? 0}
                                      onChange={(e) => updateActivityMatrixValue(tower.name, a.name, floor.label, e.target.value)}
                                      title={`Max ${floor.weightage} (this floor's Weightage)`}
                                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-center disabled:bg-gray-50"
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                          <td className="py-2 px-3" colSpan={2}>Total</td>
                          {activities.map((a) => (
                            <td key={a.name} className="py-2 px-2 text-gray-700 text-center">
                              {totalEntered(tower.name, a.name)}
                            </td>
                          ))}
                        </tr>
                        <tr className="bg-gray-50 font-semibold">
                          <td className="py-2 px-3" colSpan={2}>Total floors for activity</td>
                          {activities.map((a) => (
                            <td key={a.name} className="py-2 px-2 text-gray-600 text-center">
                              {getActivityWeightageTotal(a.name)}
                            </td>
                          ))}
                        </tr>
                        <tr className="bg-gray-50">
                          <td className="py-2 px-3" colSpan={2}>Activity Weightage %</td>
                          {activities.map((a) => (
                            <td key={a.name} className="py-2 px-2 text-gray-600 text-center">
                              {getActivityCostWeightage(a.name)}%
                            </td>
                          ))}
                        </tr>
                        <tr className="bg-blue-50 font-bold">
                          <td className="py-2 px-3" colSpan={2}>Activity Completion %</td>
                          {activities.map((a) => (
                            <td key={a.name} className="py-2 px-2 text-blue-700 text-center">
                              {activityCompletionPercent(tower.name, a.name)}%
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    {canEditStructure && (
                      <button
                        onClick={() => addFloorRow(tower.name)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        + Add Floor
                      </button>
                    )}
                    <div />
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3">
                    <input
                      ref={importFileInputRef}
                      type="file"
                      accept=".xlsx"
                      onChange={handleImportActivityMatrixFile}
                      className="hidden"
                    />
                    {structureLocked && (
                      <button
                        onClick={handleImportActivityMatrixClick}
                        className="border border-emerald-600 text-emerald-600 hover:bg-emerald-50 font-semibold text-sm px-6 py-2.5 rounded-xl"
                      >
                        Upload Activity Matrix (Excel)
                      </button>
                    )}
                    {structureLocked && (
                      <button
                        onClick={handleExportActivityMatrix}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl"
                      >
                        Download Activity Matrix (Excel)
                      </button>
                    )}
                   {isManager && structureLocked && (
  <button
    onClick={() => handleUnlockMatrix(tower.name)}
    className="border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold text-sm px-4 py-2 rounded-xl"
  >
    Edit structure
  </button>
)}
                    {isManager && !structureLocked && (
                      <button
                        onClick={() => handleSaveMatrixStructure(tower.name)}
                        disabled={savingMatrixStructure}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl disabled:opacity-50"
                      >
                        {savingMatrixStructure ? "Saving..." : `Save & Lock ${tower.name} Structure`}
                      </button>
                    )}
                    {isMaker && structureLocked && (
                      <button
                        onClick={() => handleSaveMatrixValues(tower.name)}
                        disabled={savingMatrixValues}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl disabled:opacity-50"
                      >
                        {savingMatrixValues ? "Saving..." : "Save Progress"}
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ================= Tower Level Status ================= */}
        {weightageStatus === "locked" && matrixLoaded && towers.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <h2 className="text-lg font-black text-gray-700 mb-1">Tower Level Status</h2>
            <p className="text-xs text-gray-400 mb-6">
              Each activity's Completion % weighted by its Cost Weightage %, rolled up per tower.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 font-semibold text-gray-500 min-w-[100px]">Tower</th>
                    {flattenActivities(packages).map((a) => (
                      <th key={a.name} className="text-left py-2 px-2 font-semibold text-gray-500 min-w-[90px]">
                        {a.name}
                      </th>
                    ))}
                    <th className="text-left py-2 px-3 font-bold text-gray-700 min-w-[110px] bg-blue-50">Tower Total</th>
                  </tr>
                </thead>
                <tbody>
                  {allEntities.map((tower) => (
                    <tr key={tower.name} className="border-t border-gray-100">
                      <td className="py-2 px-3 font-bold text-gray-700">{tower.name}</td>
                      {flattenActivities(packages).map((a) => (
                        <td key={a.name} className="py-2 px-2 text-gray-600">
                          {matrixByTower[tower.name] ? activityCompletionPercent(tower.name, a.name) : "0.0"}%
                        </td>
                      ))}
                      <td className="py-2 px-3 font-bold text-blue-700 bg-blue-50">
                        {matrixByTower[tower.name] ? towerProgressPercent(tower.name).toFixed(2) : "0.00"}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                    <td className="py-2 px-3 text-gray-800">Total</td>
                    {flattenActivities(packages).map((a) => (
                      <td key={a.name} className="py-2 px-2 text-gray-700">
                        {activityWeightedTotalPercent(a.name).toFixed(1)}%
                      </td>
                    ))}
                    <td className="py-2 px-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ================= Project Level Summary ================= */}
        {weightageStatus === "locked" && matrixLoaded && towers.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <h2 className="text-lg font-black text-gray-700 mb-1">Project Level Summary</h2>
            <p className="text-xs text-gray-400 mb-6">
              Each tower's Progress weighted by its share of Total Tower Area.
            </p>

            <div className="max-w-md">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 font-semibold text-gray-500">Tower</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-500">Weightage</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-500">Tower Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {allEntities.map((tower) => (
                    <tr key={tower.name} className="border-t border-gray-100">
                      <td className="py-2 px-3 font-bold text-gray-700">{tower.name}</td>
                      <td className="py-2 px-3 text-gray-600">{towerWeightagePercent(tower).toFixed(0)}%</td>
                      <td className="py-2 px-3 text-gray-600">
                        {matrixByTower[tower.name] ? towerProgressPercent(tower.name).toFixed(2) : "0.00"}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-blue-50 font-bold">
                    <td className="py-3 px-3 text-gray-800" colSpan={2}>Project Progress</td>
                    <td className="py-3 px-3 text-blue-700 text-base">{projectProgressPercent().toFixed(2)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              {exportMsg && <span className="text-xs text-gray-500">{exportMsg}</span>}
              {isManager && (
                <button
                  onClick={handleSaveToStorage}
                  disabled={exportingToStorage}
                  className="border border-emerald-600 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 font-semibold text-sm px-5 py-2.5 rounded-xl"
                >
                  {exportingToStorage ? "Saving..." : "Save to Storage"}
                </button>
              )}
              <button
                onClick={handleExportExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl"
              >
                Download Excel
              </button>
            </div>
          </div>
        )}

      </div>
    </Shell>
  );
}
