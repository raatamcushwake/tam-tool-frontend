import { Fragment, useEffect, useState } from "react";
import axios from "axios";

// ── Static structure (mirrors the C&WI project-cost workbook) ──────────
const SECTIONS = [
  {
    title: "Preliminary",
    items: [
      { head: "Pre", desc: "BOUNDARY & FENCING" },
      { head: "Pre", desc: "BOREWELL & SOIL TESTING" },
      { head: "Pre", desc: "Equipments" },
      { head: "Pre", desc: "Safety" },
    ],
  },
  {
    title: "RCC and Civil",
    subsections: [
      {
        title: "RCC",
        items: [
          { head: "RCC", desc: "Excavation & piling" },
          { head: "RCC", desc: "Steel" },
          { head: "RCC", desc: "Concrete" },
          { head: "RCC", desc: "Shuttering: Resi" },
          { head: "RCC", desc: "Shuttering: Non Resi" },
          { head: "RCC", desc: "Labor charges" },
          { head: "RCC", desc: "Antitermite" },
          { head: "RCC", desc: "Soiling & PCC" },
        ],
      },
      {
        title: "Civil",
        items: [
          { head: "Civil", desc: "Waterproofing" },
          { head: "Civil", desc: "Blockwork: Resi" },
          { head: "Civil", desc: "Blockwork: Non Resi" },
          { head: "Civil", desc: "Internal plaster: Resi" },
          { head: "Civil", desc: "Internal plaster: Non Resi" },
          { head: "Civil", desc: "External Plaster: Resi" },
          { head: "Civil", desc: "External Plaster: Non Resi" },
        ],
      },
    ],
  },
  {
    title: "Finishing",
    items: [
      { head: "FINISHING", desc: "Flooring: Resi" },
      { head: "FINISHING", desc: "Dado: Resi" },
      { head: "FINISHING", desc: "Flooring: Non Resi" },
      { head: "FINISHING", desc: "Kitchen platform" },
      { head: "FINISHING", desc: "Toilet counter" },
      { head: "FINISHING", desc: "Window sill" },
      { head: "FINISHING", desc: "Gypsum/ Patra  punning" },
      { head: "FINISHING", desc: "Door frame & shutter" },
      { head: "FINISHING", desc: "Door frame & shutter" },
      { head: "FINISHING", desc: "Windows" },
      { head: "FINISHING", desc: "Internal Paint: Resi" },
      { head: "FINISHING", desc: "Internal Paint: Non Resi" },
      { head: "FINISHING", desc: "External Paint" },
      { head: "FINISHING", desc: "S/C railing" },
      { head: "FINISHING", desc: "Window SS railing" },
      { head: "FINISHING", desc: "Fabrication: shutters" },
      { head: "FINISHING", desc: "False-ceiling" },
    ],
  },
  {
    title: "MEP",
    items: [
      { head: "MEP", desc: "Plumbing: conceal" },
      { head: "MEP", desc: "Plumbing: Fixtures" },
      { head: "MEP", desc: "Electrical: Conceal" },
      { head: "MEP", desc: "Electrical: fixtures" },
      { head: "MEP", desc: "Elevator" },
      { head: "MEP", desc: "Pumps & Panels" },
      { head: "MEP", desc: "Stacker / tower parking" },
      { head: "MEP", desc: "Fire Fighting" },
    ],
  },
  {
    title: "Infra",
    items: [
      { head: "Infra", desc: "STP" },
      { head: "Infra", desc: "DG SET" },
      { head: "Infra", desc: "Lightning protection system" },
      { head: "Infra", desc: "CCTV" },
      { head: "Infra", desc: "Compound Paving" },
      { head: "Infra", desc: "Compound wall" },
      { head: "Infra", desc: "Security cabin" },
      { head: "Infra", desc: "Gate" },
      { head: "Infra", desc: "SWD & Service chambers" },
      { head: "Infra", desc: "Tremix in parking area" },
      { head: "Infra", desc: "Meter room" },
      { head: "Infra", desc: "Signages, Letter boxes, name plates & Building logo" },
      { head: "Infra", desc: "RWH" },
    ],
  },
  {
    title: "Amenities",
    items: [
      { head: "Amenities", desc: "Gym" },
      { head: "Amenities", desc: "Changing room - Gents & Ladies" },
      { head: "Amenities", desc: "BMS" },
      { head: "Amenities", desc: "Panel Room" },
      { head: "Amenities", desc: "Landscape" },
      { head: "Amenities", desc: "Entrance Lobby" },
      { head: "Amenities", desc: "Façade: louvers" },
      { head: "Amenities", desc: "Building illumination" },
    ],
  },
  {
    title: "Misc.",
    items: [
      { head: "Misc.", desc: "Electricity" },
      { head: "Misc.", desc: "Water" },
      { head: "Misc.", desc: "Security" },
      { head: "Misc.", desc: "Site Preparation" },
      { head: "Misc.", desc: "Misc O/H" },
      { head: "Misc.", desc: "mathadi" },
    ],
  },
];

const flattenSection = (section) =>
  section.subsections ? section.subsections.flatMap((sub) => sub.items) : section.items;

const FLAT_ITEMS = SECTIONS.flatMap(flattenSection);
const KNOWN_HEADS = new Set(FLAT_ITEMS.map((it) => it.head));

// ── % Progress — maps Cost Review Work Heads/Descriptions to the matching
// Activity name from Project Progress (Tower Activity Matrix). Anything not
// listed here has no Activity Matrix equivalent, so it shows no % Progress.
const PROGRESS_ACTIVITY_MAP = {
  RCC: "RCC",
};

const PROGRESS_DESC_MAP = {
  "Waterproofing": "Waterproofing",
  "Blockwork: Resi": "Blockwork",
  "Blockwork: Non Resi": "Blockwork",
  "Internal plaster: Resi": "Internal Plaster",
  "Internal plaster: Non Resi": "Internal Plaster",
  "External Plaster: Resi": "Ext Plaster",
  "External Plaster: Non Resi": "Ext Plaster",
  "Flooring: Resi": "Flooring- main",
  "Flooring: Non Resi": "Flooring- main",
  "Gypsum/ Patra  punning": "Gypsum (except staircase)",
  "Door frame & shutter": "Door Shutters",
  "Kitchen platform": "Kitchen Platform",
  "Internal Paint: Resi": "Internal Paint",
  "Internal Paint: Non Resi": "Internal Paint",
  "External Paint": "External Painting",
  "Elevator": "lift Installation",
  "Plumbing: conceal": "Plumbing Downtakes and looping",
  "Fire Fighting": "Fire fighting & FF",
  "Electrical: Conceal": "Electrical Wiring",
  "Electrical: fixtures": "Electrical Fittings",
};

const emptyRow = () => ({
  coeff: "",
  quantity: "",
  unit: "",
  rate: "",       // CWI Rate
  remarks: "",
  cwiCI: "",
  cwiCTC: "",
  devRate: "",
  devCI: "",
  devCTC: "",
});
const DEFAULT_ROWS = FLAT_ITEMS.map(() => emptyRow());
const DEFAULT_AREAS = {
  nonResi: { value: "", unit: "sft", remarks: "" },
  resi: { value: "", unit: "sft", remarks: "" },
};

