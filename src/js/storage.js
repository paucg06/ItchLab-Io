/**
 * Módulo de almacenamiento persistente para ItchLab.io (EternoDev)
 * Arquitectura de persistencia a largo plazo:
 * 1. Persistent Storage API (navigator.storage.persist) para evitar que el navegador limpie datos.
 * 2. IndexedDB como base de datos primaria ilimitada (capaz de almacenar gigabytes de imágenes y estados).
 * 3. Cache en memoria sincrónica para rendimiento instantáneo.
 * 4. Fallback y metadatos ligeros en localStorage.
 * CERO DEGRADADOS, CERO EMOJIS, Textos mínimos.
 */

const DB_NAME = 'ItchLabDB_v2';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const META_STORAGE_KEY = 'itchlab_projects_meta_v2';
const LEGACY_KEY_V2 = 'eternodev_coverdev_projects_v2';
const LEGACY_KEY_V1 = 'eternodev_coverdev_projects_v1';

let dbInstance = null;
let memoryProjects = [];
let isInitialized = false;

// Solicitar al navegador que el almacenamiento sea persistente (no se borra automáticamente)
async function requestPersistentStorage() {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log('ItchLab Storage Persistent:', isPersisted);
    } catch (e) {
      console.warn('No se pudo solicitar almacenamiento persistente:', e);
    }
  }
}

function openDatabase() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      console.warn('IndexedDB no está disponible en este entorno.');
      return resolve(null);
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.error('Error abriendo IndexedDB:', event.target.error);
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('Apertura de IndexedDB bloqueada por otra pestaña.');
        resolve(null);
      };
    } catch (err) {
      console.error('Excepción abriendo IndexedDB:', err);
      resolve(null);
    }
  });
}

function cleanForStorage(obj) {
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (key === 'img' || key === 'bgImage') return undefined;
    return value;
  }));
}

export class ProjectStorage {
  /**
   * Inicializa la base de datos y precarga todos los proyectos en memoria.
   * Debe ejecutarse al inicio de la aplicación antes de renderizar.
   */
  static async init() {
    if (isInitialized) return memoryProjects;

    await requestPersistentStorage();
    const db = await openDatabase();

    if (db) {
      try {
        const loaded = await new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll();

          req.onsuccess = () => {
            const list = req.result || [];
            resolve(Array.isArray(list) ? list : []);
          };

          req.onerror = () => resolve([]);
        });

        if (loaded.length > 0) {
          // Filtrar y ordenar por fecha de modificación más reciente
          memoryProjects = loaded
            .filter(p => p && p.id && Array.isArray(p.scenesList) && p.scenesList.length > 0)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

          isInitialized = true;
          this.updateMetaBackup();
          return memoryProjects;
        }
      } catch (err) {
        console.warn('Error leyendo proyectos de IndexedDB:', err);
      }
    }

    // Si IndexedDB estaba vacío, intentar migrar de localStorage (versiones anteriores)
    this.migrateFromLocalStorage();
    isInitialized = true;
    return memoryProjects;
  }

  static migrateFromLocalStorage() {
    try {
      const v2Data = localStorage.getItem(LEGACY_KEY_V2);
      if (v2Data) {
        const parsed = JSON.parse(v2Data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryProjects = parsed.filter(p => p && p.id && Array.isArray(p.scenesList) && p.scenesList.length > 0);
          this.persistAllToIndexedDB(memoryProjects);
          this.updateMetaBackup();
          return;
        }
      }

      const v1Data = localStorage.getItem(LEGACY_KEY_V1);
      if (v1Data) {
        const parsed = JSON.parse(v1Data);
        if (parsed.scenesList && parsed.scenesList.length > 0) {
          const migrated = [{
            id: 'proj_' + Date.now(),
            name: parsed.scenesList[0].title || 'Proyecto 1',
            updatedAt: Date.now(),
            scenesList: parsed.scenesList,
            activeSceneIndex: parsed.activeSceneIndex || 0,
            isSaved: true
          }];
          memoryProjects = migrated;
          this.persistAllToIndexedDB(migrated);
          this.updateMetaBackup();
          return;
        }
      }
    } catch (e) {
      console.warn('Error en migración desde localStorage:', e);
    }

    memoryProjects = [];
  }

  static getAllProjects() {
    return memoryProjects;
  }

  static getProject(id) {
    if (!id) return null;
    return memoryProjects.find(p => p && p.id === id) || null;
  }

  /**
   * Guarda o actualiza un proyecto en memoria y en IndexedDB de forma persistente.
   */
  static saveProject(project) {
    if (!project || !project.id) return;

    project.updatedAt = Date.now();
    project.isSaved = true;

    const idx = memoryProjects.findIndex(p => p && p.id === project.id);
    if (idx >= 0) {
      memoryProjects[idx] = project;
    } else {
      memoryProjects.unshift(project);
    }

    // Ordenar por fecha más reciente
    memoryProjects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // Guardar en IndexedDB
    this.persistProjectToIndexedDB(project);
    this.updateMetaBackup();
  }

  static async persistProjectToIndexedDB(project) {
    const db = await openDatabase();
    if (!db) return;

    try {
      const cleanProject = cleanForStorage(project);
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(cleanProject);
    } catch (err) {
      console.error('Error persistiendo proyecto en IndexedDB:', err);
    }
  }

  static async persistAllToIndexedDB(projectsList) {
    const db = await openDatabase();
    if (!db || !Array.isArray(projectsList)) return;

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const p of projectsList) {
        if (p && p.id) {
          store.put(cleanForStorage(p));
        }
      }
    } catch (err) {
      console.error('Error persistiendo lote en IndexedDB:', err);
    }
  }

  static async deleteProject(id) {
    if (!id) return memoryProjects;

    memoryProjects = memoryProjects.filter(p => p && p.id !== id);
    this.updateMetaBackup();

    const db = await openDatabase();
    if (db) {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
      } catch (err) {
        console.error('Error eliminando de IndexedDB:', err);
      }
    }

    return memoryProjects;
  }

  /**
   * Guarda una copia ligera de metadatos en localStorage (sin imágenes pesadas)
   * para evitar superar la cuota de 5 MB de localStorage.
   */
  static updateMetaBackup() {
    try {
      const meta = memoryProjects.map(p => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        activeSceneIndex: p.activeSceneIndex || 0,
        sceneCount: (p.scenesList || []).length
      }));
      localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
    } catch (e) {
      // Ignorar si localStorage está deshabilitado
    }
  }

  static async clear() {
    memoryProjects = [];
    try {
      localStorage.removeItem(META_STORAGE_KEY);
      localStorage.removeItem(LEGACY_KEY_V2);
      localStorage.removeItem(LEGACY_KEY_V1);
    } catch (e) {}

    const db = await openDatabase();
    if (db) {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
      } catch (e) {}
    }
  }
}
