import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const projectProgressService = {
  getTowerConfig: async (projectId) => {
    try {
      const res = await axios.get(`${API_URL}/api/projects/${projectId}/tower-config`);
      return res.data;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  },

  saveTowerConfig: async (projectId, payload) => {
    const res = await axios.post(`${API_URL}/api/projects/${projectId}/tower-config`, payload);
    return res.data;
  },

  unlockTowerConfig: async (projectId) => {
    const res = await axios.patch(`${API_URL}/api/projects/${projectId}/tower-config/unlock`);
    return res.data;
  },

  getNonTowerConfig: async (projectId) => {
    try {
      const res = await axios.get(`${API_URL}/api/projects/${projectId}/non-tower-config`);
      return res.data;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  },

  saveNonTowerConfig: async (projectId, payload) => {
    const res = await axios.post(`${API_URL}/api/projects/${projectId}/non-tower-config`, payload);
    return res.data;
  },

  unlockNonTowerConfig: async (projectId) => {
    const res = await axios.patch(`${API_URL}/api/projects/${projectId}/non-tower-config/unlock`);
    return res.data;
  },
  getWeightageConfig: async (projectId) => {
    try {
      const res = await axios.get(`${API_URL}/api/projects/${projectId}/weightage-config`);
      return res.data;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  },

  saveWeightageConfig: async (projectId, payload) => {
    const res = await axios.post(`${API_URL}/api/projects/${projectId}/weightage-config`, payload);
    return res.data;
  },

  unlockWeightageConfig: async (projectId) => {
    const res = await axios.patch(`${API_URL}/api/projects/${projectId}/weightage-config/unlock`);
    return res.data;
  },
  getActivityMatrix: async (projectId, towerName) => {
    try {
      const res = await axios.get(
        `${API_URL}/api/projects/${projectId}/activity-matrix/${encodeURIComponent(towerName)}`
      );
      return res.data;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  },

  saveActivityMatrix: async (projectId, towerName, payload) => {
    const res = await axios.post(
      `${API_URL}/api/projects/${projectId}/activity-matrix/${encodeURIComponent(towerName)}`,
      payload
    );
    return res.data;
  },

  saveActivityMatrixValues: async (projectId, towerName, payload) => {
    const res = await axios.patch(
      `${API_URL}/api/projects/${projectId}/activity-matrix/${encodeURIComponent(towerName)}/values`,
      payload
    );
    return res.data;
  },

  unlockActivityMatrix: async (projectId, towerName) => {
    const res = await axios.patch(
      `${API_URL}/api/projects/${projectId}/activity-matrix/${encodeURIComponent(towerName)}/unlock`
    );
    return res.data;
  },

  exportToStorage: async (projectId) => {
    const res = await axios.post(`${API_URL}/api/projects/${projectId}/export`);
    return res.data;
  },
};


export default projectProgressService;