// ── Comparison Report Table: free-form, manually entered (independent of SECTIONS) ──
let comparisonRowSeq = 0;
const emptyComparisonRow = () => ({
  id: `c${Date.now()}_${comparisonRowSeq++}`,
  item: "",
  devRate: "",
  devBudget: "",
  devCI: "",
  devCTC: "",
  cwiRate: "",
  cwiBudget: "",
  cwiCI: "",
  cwiCTC: "",
});

// ── Custom Work Heads / Descriptions — Maker-added, always appended at the
// end of the table so existing fixed rows never shift position. ──────────
let customSectionSeq = 0;
let customItemSeq = 0;

const numberOrZero = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

// Budget (in cr) = Quantity × Rate ÷ 1,00,00,000
const calcBudget = (quantity, rate) => (numberOrZero(quantity) * numberOrZero(rate)) / 1e7;

const hasCoeff = (coeff) => coeff !== "" && coeff !== null && coeff !== undefined && !isNaN(parseFloat(coeff));

export default function CostReview({ projectId }) {
  const [areas, setAreas] = useState(DEFAULT_AREAS);
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [comparisonRows, setComparisonRows] = useState(() => [emptyComparisonRow()]);
  const [comparisonMode, setComparisonMode] = useState("manual"); // "excel" | "manual" | "auto"
  const [autoComparisonRows, setAutoComparisonRows] = useState({}); // keyed by section title
  const [customSections, setCustomSections] = useState([]); // Maker-added Work Heads, appended at the end
  const [activityProgress, setActivityProgress] = useState({}); // { "RCC": 24.8, "Blockwork": 14.3, ... }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Which of the two sections is showing right now.
  const [activeView, setActiveView] = useState("cwi"); // "cwi" | "comparison"

  // Collapsed by default — table "forms" as the user expands sections/subsections.
  const [expandedSections, setExpandedSections] = useState(() => new Set());
  const [expandedSubs, setExpandedSubs] = useState(() => new Set());
    const [expandedAutoSections, setExpandedAutoSections] = useState(() => new Set());
  const [expandedAutoSubs, setExpandedAutoSubs] = useState(() => new Set());
  const [excludedAutoRows, setExcludedAutoRows] = useState(() => new Set());
  const [excludedAutoSections, setExcludedAutoSections] = useState(() => new Set());

  // Soft-hide state for fixed (hardcoded) sections/subsections/items in
  // CWI Cost Working. Data is preserved — only display + totals change —
  // so nothing shifts positionally in `rows` and it survives Save → reload.
  const [hiddenSectionKeys, setHiddenSectionKeys] = useState(() => new Set());
  const [hiddenSubKeys, setHiddenSubKeys] = useState(() => new Set());
  const [hiddenItemKeys, setHiddenItemKeys] = useState(() => new Set());
  const [showHidden, setShowHidden] = useState(false);

  const canEdit = true; // TODO: tighten to Maker-only once role logic is confirmed

  // Fixed items + Maker-added custom items, in the exact order they occupy in `rows`
  const customFlatItems = customSections.flatMap((s) =>
    s.items.map((it) => ({ head: it.head, desc: it.desc }))
  );
  const ALL_ITEMS = [...FLAT_ITEMS, ...customFlatItems];

  const totalArea = numberOrZero(areas.nonResi.value) + numberOrZero(areas.resi.value);

  const getRowArea = (desc) => {
    if (/non resi/i.test(desc)) return numberOrZero(areas.nonResi.value);
    if (/\bresi\b/i.test(desc)) return numberOrZero(areas.resi.value);
    return totalArea;
  };

  const getEffectiveQuantity = (row, desc) => {
    if (hasCoeff(row.coeff)) {
      return parseFloat(row.coeff) * getRowArea(desc);
    }
    return numberOrZero(row.quantity);
  };

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    axios
      .get(`/api/tdd/cost-review/${projectId}`)
      .then((res) => {
        if (res.data?.areas) setAreas({ ...DEFAULT_AREAS, ...res.data.areas });
        if (res.data?.customSections?.length) setCustomSections(res.data.customSections);
        if (res.data?.rows?.length) setRows(res.data.rows);
        if (res.data?.comparisonRows?.length) {
          setComparisonRows(
            res.data.comparisonRows.map((r, i) => ({
              ...r,
              id: r.id ? r.id : `c${Date.now()}_${i}`,
            }))
          );
        } else {
          setComparisonRows([emptyComparisonRow()]);
        }
        setExcludedAutoRows(new Set(res.data?.excludedAutoRowKeys || []));
        setExcludedAutoSections(new Set(res.data?.excludedAutoSectionKeys || []));
        setHiddenSectionKeys(new Set(res.data?.hiddenSectionKeys || []));
        setHiddenSubKeys(new Set(res.data?.hiddenSubKeys || []));
        setHiddenItemKeys(new Set(res.data?.hiddenItemKeys || []));
      })
      .catch((err) => console.error("Failed to load cost review:", err))
      .finally(() => setLoading(false));
  }, [projectId]);

  // % Progress — pulled from Project Progress's Activity Matrix (Tower Level
  // Status "Total" row). Uses the same base URL pattern as
  // projectProgressService.js since this endpoint lives in that router.
  useEffect(() => {
    if (!projectId) return;
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    axios
      .get(`${API_URL}/api/projects/${projectId}/activity-summary`)
      .then((res) => setActivityProgress(res.data || {}))
      .catch(() => setActivityProgress({}));
  }, [projectId]);

  const getProgressPercent = (head, desc) => {
    const activityName = PROGRESS_DESC_MAP[desc] || PROGRESS_ACTIVITY_MAP[head];
    if (!activityName) return null;
    const pct = activityProgress[activityName];
    return pct === undefined || pct === null ? null : pct;
  };

  const fmtPct = (pct) => (pct === null || pct === undefined ? "—" : `${pct.toFixed(1)}%`);

  const updateArea = (key, field, value) => {
    setAreas((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const updateCell = (rowIndex, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === rowIndex ? { ...r, [field]: value } : r)));
  };

  const updateComparisonCell = (id, field, value) => {
    setComparisonRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const updateAutoField = (key, field, value) => {
    setAutoComparisonRows((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value },
    }));
  };

  const addComparisonRow = () => {
    setComparisonRows((prev) => [...prev, emptyComparisonRow()]);
  };

  const removeComparisonRow = (id) => {
    setComparisonRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  // Maker-only: add a new Work Head (custom section), always appended at the end
  const addCustomSection = () => {
    const title = window.prompt("Enter new Work Head name:");
    if (!title || !title.trim()) return;
    setCustomSections((prev) => [
      ...prev,
      { id: `cs${Date.now()}_${customSectionSeq++}`, title: title.trim(), items: [] },
    ]);
  };

  // Maker-only: add a new Work Description under an existing custom Work Head
  const addCustomItem = (sectionId) => {
    const desc = window.prompt("Enter Work Description:");
    if (!desc || !desc.trim()) return;
    const section = customSections.find((s) => s.id === sectionId);
    if (!section) return;
    setCustomSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: [
                ...s.items,
                { id: `ci${Date.now()}_${customItemSeq++}`, head: s.title, desc: desc.trim() },
              ],
            }
          : s
      )
    );
    setRows((prev) => [...prev, emptyRow()]);
  };

  // Maker-only: add an extra Work Description under an EXISTING Work Head
  const addExtraItem = (head) => {
    const desc = window.prompt(`Enter extra Work Description for "${head}":`);
    if (!desc || !desc.trim()) return;
    const existing = customSections.find((s) => s.title === head);
    if (existing) {
      setCustomSections((prev) =>
        prev.map((s) =>
          s.title === head
            ? {
                ...s,
                items: [...s.items, { id: `ci${Date.now()}_${customItemSeq++}`, head, desc: desc.trim() }],
              }
            : s
        )
      );
    } else {
      setCustomSections((prev) => [
        ...prev,
        {
          id: `cs${Date.now()}_${customSectionSeq++}`,
          title: head,
          items: [{ id: `ci${Date.now()}_${customItemSeq++}`, head, desc: desc.trim() }],
        },
      ]);
    }
    setRows((prev) => [...prev, emptyRow()]);
  };

  // Helper: find the index in `rows` where a given custom section's items start
  const getCustomSectionStartIndex = (sectionId) => {
    let startIndex = FLAT_ITEMS.length;
    for (const s of customSections) {
      if (s.id === sectionId) break;
      startIndex += s.items.length;
    }
    return startIndex;
  };

  // Maker-only: delete an entire custom Work Head (and all its rows)
  const removeCustomSection = (sectionId) => {
    const section = customSections.find((s) => s.id === sectionId);
    if (!section) return;
    if (!window.confirm(`Delete Work Head "${section.title}" and all its items?`)) return;

    const startIndex = getCustomSectionStartIndex(sectionId);
    const itemCount = section.items.length;

    setRows((prev) => {
      const next = [...prev];
      next.splice(startIndex, itemCount);
      return next;
    });
    setCustomSections((prev) => prev.filter((s) => s.id !== sectionId));
  };

  // Maker-only: delete a single custom Work Description
  const removeCustomItem = (sectionId, itemId) => {
    const section = customSections.find((s) => s.id === sectionId);
    if (!section) return;
    const itemIndexInSection = section.items.findIndex((it) => it.id === itemId);
    if (itemIndexInSection === -1) return;
    if (!window.confirm("Delete this Work Description?")) return;

    const rowIndex = getCustomSectionStartIndex(sectionId) + itemIndexInSection;

    setRows((prev) => {
      const next = [...prev];
      next.splice(rowIndex, 1);
      return next;
    });
    setCustomSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, items: s.items.filter((it) => it.id !== itemId) } : s
      )
    );
  };

  const toggleSection = (title) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
  };

  const toggleSub = (key) => {
    setExpandedSubs((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
    const toggleAutoSection = (key) => {
    setExpandedAutoSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAutoSub = (key) => {
    setExpandedAutoSubs((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleExcludeAutoRow = (rowIndex) => {
    setExcludedAutoRows((prev) => {
      const next = new Set(prev);
      next.has(rowIndex) ? next.delete(rowIndex) : next.add(rowIndex);
      return next;
    });
  };

  const toggleExcludeAutoSection = (key) => {
    setExcludedAutoSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Stable keys for fixed sections/subsections/items, used for soft-hide.
  const itemKey = (head, desc) => `${head}::${desc}`;
  const subKey = (sectionTitle, subTitle) => `${sectionTitle}::${subTitle}`;

  const toggleHideSection = (title) => {
    setHiddenSectionKeys((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
  };
  const toggleHideSub = (key) => {
    setHiddenSubKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const toggleHideItem = (key) => {
    setHiddenItemKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const rowsToSave = ALL_ITEMS.map((item, i) => {
        const r = rows[i] || emptyRow();
        const quantity = hasCoeff(r.coeff)
          ? String(getEffectiveQuantity(r, item.desc))
          : r.quantity;
        return { ...r, quantity };
      });
      await axios.post(`/api/tdd/cost-review/${projectId}`, {
        projectId,
        areas,
        rows: rowsToSave,
        comparisonRows: getComparisonRowsForPayload(),
        customSections,
        excludedAutoRowKeys: Array.from(excludedAutoRows),
        excludedAutoSectionKeys: Array.from(excludedAutoSections),
        hiddenSectionKeys: Array.from(hiddenSectionKeys),
        hiddenSubKeys: Array.from(hiddenSubKeys),
        hiddenItemKeys: Array.from(hiddenItemKeys),
      });
      alert("Cost Review saved");
    } catch (err) {
      console.error(err);
      alert("Failed to save Cost Review");
    } finally {
      setSaving(false);
    }
  };

  // ── Derived calculations ──
  // For grouped sections: each subsection gets its own subtotal, and the
  // section's total is the sum of its subsections' subtotals.
  // For flat sections: the section's own row-sum IS its total.
  // Both a CWI total/subtotal and a Developer total/subtotal are tracked.
  let cursor = 0;
  const buildRows = (items) => {
    const built = items.map((item, i) => {
      const rowIndex = cursor + i;
      const rawRow = rows[rowIndex] || emptyRow();
      const effectiveQuantity = getEffectiveQuantity(rawRow, item.desc);
      const budget = calcBudget(effectiveQuantity, rawRow.rate);       // CWI budget
      const devBudget = calcBudget(effectiveQuantity, rawRow.devRate); // Developer budget
      return { ...item, ...rawRow, quantity: effectiveQuantity, budget, devBudget, rowIndex };
    });
    cursor += items.length;
    return built;
  };

  const sectionsWithRows = SECTIONS.map((section) => {
    if (section.subsections) {
      const subsectionsWithRows = section.subsections.map((sub) => {
        // cursor must always advance over every item, hidden or not
        const subRows = buildRows(sub.items);
        const visibleSubRows = hiddenSubKeys.has(subKey(section.title, sub.title))
          ? []
          : subRows.filter((r) => !hiddenItemKeys.has(itemKey(r.head, r.desc)));
        const subtotal = visibleSubRows.reduce((sum, r) => sum + r.budget, 0);
        const devSubtotal = visibleSubRows.reduce((sum, r) => sum + r.devBudget, 0);
        return { ...sub, rows: subRows, subtotal, devSubtotal };
      });
      const total = hiddenSectionKeys.has(section.title)
        ? 0
        : subsectionsWithRows.reduce((sum, s) => sum + s.subtotal, 0);
      const devTotal = hiddenSectionKeys.has(section.title)
        ? 0
        : subsectionsWithRows.reduce((sum, s) => sum + s.devSubtotal, 0);
      return { ...section, subsections: subsectionsWithRows, total, devTotal, grouped: true };
    }
    // cursor must always advance over every item, hidden or not
    const sectionRows = buildRows(section.items);
    const visibleRows = hiddenSectionKeys.has(section.title)
      ? []
      : sectionRows.filter((r) => !hiddenItemKeys.has(itemKey(r.head, r.desc)));
    const total = visibleRows.reduce((sum, r) => sum + r.budget, 0);
    const devTotal = visibleRows.reduce((sum, r) => sum + r.devBudget, 0);
    return { ...section, rows: sectionRows, total, devTotal, grouped: false };
  });

  // Custom (Maker-added) sections — processed last, continuing `cursor`
  // right where the fixed SECTIONS above left off.
  const customSectionsWithRows = customSections.map((section) => {
    const sectionRows = buildRows(section.items.map((it) => ({ id: it.id, head: it.head, desc: it.desc })));
    const total = sectionRows.reduce((sum, r) => sum + r.budget, 0);
    const devTotal = sectionRows.reduce((sum, r) => sum + r.devBudget, 0);
    return { ...section, rows: sectionRows, total, devTotal, grouped: false };
  });

  // Extras added onto an existing Work Head vs. genuinely new Work Heads
  const extraSectionsByHead = {};
  const brandNewCustomSections = [];
  customSectionsWithRows.forEach((section) => {
    if (KNOWN_HEADS.has(section.title)) {
      extraSectionsByHead[section.title] = section;
    } else {
      brandNewCustomSections.push(section);
    }
  });

  const extraTotalFor = (head) => extraSectionsByHead[head]?.total || 0;
  const devExtraTotalFor = (head) => extraSectionsByHead[head]?.devTotal || 0;

  // Stable key for a row (used to persist "cut" state across reloads,
  // since positional rowIndex can shift). Declared here, before any
  // function that uses it is invoked during this render.
  const autoRowKey = (r) => `${r.head}::${r.desc}`;

  // All leaf rows belonging to a top-level Work Head, including any
  // Maker-added extra rows nested inside it — used to build the expandable
  // Auto Comparison view and to let individual rows be "cut" from it.
  const getAllRowsForSection = (section) => {
    if (section.grouped) {
      return section.subsections.flatMap((sub) => [
        ...sub.rows,
        ...(extraSectionsByHead[sub.items[0]?.head]?.rows || []),
      ]);
    }
    return [
      ...section.rows,
      ...(extraSectionsByHead[section.items[0]?.head]?.rows || []),
    ];
  };

  // Full CWI + Developer totals for a top-level Work Head, respecting any
  // rows/sections the user has "cut" from the Comparison view only.
  // excludedAutoRows / excludedAutoSections never touch CWI Cost Working —
  // they only affect what gets summed on this tab.
  const sectionFullTotals = (section) => {
    if (excludedAutoSections.has(section.title)) return { cwi: 0, dev: 0 };
    return getAllRowsForSection(section).reduce(
      (acc, r) =>
        excludedAutoRows.has(autoRowKey(r))
          ? acc
          : { cwi: acc.cwi + r.budget, dev: acc.dev + r.devBudget },
      { cwi: 0, dev: 0 }
    );
  };

  // Same as sectionFullTotals but for one subsection (e.g. RCC inside
  // "RCC and Civil") — used so the Redirect-from-Cost-Working table can show
  // the subsection's own budget + % Progress, not just its parent's.
  const subsectionFullTotals = (parentExcluded, subRows) => {
    if (parentExcluded) return { cwi: 0, dev: 0 };
    return subRows.reduce(
      (acc, r) =>
        excludedAutoRows.has(autoRowKey(r))
          ? acc
          : { cwi: acc.cwi + r.budget, dev: acc.dev + r.devBudget },
      { cwi: 0, dev: 0 }
    );
  };

  // One row per top-level Work Head (+ any brand-new custom Work Heads),
  // expandable down to every underlying row, with CWI/Dev Budget pulled
  // straight from CWI Cost Working.
  const autoItems = [
    ...sectionsWithRows.map((section) => ({
      key: section.title,
      title: section.title,
      grouped: section.grouped,
      section,
      ...sectionFullTotals(section),
    })),
    ...brandNewCustomSections.map((section) => ({
      key: section.title,
      title: section.title,
      grouped: false,
      section,
      ...(excludedAutoSections.has(section.title)
        ? { cwi: 0, dev: 0 }
        : section.rows.reduce(
            (acc, r) =>
              excludedAutoRows.has(autoRowKey(r))
                ? acc
                : { cwi: acc.cwi + r.budget, dev: acc.dev + r.devBudget },
            { cwi: 0, dev: 0 }
          )),
    })),
  ];

  // Builds the comparisonRows array to actually save/export, depending on
  // which Comparison Report mode is currently active.
  const getComparisonRowsForPayload = () => {
    if (comparisonMode === "auto") {
      return autoItems.map((item) => {
        const o = autoComparisonRows[item.key] || {};
        return {
          id: item.key,
          item: item.title,
          devRate: o.devRate || "",
          devBudget: String(item.dev),
          devCI: o.devCI || "",
          devCTC: o.devCTC || "",
          cwiRate: o.cwiRate || "",
          cwiBudget: String(item.cwi),
          cwiCI: o.cwiCI || "",
          cwiCTC: o.cwiCTC || "",
        };
      });
    }
    return comparisonRows;
  };

  const grandTotal =
    sectionsWithRows.reduce((sum, s) => sum + s.total, 0) +
    customSectionsWithRows.reduce((sum, s) => sum + s.total, 0);
  const devGrandTotal =
    sectionsWithRows.reduce((sum, s) => sum + s.devTotal, 0) +
    customSectionsWithRows.reduce((sum, s) => sum + s.devTotal, 0);

  const fmt = (n) => n.toFixed(2);
  const fmtArea = (n) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Download: pulls the real, colorful, wrap-text .xlsx from the backend
  // (built fresh from whatever's currently on screen, with both the
  // "CWI Cost Working" and "Comparison Report" sheets).
  const getFilenameFromHeaders = (headers, fallback) => {
    const disposition = headers?.["content-disposition"];
    if (!disposition) return fallback;
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/i) || disposition.match(/filename="?([^";]+)"?/i);
    return match ? decodeURIComponent(match[1]) : fallback;
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const rowsToExport = ALL_ITEMS.map((item, i) => {
        const r = rows[i] || emptyRow();
        const quantity = hasCoeff(r.coeff)
          ? String(getEffectiveQuantity(r, item.desc))
          : r.quantity;
        return { ...r, quantity };
      });

      const response = await axios.post(
        `/api/tdd/cost-review/${projectId}/export`,
        {
          projectId,
          areas,
          rows: rowsToExport,
          comparisonRows: getComparisonRowsForPayload(),
          customSections,
          excludedAutoRowKeys: Array.from(excludedAutoRows),
          excludedAutoSectionKeys: Array.from(excludedAutoSections),
          hiddenSectionKeys: Array.from(hiddenSectionKeys),
          hiddenSubKeys: Array.from(hiddenSubKeys),
          hiddenItemKeys: Array.from(hiddenItemKeys),
        },
        { responseType: "blob" }
      );

      const filename = getFilenameFromHeaders(response.headers, `CostReview_${projectId}.xlsx`);

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to download Cost Review report");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="text-gray-400 text-sm">Loading Cost Review...</div>;

  const th = "border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 bg-gray-50";
  const td = "border border-gray-200 px-2 py-1.5 text-sm text-gray-800";
  const inputCls =
    "w-full text-sm text-right px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500";
  const inputClsLeft =
    "w-full text-sm text-left px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500";

  // ── CWI Cost Working row (unchanged from before) ──
  const renderItemRow = (r, onDelete, isHidden = false) => (
    <tr key={r.rowIndex} className={isHidden ? "opacity-40" : ""}>
      <td className={td}>{r.head}</td>
      <td className={td}>
        <span className={isHidden ? "line-through" : ""}>{r.desc}</span>
      </td>
      <td className={td}>
        {canEdit ? (
          <input
            type="text"
            className={inputCls}
            value={rows[r.rowIndex].coeff}
            onChange={(e) => updateCell(r.rowIndex, "coeff", e.target.value)}
          />
        ) : (
          r.coeff
        )}
      </td>
      <td className={td}>
        {hasCoeff(rows[r.rowIndex].coeff) ? (
          <span className="block text-right text-gray-500">
            {r.quantity.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </span>
        ) : canEdit ? (
          <input
            type="number"
            className={inputCls}
            value={rows[r.rowIndex].quantity}
            onChange={(e) => updateCell(r.rowIndex, "quantity", e.target.value)}
            onWheel={(e) => e.target.blur()}
          />
        ) : (
          r.quantity
        )}
      </td>
      <td className={td}>
        {canEdit ? (
          <input
            type="text"
            className={inputCls}
            value={rows[r.rowIndex].unit}
            onChange={(e) => updateCell(r.rowIndex, "unit", e.target.value)}
          />
        ) : (
          r.unit
        )}
      </td>
      <td className={td}>
        {canEdit ? (
          <input
            type="number"
            className={inputCls}
            value={rows[r.rowIndex].rate}
            onChange={(e) => updateCell(r.rowIndex, "rate", e.target.value)}
            onWheel={(e) => e.target.blur()}
          />
        ) : (
          r.rate
        )}
      </td>
      <td className={`${td} text-right font-medium`}>{fmt(r.budget)}</td>
      <td className={td}>
        {canEdit ? (
          <input
            type="text"
            className={inputClsLeft}
            value={rows[r.rowIndex].remarks}
            onChange={(e) => updateCell(r.rowIndex, "remarks", e.target.value)}
          />
        ) : (
          r.remarks
        )}
      </td>
      <td className={td}></td>
      <td className={td}>
        {onDelete && canEdit && (
          <button
            onClick={() => onDelete(r)}
            className={`text-xs font-semibold px-2 ${
              isHidden ? "text-blue-600 hover:text-blue-800" : "text-red-500 hover:text-red-700"
            }`}
            title={isHidden ? "Restore this row" : "Remove this row"}
          >
            {isHidden ? "↺" : "✕"}
          </button>
        )}
      </td>
    </tr>
  );

    // ── Comparison Report row: fully free-form, manually entered ──
  const numCls =
    "w-full text-sm text-right px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500";
  const textCls =
    "w-full text-sm text-left px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500";

  const renderFreeComparisonRow = (r) => (
    <tr key={r.id}>
      <td className={td}>
        {canEdit ? (
          <input
            type="text"
            className={textCls}
            placeholder="Item name"
            value={r.item}
            onChange={(e) => updateComparisonCell(r.id, "item", e.target.value)}
          />
        ) : (
          r.item
        )}
      </td>

      <td className={td}>
        {canEdit ? (
          <input type="number" className={numCls} value={r.devRate}
            onChange={(e) => updateComparisonCell(r.id, "devRate", e.target.value)}
            onWheel={(e) => e.target.blur()} />
        ) : r.devRate}
      </td>
      <td className={td}>
        {canEdit ? (
          <input type="number" className={numCls} value={r.devBudget}
            onChange={(e) => updateComparisonCell(r.id, "devBudget", e.target.value)}
            onWheel={(e) => e.target.blur()} />
        ) : r.devBudget}
      </td>
      <td className={td}>
        {canEdit ? (
          <input type="number" className={numCls} value={r.devCI}
            onChange={(e) => updateComparisonCell(r.id, "devCI", e.target.value)}
            onWheel={(e) => e.target.blur()} />
        ) : r.devCI}
      </td>
      <td className={td}>
        {canEdit ? (
          <input type="number" className={numCls} value={r.devCTC}
            onChange={(e) => updateComparisonCell(r.id, "devCTC", e.target.value)}
            onWheel={(e) => e.target.blur()} />
        ) : r.devCTC}
      </td>

      <td className={td}>
        {canEdit ? (
          <input type="number" className={numCls} value={r.cwiRate}
            onChange={(e) => updateComparisonCell(r.id, "cwiRate", e.target.value)}
            onWheel={(e) => e.target.blur()} />
        ) : r.cwiRate}
      </td>
      <td className={td}>
        {canEdit ? (
          <input type="number" className={numCls} value={r.cwiBudget}
            onChange={(e) => updateComparisonCell(r.id, "cwiBudget", e.target.value)}
            onWheel={(e) => e.target.blur()} />
        ) : r.cwiBudget}
      </td>
      <td className={td}>
        {canEdit ? (
          <input type="number" className={numCls} value={r.cwiCI}
            onChange={(e) => updateComparisonCell(r.id, "cwiCI", e.target.value)}
            onWheel={(e) => e.target.blur()} />
        ) : r.cwiCI}
      </td>
      <td className={td}>
        {canEdit ? (
          <input type="number" className={numCls} value={r.cwiCTC}
            onChange={(e) => updateComparisonCell(r.id, "cwiCTC", e.target.value)}
            onWheel={(e) => e.target.blur()} />
        ) : r.cwiCTC}
      </td>

      <td className={td}>
        {canEdit && (
          <button
            onClick={() => removeComparisonRow(r.id)}
            className="text-red-500 hover:text-red-700 text-xs font-semibold px-2"
            title="Remove row"
          >
            ✕
          </button>
        )}
      </td>
    </tr>
  );

  const renderAutoDetailRow = (r) => {
    const key = autoRowKey(r);
    const isExcluded = excludedAutoRows.has(key);
    return (
      <tr key={`detail-${r.rowIndex}`} className={isExcluded ? "opacity-40" : ""}>
        <td className={`${td} pl-10 text-gray-600`}>
          <span className={isExcluded ? "line-through" : ""}>{r.desc}</span>
        </td>
        <td className={td}></td>
        <td className={`${td} text-right`}>{fmt(r.devBudget)}</td>
        <td className={td}></td>
        <td className={td}></td>
        <td className={td}></td>
        <td className={`${td} text-right`}>{fmt(r.budget)}</td>
        <td className={td}></td>
        <td className={td}></td>
        <td className={td}>
          {canEdit && (
            <button
              onClick={() => toggleExcludeAutoRow(key)}
              className={`text-xs font-semibold px-2 ${
                isExcluded ? "text-blue-600 hover:text-blue-800" : "text-red-500 hover:text-red-700"
              }`}
              title={isExcluded ? "Include back in Comparison total" : "Cut from Comparison total"}
            >
              {isExcluded ? "↺" : "✕"}
            </button>
          )}
        </td>
      </tr>
    );
  };

  const renderAutoRow = (item) => {
    const o = autoComparisonRows[item.key] || {};
    const isOpen = expandedAutoSections.has(item.key);
    const isSectionExcluded = excludedAutoSections.has(item.key);
    return (
      <Fragment key={item.key}>
        <tr className={isSectionExcluded ? "opacity-50" : ""}>
          <td
            className={`${td} font-medium cursor-pointer select-none`}
            onClick={() => toggleAutoSection(item.key)}
          >
            <span className="inline-block w-4">{isOpen ? "▾" : "▸"}</span>{" "}
            <span className={isSectionExcluded ? "line-through" : ""}>{item.title}</span>
          </td>
          <td className={td}>
            <input type="number" className={numCls} value={o.devRate || ""}
              onChange={(e) => updateAutoField(item.key, "devRate", e.target.value)}
              onWheel={(e) => e.target.blur()} />
          </td>
          <td className={`${td} text-right bg-gray-50 font-medium`} title="Pulled from CWI Cost Working">
            {fmt(item.dev)}
          </td>
          <td className={td}>
            <input type="number" className={numCls} value={o.devCI || ""}
              onChange={(e) => updateAutoField(item.key, "devCI", e.target.value)}
              onWheel={(e) => e.target.blur()} />
          </td>
          <td className={td}>
            <input type="number" className={numCls} value={o.devCTC || ""}
              onChange={(e) => updateAutoField(item.key, "devCTC", e.target.value)}
              onWheel={(e) => e.target.blur()} />
          </td>
          <td className={td}>
            <input type="number" className={numCls} value={o.cwiRate || ""}
              onChange={(e) => updateAutoField(item.key, "cwiRate", e.target.value)}
              onWheel={(e) => e.target.blur()} />
          </td>
          <td className={`${td} text-right bg-gray-50 font-medium`} title="Pulled from CWI Cost Working">
            {fmt(item.cwi)}
          </td>
          <td className={td}>
            <input type="number" className={numCls} value={o.cwiCI || ""}
              onChange={(e) => updateAutoField(item.key, "cwiCI", e.target.value)}
              onWheel={(e) => e.target.blur()} />
          </td>
          <td className={td}>
            <input type="number" className={numCls} value={o.cwiCTC || ""}
              onChange={(e) => updateAutoField(item.key, "cwiCTC", e.target.value)}
              onWheel={(e) => e.target.blur()} />
          </td>
          <td className={td}>
            {canEdit && (
              <button
                onClick={() => toggleExcludeAutoSection(item.key)}
                className={`text-xs font-semibold px-2 ${
                  isSectionExcluded ? "text-blue-600 hover:text-blue-800" : "text-red-500 hover:text-red-700"
                }`}
                title={isSectionExcluded ? "Include this Work Head back in totals" : "Remove this Work Head from totals"}
              >
                {isSectionExcluded ? "↺" : "✕"}
              </button>
            )}
          </td>
        </tr>

        {isOpen && item.grouped &&
          item.section.subsections.map((sub) => {
            const subKey = `${item.key}::${sub.title}`;
            const subOpen = expandedAutoSubs.has(subKey);
            const subRows = [
              ...sub.rows,
              ...(extraSectionsByHead[sub.items[0]?.head]?.rows || []),
            ];
            const subTotals = subsectionFullTotals(isSectionExcluded, subRows);
            const subProgress = getProgressPercent(sub.title, sub.title);
            const so = autoComparisonRows[subKey] || {};
            // CI is auto-calculated as % Progress × Budget whenever a %
            // exists for this subsection (e.g. RCC); otherwise it stays a
            // normal manual input, same as before.
            const devCI = subProgress !== null ? (subProgress / 100) * subTotals.dev : numberOrZero(so.devCI);
            const cwiCI = subProgress !== null ? (subProgress / 100) * subTotals.cwi : numberOrZero(so.cwiCI);
            return (
              <Fragment key={subKey}>
                <tr className="bg-indigo-50/60">
                  <td
                    className={`${td} pl-8 font-semibold text-indigo-900 cursor-pointer select-none`}
                    onClick={() => toggleAutoSub(subKey)}
                  >
                    <span className="inline-block w-4">{subOpen ? "▾" : "▸"}</span> {sub.title}
                    {subProgress !== null && (
                      <span className="ml-2 text-xs font-bold text-indigo-600">{fmtPct(subProgress)}</span>
                    )}
                  </td>
                  <td className={td}>
                    <input type="number" className={numCls} value={so.devRate || ""}
                      onChange={(e) => updateAutoField(subKey, "devRate", e.target.value)}
                      onWheel={(e) => e.target.blur()} />
                  </td>
                  <td className={`${td} text-right bg-gray-50 font-medium`} title="Pulled from CWI Cost Working">
                    {fmt(subTotals.dev)}
                  </td>
                  <td className={`${td} text-right ${subProgress !== null ? "bg-gray-50 font-medium" : ""}`}>
                    {subProgress !== null ? (
                      fmt(devCI)
                    ) : (
                      <input type="number" className={numCls} value={so.devCI || ""}
                        onChange={(e) => updateAutoField(subKey, "devCI", e.target.value)}
                        onWheel={(e) => e.target.blur()} />
                    )}
                  </td>
                  <td className={td}>
                    <input type="number" className={numCls} value={so.devCTC || ""}
                      onChange={(e) => updateAutoField(subKey, "devCTC", e.target.value)}
                      onWheel={(e) => e.target.blur()} />
                  </td>
                  <td className={td}>
                    <input type="number" className={numCls} value={so.cwiRate || ""}
                      onChange={(e) => updateAutoField(subKey, "cwiRate", e.target.value)}
                      onWheel={(e) => e.target.blur()} />
                  </td>
                  <td className={`${td} text-right bg-gray-50 font-medium`} title="Pulled from CWI Cost Working">
                    {fmt(subTotals.cwi)}
                  </td>
                  <td className={`${td} text-right ${subProgress !== null ? "bg-gray-50 font-medium" : ""}`}>
                    {subProgress !== null ? (
                      fmt(cwiCI)
                    ) : (
                      <input type="number" className={numCls} value={so.cwiCI || ""}
                        onChange={(e) => updateAutoField(subKey, "cwiCI", e.target.value)}
                        onWheel={(e) => e.target.blur()} />
                    )}
                  </td>
                  <td className={td}>
                    <input type="number" className={numCls} value={so.cwiCTC || ""}
                      onChange={(e) => updateAutoField(subKey, "cwiCTC", e.target.value)}
                      onWheel={(e) => e.target.blur()} />
                  </td>
                  <td className={td}></td>
                </tr>
                {subOpen && subRows.map((r) => renderAutoDetailRow(r))}
              </Fragment>
            );
          })}

        {isOpen && !item.grouped &&
          getAllRowsForSection(item.section).map((r) => renderAutoDetailRow(r))}
      </Fragment>
    );
  };

  const comparisonDevTotal = comparisonRows.reduce((sum, r) => sum + numberOrZero(r.devBudget), 0);
  const comparisonCwiTotal = comparisonRows.reduce((sum, r) => sum + numberOrZero(r.cwiBudget), 0);
  const autoDevTotal = autoItems.reduce((sum, it) => sum + it.dev, 0);
  const autoCwiTotal = autoItems.reduce((sum, it) => sum + it.cwi, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        The following summary describes overall project area and construction cost breakup:
      </p>

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveView("cwi")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
            activeView === "cwi"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          CWI Cost Working
        </button>
        <button
          onClick={() => setActiveView("comparison")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
            activeView === "comparison"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Comparison Report Table
        </button>
      </div>

      {/* ══════════════ CWI COST WORKING (unchanged) ══════════════ */}
      {activeView === "cwi" && (
        <>
          {/* ── Area summary ── */}
          <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Particulars</th>
                  <th className={th}>Area</th>
                  <th className={th}>Unit</th>
                  <th className={th}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${td} font-semibold`}>Non Residential Area</td>
                  <td className={td}>
                    {canEdit ? (
                      <input
                        type="number"
                        className={inputCls}
                        value={areas.nonResi.value}
                        onChange={(e) => updateArea("nonResi", "value", e.target.value)}
                        onWheel={(e) => e.target.blur()}
                      />
                    ) : (
                      fmtArea(numberOrZero(areas.nonResi.value))
                    )}
                  </td>
                  <td className={td}>sft</td>
                  <td className={td}>
                    {canEdit ? (
                      <input
                        type="text"
                        className={inputClsLeft}
                        value={areas.nonResi.remarks}
                        placeholder="Gr, Podium & terrace"
                        onChange={(e) => updateArea("nonResi", "remarks", e.target.value)}
                      />
                    ) : (
                      areas.nonResi.remarks
                    )}
                  </td>
                </tr>
                <tr>
                  <td className={`${td} font-semibold`}>Residential Area</td>
                  <td className={td}>
                    {canEdit ? (
                      <input
                        type="number"
                        className={inputCls}
                        value={areas.resi.value}
                        onChange={(e) => updateArea("resi", "value", e.target.value)}
                        onWheel={(e) => e.target.blur()}
                      />
                    ) : (
                      fmtArea(numberOrZero(areas.resi.value))
                    )}
                  </td>
                  <td className={td}>sft</td>
                  <td className={td}>
                    {canEdit ? (
                      <input
                        type="text"
                        className={inputClsLeft}
                        value={areas.resi.remarks}
                        placeholder="Resi floors"
                        onChange={(e) => updateArea("resi", "remarks", e.target.value)}
                      />
                    ) : (
                      areas.resi.remarks
                    )}
                  </td>
                </tr>
                <tr className="bg-gray-50 font-bold">
                  <td className={td}>Total</td>
                  <td className={`${td} text-right`}>{fmtArea(totalArea)}</td>
                  <td className={td}>sft</td>
                  <td className={td}></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Cost breakup table ── */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowHidden((v) => !v)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 mb-1"
            >
              {showHidden ? "Hide removed rows" : "Show removed rows"}
            </button>
          </div>
          <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Work Head</th>
                  <th className={th}>Work Description</th>
                  <th className={th}>Coeff</th>
                  <th className={th}>Quantity</th>
                  <th className={th}>Unit</th>
                  <th className={th}>Rate</th>
                  <th className={th}>Budget (in cr)</th>
                  <th className={th}>Remarks</th>
                  <th className={th}>% Progress</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {sectionsWithRows
                  .filter((section) => showHidden || !hiddenSectionKeys.has(section.title))
                  .map((section) => {
                  const isOpen = expandedSections.has(section.title);
                  const sectionHidden = hiddenSectionKeys.has(section.title);
                  return (
                    <Fragment key={section.title}>
                      <tr
                        className={`bg-blue-50 cursor-pointer select-none hover:bg-blue-100 ${
                          sectionHidden ? "opacity-40" : ""
                        }`}
                        onClick={() => toggleSection(section.title)}
                      >
                        <td colSpan={6} className={`${td} font-bold text-blue-900`}>
                          <span className="inline-block w-4">{isOpen ? "▾" : "▸"}</span>{" "}
                          <span className={sectionHidden ? "line-through" : ""}>{section.title}</span>
                        </td>
                        <td className={`${td} text-right font-bold text-blue-900`}>
                          {fmt(
                            section.grouped
                              ? section.total +
                                  section.subsections.reduce(
                                    (sum, sub) => sum + extraTotalFor(sub.items[0]?.head),
                                    0
                                  )
                              : section.total + extraTotalFor(section.items[0]?.head)
                          )}
                        </td>
                        <td className={td}></td>
                        <td className={`${td} text-right font-bold text-blue-900`}>
                          {fmtPct(getProgressPercent(section.title, section.title))}
                        </td>
                        <td className={td}>
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleHideSection(section.title);
                              }}
                              className={`text-xs font-semibold px-2 ${
                                sectionHidden ? "text-blue-600 hover:text-blue-800" : "text-red-500 hover:text-red-700"
                              }`}
                              title={sectionHidden ? "Restore this section" : "Remove this section"}
                            >
                              {sectionHidden ? "↺" : "✕"}
                            </button>
                          )}
                        </td>
                      </tr>

                      {isOpen && section.grouped && (
                        <>
                          {section.subsections
                            .filter((sub) => showHidden || !hiddenSubKeys.has(subKey(section.title, sub.title)))
                            .map((sub) => {
                            const subMapKey = subKey(section.title, sub.title);
                            const subOpen = expandedSubs.has(subMapKey);
                            const subHidden = hiddenSubKeys.has(subMapKey);
                            const visibleSubRows = sub.rows.filter(
                              (r) => showHidden || !hiddenItemKeys.has(itemKey(r.head, r.desc))
                            );
                            return (
                              <Fragment key={subMapKey}>
                                <tr
                                  className={`bg-indigo-50 cursor-pointer select-none hover:bg-indigo-100 ${
                                    subHidden ? "opacity-40" : ""
                                  }`}
                                  onClick={() => toggleSub(subMapKey)}
                                >
                                  <td colSpan={6} className={`${td} font-semibold text-indigo-900 pl-8`}>
                                    <span className="inline-block w-4">{subOpen ? "▾" : "▸"}</span>{" "}
                                    <span className={subHidden ? "line-through" : ""}>{sub.title}</span>
                                  </td>
                                  <td className={`${td} text-right font-semibold text-indigo-900`}>
                                    {fmt(sub.subtotal + extraTotalFor(sub.items[0]?.head))}
                                  </td>
                                  <td className={td}></td>
                                  <td className={`${td} text-right font-semibold text-indigo-900`}>
                                    {fmtPct(getProgressPercent(sub.title, sub.title))}
                                  </td>
                                  <td className={td}>
                                    {canEdit && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleHideSub(subMapKey);
                                        }}
                                        className={`text-xs font-semibold px-2 ${
                                          subHidden ? "text-blue-600 hover:text-blue-800" : "text-red-500 hover:text-red-700"
                                        }`}
                                        title={subHidden ? "Restore this subsection" : "Remove this subsection"}
                                      >
                                        {subHidden ? "↺" : "✕"}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                                {subOpen &&
                                  visibleSubRows.map((r) =>
                                    renderItemRow(
                                      r,
                                      () => toggleHideItem(itemKey(r.head, r.desc)),
                                      hiddenItemKeys.has(itemKey(r.head, r.desc))
                                    )
                                  )}
                                {subOpen &&
                                  extraSectionsByHead[sub.items[0]?.head]?.rows.map((r) =>
                                    renderItemRow(r, (row) =>
                                      removeCustomItem(extraSectionsByHead[sub.items[0].head].id, row.id)
                                    )
                                  )}
                                {subOpen && canEdit && sub.items[0] && (
                                  <tr>
                                    <td className={td} colSpan={9}>
                                      <button
                                        onClick={() => addExtraItem(sub.items[0].head)}
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 pl-6"
                                      >
                                        + Add Work Description
                                      </button>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                          <tr className="bg-amber-50 font-bold">
                            <td className={td} colSpan={6}>
                              Total — {section.title}
                            </td>
                            <td className={`${td} text-right`}>
                              {fmt(
                                section.total +
                                  section.subsections.reduce(
                                    (sum, sub) => sum + extraTotalFor(sub.items[0]?.head),
                                    0
                                  )
                              )}
                            </td>
                            <td className={td}></td>
                            <td className={td}></td>
                            <td className={td}></td>
                          </tr>
                        </>
                      )}

                      {isOpen && !section.grouped && (
                        <>
                          {section.rows
                            .filter((r) => showHidden || !hiddenItemKeys.has(itemKey(r.head, r.desc)))
                            .map((r) =>
                              renderItemRow(
                                r,
                                () => toggleHideItem(itemKey(r.head, r.desc)),
                                hiddenItemKeys.has(itemKey(r.head, r.desc))
                              )
                            )}
                          {extraSectionsByHead[section.items[0]?.head]?.rows.map((r) =>
                            renderItemRow(r, (row) =>
                              removeCustomItem(extraSectionsByHead[section.items[0].head].id, row.id)
                            )
                          )}
                          {canEdit && section.items[0] && (
                            <tr>
                              <td className={td} colSpan={9}>
                                <button
                                  onClick={() => addExtraItem(section.items[0].head)}
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                                >
                                  + Add Work Description
                                </button>
                              </td>
                            </tr>
                          )}
                          <tr className="bg-gray-50 font-semibold">
                            <td className={td} colSpan={6}>
                              Subtotal — {section.title}
                            </td>
                            <td className={`${td} text-right`}>
                              {fmt(section.total + extraTotalFor(section.items[0]?.head))}
                            </td>
                            <td className={td}></td>
                            <td className={td}></td>
                            <td className={td}></td>
                          </tr>
                        </>
                      )}
                    </Fragment>
                  );
                })}

                {brandNewCustomSections.map((section) => {
                  const sectionKey = `custom-${section.id}`;
                  const isOpen = expandedSections.has(sectionKey);
                  return (
                    <Fragment key={section.id}>
                      <tr
                        className="bg-blue-50 cursor-pointer select-none hover:bg-blue-100"
                        onClick={() => toggleSection(sectionKey)}
                      >
                        <td colSpan={6} className={`${td} font-bold text-blue-900`}>
                          <span className="inline-block w-4">{isOpen ? "▾" : "▸"}</span> {section.title}
                        </td>
                        <td className={`${td} text-right font-bold text-blue-900`}>{fmt(section.total)}</td>
                        <td className={td}></td>
                        <td className={td}></td>
                        <td className={td}>
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCustomSection(section.id);
                              }}
                              className="text-red-500 hover:text-red-700 text-xs font-semibold px-2"
                              title="Delete Work Head"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>

                      {isOpen && (
                        <>
                          {section.rows.map((r) =>
                            renderItemRow(r, (row) => removeCustomItem(section.id, row.id))
                          )}
                          {canEdit && (
                            <tr>
                              <td className={td} colSpan={9}>
                                <button
                                  onClick={() => addCustomItem(section.id)}
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                                >
                                  + Add Work Description
                                </button>
                              </td>
                            </tr>
                          )}
                          <tr className="bg-gray-50 font-semibold">
                            <td className={td} colSpan={6}>
                              Subtotal — {section.title}
                            </td>
                            <td className={`${td} text-right`}>{fmt(section.total)}</td>
                            <td className={td}></td>
                            <td className={td}></td>
                            <td className={td}></td>
                          </tr>
                        </>
                      )}
                    </Fragment>
                  );
                })}

                {canEdit && (
                  <tr>
                    <td className={td} colSpan={10}>
                      <button
                        onClick={addCustomSection}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                      >
                        + Add Work Head
                      </button>
                    </td>
                  </tr>
                )}

                <tr className="bg-blue-100 font-bold">
                  <td className={td} colSpan={6}>
                    Grand Total
                  </td>
                  <td className={`${td} text-right`}>{fmt(grandTotal)}</td>
                  <td className={td}></td>
                  <td className={td}></td>
                  <td className={td}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

            {/* ══════════════ COMPARISON REPORT TABLE ══════════════ */}
      {activeView === "comparison" && (
        <div className="space-y-4">
          {/* ── Mode switch ── */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setComparisonMode("excel")}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
                comparisonMode === "excel"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Upload Excel
            </button>
            <button
              onClick={() => setComparisonMode("manual")}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
                comparisonMode === "manual"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Upload Manually
            </button>
            <button
              onClick={() => setComparisonMode("auto")}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
                comparisonMode === "auto"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Redirect from Cost Working
            </button>
          </div>

          {/* ── Upload Excel (placeholder) ── */}
          {comparisonMode === "excel" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <input type="file" accept=".xlsx,.xls" disabled className="mb-3" />
              <p className="text-sm text-gray-400">Excel upload for the Comparison Report is coming soon.</p>
            </div>
          )}

          {/* ── Upload Manually (existing free-form table) ── */}
          {comparisonMode === "manual" && (
            <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th} rowSpan={2}>Item</th>
                    <th className={`${th} text-center`} colSpan={4}>Developer</th>
                    <th className={`${th} text-center`} colSpan={4}>CWI</th>
                    <th className={th} rowSpan={2}></th>
                  </tr>
                  <tr>
                    <th className={th}>Rate</th>
                    <th className={th}>Budget (in cr)</th>
                    <th className={th}>CI</th>
                    <th className={th}>CTC</th>
                    <th className={th}>Rate</th>
                    <th className={th}>Budget (in cr)</th>
                    <th className={th}>CI</th>
                    <th className={th}>CTC</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((r) => renderFreeComparisonRow(r))}
                  <tr className="bg-blue-100 font-bold">
                    <td className={td}>Grand Total</td>
                    <td className={td}></td>
                    <td className={`${td} text-right`}>{fmt(comparisonDevTotal)}</td>
                    <td className={td}></td>
                    <td className={td}></td>
                    <td className={td}></td>
                    <td className={`${td} text-right`}>{fmt(comparisonCwiTotal)}</td>
                    <td className={td}></td>
                    <td className={td}></td>
                    <td className={td}></td>
                  </tr>
                </tbody>
              </table>
              {canEdit && (
                <div className="p-3">
                  <button
                    onClick={addComparisonRow}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                  >
                    + Add Row
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Redirect from Cost Working (auto-populated Budget columns) ── */}
          {comparisonMode === "auto" && (
            <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400 px-3 pt-3">
                Budget columns are pulled automatically from CWI Cost Working. Rate / CI / CTC can still be entered manually.
              </p>
              <table className="min-w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th} rowSpan={2}>Item</th>
                    <th className={`${th} text-center`} colSpan={4}>Developer</th>
                    <th className={`${th} text-center`} colSpan={4}>CWI</th>
                    <th className={th} rowSpan={2}></th>
                  </tr>
                  <tr>
                    <th className={th}>Rate</th>
                    <th className={th}>Budget (in cr)</th>
                    <th className={th}>CI</th>
                    <th className={th}>CTC</th>
                    <th className={th}>Rate</th>
                    <th className={th}>Budget (in cr)</th>
                    <th className={th}>CI</th>
                    <th className={th}>CTC</th>
                  </tr>
                </thead>
                <tbody>
                  {autoItems.map((item) => renderAutoRow(item))}
                  <tr className="bg-blue-100 font-bold">
                    <td className={td}>Grand Total</td>
                    <td className={td}></td>
                    <td className={`${td} text-right`}>{fmt(autoDevTotal)}</td>
                    <td className={td}></td>
                    <td className={td}></td>
                    <td className={td}></td>
                    <td className={`${td} text-right`}>{fmt(autoCwiTotal)}</td>
                    <td className={td}></td>
                    <td className={td}></td>
                    <td className={td}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        {canEdit && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-6 py-2.5 rounded-xl transition text-sm"
          >
            {saving ? "Saving..." : "Save Cost Review"}
          </button>
        )}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 font-semibold px-6 py-2.5 rounded-xl transition text-sm"
        >
          {downloading ? "Preparing..." : "Download Report (Excel)"}
        </button>
      </div>
    </div>
  );
}
