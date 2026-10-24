/**
 * Módulo de almacenamiento local y gestión de múltiples proyectos (ItchLab.io)
 * Soporte dual: IndexedDB (almacenamiento ilimitado para imágenes) + localStorage fallback
 * CERO DEGRADADOS, CERO EMOJIS, Textos mínimos
 */

const STORAGE_KEY = 'eternodev_coverdev_projects_v2';
const LEGACY_STORAGE_KEY = 'eternodev_coverdev_projects_v1';
const DB_NAME = 'ItchLabDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

let dbInstance = null;
let memoryProjects = null;

function getDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

export class ProjectStorage {
  static getAllProjects() {
    if (Array.isArray(memoryProjects)) {
      return memoryProjects;
    }

    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          memoryProjects = parsed.filter(p => p && typeof p === 'object' && p.id && Array.isArray(p.scenesList) && p.scenesList.length > 0);
          this.syncFromIndexedDB();
          return memoryProjects;
        } else if (parsed && typeof parsed === 'object' && parsed.scenesList) {
          const single = [{
            id: parsed.id || ('proj_' + Date.now()),
            name: parsed.name || 'Mi Juego',
            updatedAt: Date.now(),
            scenesList: parsed.scenesList,
            activeSceneIndex: parsed.activeSceneIndex || 0
          }];
          memoryProjects = single;
          this.saveAllProjects(single);
          return memoryProjects;
        }
      }

      // Migración desde legacy si existiese
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (parsed.scenesList && parsed.scenesList.length > 0) {
          const migrated = [{
            id: 'proj_' + Date.now(),
            name: parsed.scenesList[0].title || 'Proyecto 1',
            updatedAt: Date.now(),
            scenesList: parsed.scenesList,
            activeSceneIndex: parsed.activeSceneIndex || 0
          }];
          memoryProjects = migrated;
          this.saveAllProjects(migrated);
          return migrated;
        }
      }
    } catch (err) {
      console.warn('Error al cargar proyectos de localStorage:', err);
    }

    memoryProjects = [];
    this.syncFromIndexedDB();
    return memoryProjects;
  }

  static async syncFromIndexedDB() {
    const db = await getDB();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        if (Array.isArray(list) && list.length > 0) {
          const valid = list.filter(p => p && typeof p === 'object' && p.id && Array.isArray(p.scenesList) && p.scenesList.length > 0);
          if (valid.length > 0) {
            memoryProjects = valid;
            this.saveToLocalStorage(valid);
          }
        }
      };
    } catch (err) {
      console.warn('Error al sincronizar desde IndexedDB:', err);
    }
  }

  static saveToLocalStorage(projects) {
    try {
      const cleanData = JSON.parse(JSON.stringify(projects, (key, val) => {
        if (key === 'img' || key === 'bgImage') return undefined;
        return val;
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanData));
    } catch (err) {
      console.warn('localStorage lleno o bloqueado (IndexedDB persiste todo):', err);
    }
  }

  static async saveAllProjects(projects) {
    memoryProjects = Array.isArray(projects) ? projects : [];
    this.saveToLocalStorage(memoryProjects);

    const db = await getDB();
    if (db) {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        for (const proj of memoryProjects) {
          if (!proj || !proj.id) continue;
          const cleanProj = JSON.parse(JSON.stringify(proj, (key, val) => {
            if (key === 'img' || key === 'bgImage') return undefined;
            return val;
          }));
          store.put(cleanProj);
        }
      } catch (err) {
        console.warn('Error al guardar en IndexedDB:', err);
      }
    }
  }

  static getProject(id) {
    const list = this.getAllProjects();
    return list.find(p => p && p.id === id) || null;
  }

  static saveProject(project) {
    if (!project || !project.id) return;
    let list = this.getAllProjects();
    if (!Array.isArray(list)) list = [];
    const idx = list.findIndex(p => p && p.id === project.id);
    project.updatedAt = Date.now();
    if (idx >= 0) {
      list[idx] = project;
    } else {
      list.unshift(project);
    }
    this.saveAllProjects(list);
  }

  static async deleteProject(id) {
    let list = this.getAllProjects();
    if (!Array.isArray(list)) list = [];
    list = list.filter(p => p && p.id !== id);
    memoryProjects = list;
    this.saveToLocalStorage(list);

    const db = await getDB();
    if (db) {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
      } catch (e) {
        console.warn('Error al borrar de IndexedDB:', e);
      }
    }
    return list;
  }

  static clear() {
    memoryProjects = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (err) {
      console.warn(err);
    }
  }
}
