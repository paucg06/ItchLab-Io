import { ITCH_TYPES, GOOGLE_FONTS, createScene } from './presets.js?v=3.7';
import { ProjectStorage } from './storage.js?v=3.7';
import { CanvasEngine } from './canvas.js?v=3.7';
import { downloadCanvas, copyCanvasToClipboard, exportItchProject, downloadAllScenesZip, downloadOfficialTemplatesZip } from './exporter.js?v=3.7';
import { setupMockup } from './mockup.js?v=3.7';

// 0. GESTOR GLOBAL DE FUENTES (Ámbito de módulo para evitar TDZ en cualquier momento)
const loadedGoogleFonts = new Set();
function loadGoogleFont(fontFamily) {
  if (!fontFamily || loadedGoogleFonts.has(fontFamily)) return Promise.resolve();
  loadedGoogleFonts.add(fontFamily);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap`;
  document.head.appendChild(link);
  if (document.fonts && document.fonts.load) {
    return document.fonts.load(`16px "${fontFamily}"`).catch(() => {});
  }
  return Promise.resolve();
}

async function initApp() {
  const canvas = document.getElementById('mainCanvas');
  const canvasDimLabel = document.getElementById('canvasDimensions');
  const layerListContainer = document.getElementById('layerList');
  const tabsContainer = document.getElementById('projectTabsContainer');
  const btnAddTab = document.getElementById('btnAddTab');

  // Vistas Home vs Editor
  const homeView = document.getElementById('homeView');
  const editorView = document.getElementById('editorView');
  const btnGoHome = document.getElementById('btnGoHome');
  const editorProjectTitleInput = document.getElementById('editorProjectTitleInput');
  const homeCreateBox = document.getElementById('homeCreateBox');
  const homeDownloadTemplatesBtn = document.getElementById('homeDownloadTemplatesBtn');
  const homeImportItchFile = document.getElementById('homeImportItchFile');
  const savedProjectsGrid = document.getElementById('savedProjectsGrid');

  // Notificación Toast accesible en toda la función
  const toast = document.getElementById('toastNotification');
  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 1800);
  }

  // Floating toolbar
  const canvasToolbar = document.getElementById('canvasToolbar');
  const toolLayerUp = document.getElementById('toolLayerUp');
  const toolLayerDown = document.getElementById('toolLayerDown');
  const toolLayerDel = document.getElementById('toolLayerDel');

  // 1. CARGA O INICIALIZACIÓN DE PROYECTOS LOCALES (IndexedDB Persistente)
  let engine = null;
  let allProjects = [];
  try {
    allProjects = await ProjectStorage.init();
  } catch (e) {
    console.error('Error inicializando ProjectStorage:', e);
  }

  let currentProject = null;
  let scenesList = [];
  let activeSceneIndex = 0;

  function restoreProjectImages(proj) {
    if (!proj || !proj.scenesList) return;
    try {
      proj.scenesList.forEach(scene => {
        if (scene.bgImageSrc && !scene.bgImage) {
          const bgImg = new Image();
          bgImg.onload = () => {
            if (engine && getActiveScene() === scene) engine.render();
          };
          bgImg.src = scene.bgImageSrc;
          scene.bgImage = bgImg;
        }
        if (scene.layers) {
          scene.layers.forEach(layer => {
            if (layer.type === 'image' && layer.src && !layer.img) {
              const lImg = new Image();
              lImg.onload = () => {
                if (engine && getActiveScene() === scene) engine.render();
              };
              lImg.src = layer.src;
              layer.img = lImg;
            }
            if (layer.type === 'text' && layer.fontFamily) {
              loadGoogleFont(layer.fontFamily).then(() => {
                if (engine && getActiveScene() === scene) engine.render();
              }).catch(() => {});
            }
          });
        }
      });
    } catch (err) {
      console.warn('Error restaurando recursos de proyecto:', err);
    }
  }

  if (allProjects && allProjects.length > 0) {
    currentProject = allProjects[0];
    currentProject.isSaved = true;
    scenesList = currentProject.scenesList;
    activeSceneIndex = currentProject.activeSceneIndex || 0;
    restoreProjectImages(currentProject);
  } else {
    currentProject = {
      id: 'proj_' + Date.now(),
      name: 'Nuevo Proyecto',
      updatedAt: Date.now(),
      scenesList: [createScene('cover', 'Cover')],
      activeSceneIndex: 0,
      isSaved: false
    };
    scenesList = currentProject.scenesList;
  }

  if (editorProjectTitleInput && currentProject) {
    editorProjectTitleInput.value = currentProject.name || 'Mi Juego';
  }

  function getActiveScene() {
    if (!scenesList || scenesList.length === 0) return null;
    return scenesList[activeSceneIndex] || scenesList[0];
  }

  function saveCurrentProject() {
    if (!currentProject || !scenesList || scenesList.length === 0) return;
    currentProject.scenesList = scenesList;
    currentProject.activeSceneIndex = activeSceneIndex;
    currentProject.updatedAt = Date.now();
    currentProject.isSaved = true;

    // Generar miniatura de la portada o del primer lienzo para la tarjeta itch.io
    try {
      const coverScene = scenesList.find(s => s.typeKey === 'cover' || s.category === 'cover') || scenesList[0];
      if (coverScene) {
        const off = document.createElement('canvas');
        off.width = 315;
        off.height = 250;
        const offEngine = new CanvasEngine(off);
        const temp = JSON.parse(JSON.stringify(coverScene));
        temp.selectedLayerId = null;
        temp.bgImage = coverScene.bgImage;
        temp.layers.forEach((l, idx) => {
          l.img = coverScene.layers[idx]?.img || null;
        });
        offEngine.setState(temp);
        currentProject.thumbnail = off.toDataURL('image/jpeg', 0.85);
      }
    } catch (e) {
      console.warn('Error al generar miniatura:', e);
    }

    ProjectStorage.saveProject(currentProject);
  }

  window.addEventListener('beforeunload', () => {
    saveCurrentProject();
  });
  window.addEventListener('pagehide', () => {
    saveCurrentProject();
  });

  // 2. SISTEMA DE HISTORIAL ROBUSTO (UNDO / REDO)
  let history = [];
  let historyIndex = -1;
  let isRestoringHistory = false;

  function createSnapshot(scene) {
    if (!scene) return null;
    const json = JSON.stringify(scene, (key, value) => {
      if (key === 'img' || key === 'bgImage') return undefined;
      return value;
    });
    return {
      sceneIndex: activeSceneIndex,
      json: json,
      bgImage: scene.bgImage || null,
      layerImages: scene.layers ? scene.layers.map(l => l.img || null) : []
    };
  }

  function pushHistory() {
    if (isRestoringHistory) return;
    const current = getActiveScene();
    if (!current) return;

    const snap = createSnapshot(current);

    // Truncar historial posterior si estábamos tras un undo
    if (historyIndex >= 0 && historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }

    // Evitar registrar snapshots idénticos consecutivos
    if (history.length > 0 && historyIndex >= 0) {
      const last = history[historyIndex];
      if (last && last.sceneIndex === activeSceneIndex && last.json === snap.json) {
        return;
      }
    }

    history.push(snap);
    if (history.length > 30) {
      history.shift();
    } else {
      historyIndex++;
    }

    if (currentProject && currentProject.isSaved) {
      saveCurrentProject();
    }
  }

  function undo() {
    if (historyIndex <= 0) {
      showToast('Sin acciones anteriores');
      return;
    }

    historyIndex--;
    const prev = history[historyIndex];
    if (!prev) return;

    restoreSnapshot(prev);
    showToast('Deshecho (Ctrl+Z)');
  }

  function redo() {
    if (historyIndex >= history.length - 1) {
      showToast('Nada más que rehacer');
      return;
    }

    historyIndex++;
    const next = history[historyIndex];
    if (!next) return;

    restoreSnapshot(next);
    showToast('Rehecho (Ctrl+Y)');
  }

  function restoreSnapshot(snap) {
    if (!snap) return;
    isRestoringHistory = true;
    try {
      activeSceneIndex = snap.sceneIndex;
      const restored = JSON.parse(snap.json);
      restored.bgImage = snap.bgImage;
      if (restored.layers && snap.layerImages) {
        restored.layers.forEach((l, idx) => {
          l.img = snap.layerImages[idx] || null;
        });
      }

      scenesList[activeSceneIndex] = restored;
      engine.setState(restored);
      renderProjectTabs();
      syncAllControls();
      updateLayerListUI();
      updatePropertiesUI();
      saveCurrentProject();
    } finally {
      isRestoringHistory = false;
    }
  }

  function onEngineChange(newState) {
    scenesList[activeSceneIndex] = newState;
    updateLayerListUI();
    updatePropertiesUI();
    saveCurrentProject();
  }

  function onEngineActionCommit(actionType) {
    pushHistory();
  }

  engine = new CanvasEngine(canvas, onEngineChange, onEngineActionCommit);
  engine.setState(getActiveScene());
  pushHistory();

  // 3. NAVEGACIÓN HOME vs EDITOR
  function openEditor() {
    if (homeView) homeView.style.display = 'none';
    if (editorView) editorView.style.display = 'flex';
    engine.render();
  }

  function openHome() {
    if (editorView) editorView.style.display = 'none';
    if (homeView) homeView.style.display = 'flex';
    renderSavedProjects();
  }

  function loadProject(proj) {
    if (!proj) return;
    try {
      currentProject = proj;
      currentProject.isSaved = true;
      scenesList = Array.isArray(proj.scenesList) && proj.scenesList.length > 0
        ? proj.scenesList
        : [createScene('cover', 'Cover', null, 'recommended')];
      activeSceneIndex = (proj.activeSceneIndex >= 0 && proj.activeSceneIndex < scenesList.length)
        ? proj.activeSceneIndex
        : 0;
      restoreProjectImages(currentProject);
      if (editorProjectTitleInput) {
        editorProjectTitleInput.value = currentProject.name || 'Mi Juego';
      }
      history = [];
      historyIndex = -1;
      const activeScene = getActiveScene();
      if (activeScene && engine) {
        engine.setState(activeScene);
      }
      renderProjectTabs();
      syncAllControls();
      openEditor();
      pushHistory();
    } catch (err) {
      console.error('Error al cargar proyecto:', err);
    }
  }

  if (editorProjectTitleInput) {
    editorProjectTitleInput.addEventListener('input', () => {
      if (currentProject) {
        currentProject.name = editorProjectTitleInput.value.trim() || 'Proyecto';
        saveCurrentProject();
      }
    });

    editorProjectTitleInput.addEventListener('blur', () => {
      if (!editorProjectTitleInput.value.trim()) {
        editorProjectTitleInput.value = 'Mi Juego';
        if (currentProject) {
          currentProject.name = 'Mi Juego';
          saveCurrentProject();
        }
      }
    });
  }

  btnGoHome?.addEventListener('click', openHome);
  document.getElementById('btnLogoHome')?.addEventListener('click', openHome);

  // Crear proyecto desde Home (+ Nuevo Proyecto)
  function createNewProjectAction() {
    try {
      const list = ProjectStorage.getAllProjects();
      const count = (Array.isArray(list) ? list.length : 0) + 1;
      const newProj = {
        id: 'proj_' + Date.now(),
        name: `Nuevo Proyecto ${count > 1 ? count : ''}`.trim(),
        updatedAt: Date.now(),
        scenesList: [createScene('cover', 'Cover', null, 'recommended')],
        activeSceneIndex: 0,
        isSaved: true
      };
      ProjectStorage.saveProject(newProj);
      loadProject(newProj);
      showToast('Nuevo Proyecto');
    } catch (err) {
      console.error('Error al crear nuevo proyecto:', err);
    }
  }

  homeCreateBox?.addEventListener('click', createNewProjectAction);
  window.createNewProject = createNewProjectAction;
  window.openEditor = openEditor;
  window.openHome = openHome;

  // Descargar Plantillas Oficiales ZIP desde Home
  homeDownloadTemplatesBtn?.addEventListener('click', async () => {
    try {
      showToast('Generando plantillas en 4 carpetas...');
      await downloadOfficialTemplatesZip(createScene);
      showToast('Plantillas descargadas');
    } catch (err) {
      console.error('Error al descargar plantillas:', err);
      alert('Error al generar el archivo .zip de medidas.');
    }
  });

  // Importar archivo .itch desde Home
  homeImportItchFile?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.target.result);
      } catch (err) {
        alert('Archivo .itch no válido (formato JSON no legible).');
        return;
      }

      let scenes = null;
      if (Array.isArray(parsed)) {
        scenes = parsed;
      } else if (Array.isArray(parsed.scenesList)) {
        scenes = parsed.scenesList;
      } else if (Array.isArray(parsed.scenes)) {
        scenes = parsed.scenes;
      } else if (parsed.layers) {
        scenes = [parsed];
      }

      if (!scenes || scenes.length === 0) {
        alert('El archivo .itch no contiene lienzos reconocibles.');
        return;
      }

      const fileNameClean = file.name.replace(/\.itch$|\.json$/i, '');
      const newProj = {
        id: 'proj_' + Date.now(),
        name: parsed.name || fileNameClean || 'Proyecto Importado',
        updatedAt: Date.now(),
        scenesList: scenes,
        activeSceneIndex: (parsed.activeSceneIndex >= 0 && parsed.activeSceneIndex < scenes.length) ? parsed.activeSceneIndex : 0,
        isSaved: true
      };

      try {
        ProjectStorage.saveProject(newProj);
        loadProject(newProj);
        showToast('Proyecto cargado');
      } catch (err) {
        console.error('Error al cargar proyecto importado:', err);
      }
    };
    reader.readAsText(file);
    homeImportItchFile.value = '';
  });

  // Renderizar proyectos guardados en Home (Estilo itch.io Game Card)
  function renderSavedProjects() {
    if (!savedProjectsGrid) return;
    savedProjectsGrid.innerHTML = '';

    const list = ProjectStorage.getAllProjects();
    if (list.length === 0) {
      savedProjectsGrid.innerHTML = '<div id="emptyProjectsBtn" style="color: var(--itch-muted); font-size: 13px; grid-column: 1 / -1; padding: 24px 0; text-align: center; cursor: pointer; user-select: none;">No hay proyectos guardados. Haz clic en <strong>+ Nuevo Proyecto</strong> para empezar.</div>';
      document.getElementById('emptyProjectsBtn')?.addEventListener('click', createNewProjectAction);
      return;
    }

    list.forEach(proj => {
      const card = document.createElement('div');
      card.className = 'project-card';
      const sceneNames = (proj.scenesList || []).map(s => s.typeKey.toUpperCase()).join(' · ');
      const thumbSrc = proj.thumbnail || '';

      card.innerHTML = `
        ${thumbSrc 
          ? `<img class="project-card-thumb" src="${thumbSrc}" alt="${proj.name || 'Juego'}">`
          : `<div class="project-card-thumb" style="display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: var(--itch-red);">${proj.name || 'Juego'}</div>`
        }
        <div class="project-card-body">
          <div class="project-card-title">${proj.name || 'Sin título'}</div>
          <div class="project-card-desc">Lienzos: ${sceneNames || 'Cover'}</div>
          <div class="project-card-meta">
            <span class="project-card-tag">Indie</span>
          </div>
          <div class="project-card-actions">
            <button class="btn btn-primary btn-sm btn-open-proj" style="flex: 1;">Abrir</button>
            <button class="btn btn-secondary btn-sm btn-export-proj" title="Exportar .itch">.itch</button>
            <button class="btn btn-secondary btn-sm btn-delete-proj" title="Eliminar" style="color: var(--itch-red); padding: 4px 8px;">×</button>
          </div>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        loadProject(proj);
      });

      card.querySelector('.btn-open-proj').addEventListener('click', (e) => {
        e.stopPropagation();
        loadProject(proj);
      });

      card.querySelector('.btn-export-proj').addEventListener('click', (e) => {
        e.stopPropagation();
        exportItchProject({ scenesList: proj.scenesList, activeSceneIndex: proj.activeSceneIndex || 0 }, `${(proj.name || 'juego').toLowerCase().replace(/\s+/g, '-')}.itch`);
        showToast('Exportado .itch');
      });

      card.querySelector('.btn-delete-proj').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`¿Eliminar "${proj.name}"?`)) {
          ProjectStorage.deleteProject(proj.id);
          const remaining = ProjectStorage.getAllProjects();
          if (remaining.length > 0) {
            currentProject = remaining[0];
            currentProject.isSaved = true;
            scenesList = currentProject.scenesList;
            activeSceneIndex = currentProject.activeSceneIndex || 0;
            engine.setState(getActiveScene());
          } else {
            currentProject = {
              id: 'proj_' + Date.now(),
              name: 'Nuevo Proyecto',
              updatedAt: Date.now(),
              scenesList: [createScene('cover', 'Cover')],
              activeSceneIndex: 0,
              isSaved: false
            };
            scenesList = currentProject.scenesList;
            activeSceneIndex = 0;
            engine.setState(getActiveScene());
          }
          renderSavedProjects();
          showToast('Eliminado');
        }
      });

      savedProjectsGrid.appendChild(card);
    });
  }

  renderSavedProjects();

  // 4. RENDERIZADO DE PESTAÑAS DEL EDITOR
  function renderProjectTabs() {
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    scenesList.forEach((scene, idx) => {
      const tab = document.createElement('div');
      tab.className = `scene-tab ${idx === activeSceneIndex ? 'active' : ''}`;
      tab.innerHTML = `
        <span title="Doble clic para renombrar">${scene.title}</span>
        ${scenesList.length > 1 ? `<button class="scene-tab-close" title="Cerrar pestaña">×</button>` : ''}
      `;

      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('scene-tab-close') || e.target.tagName === 'INPUT') return;
        activeSceneIndex = idx;
        scene.selectedLayerId = null;
        engine.setState(scene);
        renderProjectTabs();
        syncAllControls();
      });

      const span = tab.querySelector('span');
      if (span) {
        span.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'tab-rename-input';
          input.value = scene.title || 'Lienzo';
          span.replaceWith(input);
          input.focus();
          input.select();

          const save = () => {
            const val = input.value.trim();
            if (val) {
              scene.title = val;
              saveCurrentProject();
            }
            renderProjectTabs();
          };

          input.addEventListener('blur', save);
          input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
              input.removeEventListener('blur', save);
              save();
            } else if (ev.key === 'Escape') {
              renderProjectTabs();
            }
          });
        });
      }

      const closeBtn = tab.querySelector('.scene-tab-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (scenesList.length <= 1) return;
          scenesList.splice(idx, 1);
          if (activeSceneIndex >= scenesList.length) activeSceneIndex = scenesList.length - 1;
          engine.setState(getActiveScene());
          renderProjectTabs();
          syncAllControls();
        });
      }

      tabsContainer.appendChild(tab);
    });
  }

  renderProjectTabs();

  // 5. MODAL: NUEVO LIENZO (+ / New)
  const newCanvasModal = document.getElementById('newCanvasModal');
  const closeNewCanvasBtn = document.getElementById('closeNewCanvasBtn');
  const createBlankBtn = document.getElementById('createBlankBtn');
  const createCopyBtn = document.getElementById('createCopyBtn');
  const newCanvasDescText = document.getElementById('newCanvasDescText');
  const newCanvasDescNote = document.getElementById('newCanvasDescNote');
  const resTierBtns = document.querySelectorAll('.res-tier-btn');
  let selectedNewType = 'cover';
  let selectedResTier = 'recommended';

  function updateNewCanvasModalUI() {
    const meta = ITCH_TYPES[selectedNewType] || ITCH_TYPES.cover;
    const resMeta = meta.resolutions[selectedResTier] || meta.resolutions.recommended;

    if (newCanvasDescText) {
      newCanvasDescText.textContent = `${resMeta.width} × ${resMeta.height} px. ${meta.desc}`;
    }
    if (newCanvasDescNote) {
      newCanvasDescNote.textContent = meta.note || '';
      newCanvasDescNote.style.display = meta.note ? 'block' : 'none';
    }

    resTierBtns.forEach(btn => {
      const tier = btn.getAttribute('data-tier');
      btn.classList.toggle('selected', tier === selectedResTier);
      if (meta.resolutions[tier]) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      } else {
        btn.style.opacity = '0.35';
        btn.style.pointerEvents = 'none';
      }
    });

    const activeCard = document.querySelector(`[data-new-type="${selectedNewType}"]`);
    if (activeCard) {
      const sub = activeCard.querySelector('.new-canvas-option-sub');
      if (sub) sub.textContent = `${resMeta.width} × ${resMeta.height} px`;
    }
  }

  btnAddTab?.addEventListener('click', () => {
    updateNewCanvasModalUI();
    if (newCanvasModal) newCanvasModal.classList.add('active');
  });

  closeNewCanvasBtn?.addEventListener('click', () => {
    if (newCanvasModal) newCanvasModal.classList.remove('active');
  });

  const newTypeCards = document.querySelectorAll('[data-new-type]');
  newTypeCards.forEach(c => {
    c.addEventListener('click', () => {
      newTypeCards.forEach(tc => tc.classList.remove('selected'));
      c.classList.add('selected');
      selectedNewType = c.getAttribute('data-new-type');
      const meta = ITCH_TYPES[selectedNewType] || ITCH_TYPES.cover;
      if (!meta.resolutions[selectedResTier]) {
        selectedResTier = 'recommended';
      }
      updateNewCanvasModalUI();
    });
  });

  resTierBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedResTier = btn.getAttribute('data-tier') || 'recommended';
      updateNewCanvasModalUI();
    });
  });

  createBlankBtn?.addEventListener('click', () => {
    const meta = ITCH_TYPES[selectedNewType] || ITCH_TYPES.cover;
    const newScene = createScene(selectedNewType, meta.name, null, selectedResTier);
    scenesList.push(newScene);
    activeSceneIndex = scenesList.length - 1;
    engine.setState(newScene);
    renderProjectTabs();
    syncAllControls();
    newCanvasModal?.classList.remove('active');
    pushHistory();
    showToast(`Nuevo ${meta.name} añadido`);
  });

  createCopyBtn?.addEventListener('click', () => {
    const current = getActiveScene();
    const meta = ITCH_TYPES[selectedNewType] || ITCH_TYPES.cover;
    const newScene = createScene(selectedNewType, meta.name, current, selectedResTier);
    scenesList.push(newScene);
    activeSceneIndex = scenesList.length - 1;
    engine.setState(newScene);
    renderProjectTabs();
    syncAllControls();
    newCanvasModal?.classList.remove('active');
    pushHistory();
    showToast(`Diseño aplicado a ${meta.name}`);
  });

  // 6. CUSTOM FONT PICKER (Muestra cada fuente con su propia tipografía)
  const fontPickerTrigger = document.getElementById('fontPickerTrigger');
  const fontPickerLabel = document.getElementById('fontPickerLabel');
  const fontPickerDropdown = document.getElementById('fontPickerDropdown');
  const fontPickerList = document.getElementById('fontPickerList');
  const fontSearchInput = document.getElementById('fontSearchInput');

  function buildFontPicker() {
    if (!fontPickerList) return;
    fontPickerList.innerHTML = '';

    const categories = {};
    GOOGLE_FONTS.forEach(f => {
      if (!categories[f.category]) categories[f.category] = [];
      categories[f.category].push(f);
    });

    for (const [catName, fonts] of Object.entries(categories)) {
      const catTitle = document.createElement('div');
      catTitle.className = 'font-picker-category';
      catTitle.textContent = catName;
      fontPickerList.appendChild(catTitle);

      fonts.forEach(f => {
        const item = document.createElement('div');
        item.className = 'font-picker-item';
        item.setAttribute('data-font', f.name);
        item.style.fontFamily = `"${f.name}", sans-serif`;
        item.textContent = f.name;

        item.addEventListener('click', () => {
          const cur = getActiveScene();
          const selected = cur.layers.find(l => l.id === cur.selectedLayerId);
          if (selected && selected.type === 'text') {
            pushHistory();
            selected.fontFamily = f.name;
            fontPickerLabel.textContent = f.name;
            fontPickerLabel.style.fontFamily = `"${f.name}", sans-serif`;
            fontPickerDropdown?.classList.remove('open');
            engine.render();
          }
        });

        fontPickerList.appendChild(item);
      });
    }
  }

  buildFontPicker();

  fontPickerTrigger?.addEventListener('click', () => {
    fontPickerDropdown?.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!fontPickerTrigger?.contains(e.target) && !fontPickerDropdown?.contains(e.target)) {
      fontPickerDropdown?.classList.remove('open');
    }
  });

  fontSearchInput?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const items = fontPickerList?.querySelectorAll('.font-picker-item');
    items?.forEach(it => {
      const name = it.getAttribute('data-font').toLowerCase();
      it.style.display = name.includes(q) ? 'block' : 'none';
    });
  });

  // 7. PESTAÑAS LATERALES (Capas, Editar, Fondo)
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  function switchTab(targetId) {
    tabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === targetId));
    tabContents.forEach(c => c.classList.toggle('active', c.id === targetId));
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      switchTab(targetId);
    });
  });

  // 8. SUBIDA DE IMAGEN (Tamaño natural sin deformar)
  const imageUpload = document.getElementById('imageUpload');
  imageUpload?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const cur = getActiveScene();
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          const maxW = cur.width * 0.85;
          const maxH = cur.height * 0.85;

          if (w > maxW || h > maxH) {
            const ratio = Math.min(maxW / w, maxH / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }

          engine.addLayer({
            type: 'image',
            img: img,
            src: event.target.result,
            name: file.name.replace(/\.[^/.]+$/, ""),
            x: Math.round((cur.width - w) / 2),
            y: Math.round((cur.height - h) / 2),
            width: w,
            height: h,
            opacity: 1.0,
            rotation: 0
          });
          pushHistory();
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
      imageUpload.value = '';
    }
  });

  // 9. FORMAS GEOMÉTRICAS (Desplegable de Figuras Básicas)
  const btnOpenShapesDropdown = document.getElementById('btnOpenShapesDropdown');
  const shapesDropdown = document.getElementById('shapesDropdown');

  btnOpenShapesDropdown?.addEventListener('click', (e) => {
    e.stopPropagation();
    shapesDropdown?.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (shapesDropdown && !shapesDropdown.contains(e.target) && e.target !== btnOpenShapesDropdown && !btnOpenShapesDropdown?.contains(e.target)) {
      shapesDropdown.classList.remove('open');
    }
  });

  const shapeNames = {
    rect: 'Cuadrado',
    circle: 'Círculo',
    triangle: 'Triángulo',
    diamond: 'Rombo',
    star: 'Estrella',
    hexagon: 'Hexágono',
    heart: 'Corazón',
    arrow: 'Flecha'
  };

  document.querySelectorAll('.shape-opt-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = getActiveScene();
      const shapeType = btn.dataset.shape || 'rect';
      engine.addLayer({
        type: 'shape',
        shapeType: shapeType,
        name: shapeNames[shapeType] || 'Figura',
        x: Math.round(cur.width / 2 - 60),
        y: Math.round(cur.height / 2 - 60),
        width: 120,
        height: 120,
        color: '#fa5c5c',
        strokeColor: '#222222',
        strokeWidth: 0,
        opacity: 1.0,
        rotation: 0
      });
      pushHistory();
      shapesDropdown?.classList.remove('open');
    });
  });

  // Añadir Texto
  document.getElementById('addTextBtn')?.addEventListener('click', () => {
    const cur = getActiveScene();
    engine.addLayer({
      type: 'text',
      text: 'NUEVO TEXTO',
      x: cur.width / 2,
      y: cur.height / 2,
      fontSize: 48,
      fontFamily: 'Lilita One',
      color: '#222222',
      strokeColor: '#000000',
      strokeWidth: 0,
      shadowColor: '#ffffff',
      shadowDepth: 0,
      shadowBlur: 0,
      letterSpacing: 0,
      textAlign: 'center',
      textTransform: 'none',
      rotation: 0
    });
    pushHistory();
  });

  // 10. LISTA DE CAPAS
  function updateLayerListUI() {
    if (!layerListContainer) return;
    layerListContainer.innerHTML = '';

    const cur = getActiveScene();
    const reversed = [...cur.layers].reverse();

    if (reversed.length === 0) {
      layerListContainer.innerHTML = '<div style="font-size: 11px; color: var(--itch-muted); text-align: center; padding: 12px;">Sin capas</div>';
      return;
    }

    reversed.forEach(layer => {
      const item = document.createElement('div');
      item.className = `layer-item ${cur.selectedLayerId === layer.id ? 'selected' : ''}`;

      let label = layer.name || layer.type.toUpperCase();
      if (layer.type === 'text') label = layer.name || layer.text || 'Texto';

      item.innerHTML = `
        <span class="layer-info" title="Doble clic para renombrar">${label}</span>
        <div class="layer-actions">
          <button class="btn btn-secondary btn-sm" title="Subir capa" data-action="up" style="padding: 4px 6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
          <button class="btn btn-secondary btn-sm" title="Bajar capa" data-action="down" style="padding: 4px 6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <button class="btn btn-primary btn-sm" title="Borrar capa" data-action="del" style="padding: 4px 6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.tagName === 'INPUT') return;
        cur.selectedLayerId = layer.id;
        engine.selectedLayerIds = new Set([layer.id]);
        engine.render();
        layerListContainer.querySelectorAll('.layer-item').forEach(it => it.classList.remove('selected'));
        item.classList.add('selected');
        if (layer.id === '__edge_fade__') {
          document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          document.querySelector('[data-tab="tabBackground"]')?.classList.add('active');
          document.getElementById('tabBackground')?.classList.add('active');
        } else {
          updatePropertiesUI();
        }
      });

      item.addEventListener('dblclick', (e) => {
        if (e.target.closest('button')) return;
        e.stopPropagation();
        const currentInfo = item.querySelector('.layer-info');
        if (!currentInfo) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'layer-rename-input';
        input.value = layer.name || label;
        currentInfo.replaceWith(input);
        input.focus();
        input.select();

        let finished = false;
        const save = () => {
          if (finished) return;
          finished = true;
          const val = input.value.trim();
          if (val) {
            layer.name = val;
            pushHistory();
          }
          updateLayerListUI();
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            save();
          } else if (ev.key === 'Escape') {
            finished = true;
            updateLayerListUI();
          }
        });
      });

      item.querySelector('[data-action="up"]').addEventListener('click', (e) => {
        e.stopPropagation();
        pushHistory();
        engine.moveLayerUp(layer.id);
      });

      item.querySelector('[data-action="down"]').addEventListener('click', (e) => {
        e.stopPropagation();
        pushHistory();
        engine.moveLayerDown(layer.id);
      });

      item.querySelector('[data-action="del"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (layer.id === '__edge_fade__') {
          cur.edgeFade = false;
          if (edgeFadeToggle) edgeFadeToggle.checked = false;
          if (edgeFadeOptions) edgeFadeOptions.style.display = 'none';
        }
        pushHistory();
        engine.removeLayer(layer.id);
        updateLayerListUI();
      });

      layerListContainer.appendChild(item);
    });

    if (cur.selectedLayerId && canvasToolbar) {
      canvasToolbar.classList.add('visible');
    } else if (canvasToolbar) {
      canvasToolbar.classList.remove('visible');
    }
  }

  // Barra Flotante de Alineación
  document.getElementById('toolAlignCenterX')?.addEventListener('click', () => {
    const cur = getActiveScene();
    if (cur.selectedLayerId) {
      engine.alignLayer(cur.selectedLayerId, 'centerX');
      pushHistory();
      showToast('Centrado horizontal');
    }
  });

  document.getElementById('toolAlignCenterY')?.addEventListener('click', () => {
    const cur = getActiveScene();
    if (cur.selectedLayerId) {
      engine.alignLayer(cur.selectedLayerId, 'centerY');
      pushHistory();
      showToast('Centrado vertical');
    }
  });

  // 10. MENÚ CONTEXTUAL (Clic Derecho en Capas)
  const canvasContextMenu = document.getElementById('canvasContextMenu');

  function hideContextMenu() {
    if (canvasContextMenu) canvasContextMenu.style.display = 'none';
  }

  document.addEventListener('click', (e) => {
    if (canvasContextMenu && !canvasContextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  window.addEventListener('resize', hideContextMenu);
  window.addEventListener('scroll', hideContextMenu, true);

  const ctxMenuGroupBtn = document.getElementById('ctxMenuGroupBtn');
  const ctxMenuUngroupBtn = document.getElementById('ctxMenuUngroupBtn');

  engine.onContextMenu = (e, layer) => {
    if (!canvasContextMenu || !layer) return;
    if (ctxMenuGroupBtn) {
      ctxMenuGroupBtn.style.display = (engine.selectedLayerIds && engine.selectedLayerIds.size >= 2) ? 'flex' : 'none';
    }
    if (ctxMenuUngroupBtn) {
      ctxMenuUngroupBtn.style.display = (layer.type === 'group') ? 'flex' : 'none';
    }
    canvasContextMenu.style.display = 'block';
    const menuW = 190;
    const menuH = 260;
    const left = Math.min(e.clientX, window.innerWidth - menuW - 10);
    const top = Math.min(e.clientY, window.innerHeight - menuH - 10);
    canvasContextMenu.style.left = `${Math.max(10, left)}px`;
    canvasContextMenu.style.top = `${Math.max(10, top)}px`;
  };

  canvasContextMenu?.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      hideContextMenu();
      const action = item.dataset.action;
      const cur = getActiveScene();
      const selectedId = cur.selectedLayerId;

      if (action === 'group') {
        const grp = engine.groupSelected();
        if (grp) {
          pushHistory();
          updateLayerListUI();
          showToast('Objetos agrupados');
        }
        return;
      }

      if (action === 'ungroup') {
        engine.ungroupSelected();
        pushHistory();
        updateLayerListUI();
        showToast('Objetos desagrupados');
        return;
      }

      if (!selectedId) return;

      if (action === 'edit') {
        const editTabBtn = document.querySelector('.sidebar-tabs [data-tab="tabEdit"]');
        if (editTabBtn) editTabBtn.click();
        updatePropertiesUI();
        return;
      }

      if (action === 'duplicate') {
        engine.duplicateLayer(selectedId);
        pushHistory();
        showToast('Capa duplicada');
      } else if (action === 'bringFront') {
        const idx = cur.layers.findIndex(l => l.id === selectedId);
        if (idx !== -1 && idx < cur.layers.length - 1) {
          pushHistory();
          const [l] = cur.layers.splice(idx, 1);
          cur.layers.push(l);
          engine.render();
          updateLayerListUI();
          showToast('Traído al frente');
        }
      } else if (action === 'layerUp') {
        pushHistory();
        engine.moveLayerUp(selectedId);
        updateLayerListUI();
      } else if (action === 'layerDown') {
        pushHistory();
        engine.moveLayerDown(selectedId);
        updateLayerListUI();
      } else if (action === 'sendBack') {
        const idx = cur.layers.findIndex(l => l.id === selectedId);
        if (idx > 0) {
          pushHistory();
          const [l] = cur.layers.splice(idx, 1);
          cur.layers.unshift(l);
          engine.render();
          updateLayerListUI();
          showToast('Enviado al fondo');
        }
      } else if (action === 'delete') {
        if (selectedId === '__edge_fade__') {
          cur.edgeFade = false;
          if (edgeFadeToggle) edgeFadeToggle.checked = false;
          if (edgeFadeOptions) edgeFadeOptions.style.display = 'none';
        }
        pushHistory();
        engine.removeLayer(selectedId);
        updateLayerListUI();
        showToast('Capa eliminada');
      }
    });
  });

  // Atajos de teclado: Ctrl+G (Agrupar), Ctrl+Shift+G (Desagrupar)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.ctrlKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      if (e.shiftKey) {
        engine.ungroupSelected();
        pushHistory();
        updateLayerListUI();
        showToast('Objetos desagrupados');
      } else {
        const grp = engine.groupSelected();
        if (grp) {
          pushHistory();
          updateLayerListUI();
          showToast('Objetos agrupados');
        }
      }
    }
  });

  // 11. PANEL DE EDICIÓN DE PROPIEDADES
  const propSize = document.getElementById('propSize');
  const propSizeVal = document.getElementById('propSizeVal');
  const propColor = document.getElementById('propColor');
  const propColorHex = document.getElementById('propColorHex');
  const propStrokeWidth = document.getElementById('propStrokeWidth');
  const propStrokeWidthVal = document.getElementById('propStrokeWidthVal');
  const propStrokeColor = document.getElementById('propStrokeColor');
  const propStrokeColorHex = document.getElementById('propStrokeColorHex');
  const propShadowDepth = document.getElementById('propShadowDepth');
  const propShadowDepthVal = document.getElementById('propShadowDepthVal');
  const propShadowColor = document.getElementById('propShadowColor');
  const propShadowColorHex = document.getElementById('propShadowColorHex');
  const propShadowBlur = document.getElementById('propShadowBlur');
  const propShadowBlurVal = document.getElementById('propShadowBlurVal');
  const propLetterSpacing = document.getElementById('propLetterSpacing');
  const propLetterSpacingVal = document.getElementById('propLetterSpacingVal');
  const propTextTransform = document.getElementById('propTextTransform');
  const propTextContent = document.getElementById('propTextContent');
  const propTextCurve = document.getElementById('propTextCurve');
  const propTextCurveVal = document.getElementById('propTextCurveVal');

  const propOpacity = document.getElementById('propOpacity');
  const propOpacityVal = document.getElementById('propOpacityVal');
  const propShapeColor = document.getElementById('propShapeColor');
  const propShapeColorHex = document.getElementById('propShapeColorHex');
  const propGroupText = document.getElementById('propGroupText');
  const propGroupImage = document.getElementById('propGroupImage');
  const propGroupShape = document.getElementById('propGroupShape');
  const noSelectionMsg = document.getElementById('noSelectionMsg');

  // Helper de sincronización bidireccional entre picker y campo hexadecimal con enter
  function bindColorWithHex(pickerEl, hexEl, onChange) {
    if (!pickerEl || !hexEl) return;

    pickerEl.addEventListener('input', (e) => {
      hexEl.value = e.target.value.toUpperCase();
      onChange(e.target.value);
    });

    const handleHexChange = () => {
      let val = hexEl.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        pickerEl.value = val;
        hexEl.value = val.toUpperCase();
        onChange(val);
      } else if (/^#[0-9A-Fa-f]{3}$/.test(val)) {
        const exp = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
        pickerEl.value = exp;
        hexEl.value = exp.toUpperCase();
        onChange(exp);
      } else {
        hexEl.value = pickerEl.value.toUpperCase();
      }
    };

    hexEl.addEventListener('change', handleHexChange);
    hexEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleHexChange();
        hexEl.blur();
      }
    });
  }

  function updatePropertiesUI() {
    const layer = engine.getSelectedLayer();
    if (!layer) {
      if (noSelectionMsg) {
        noSelectionMsg.style.display = 'block';
        noSelectionMsg.textContent = 'Haz clic en cualquier objeto del lienzo para editarlo.';
      }
      if (propGroupText) propGroupText.style.display = 'none';
      if (propGroupImage) propGroupImage.style.display = 'none';
      if (propGroupShape) propGroupShape.style.display = 'none';
      return;
    }

    if (noSelectionMsg) noSelectionMsg.style.display = 'none';

    if (layer.type === 'text') {
      if (propGroupText) propGroupText.style.display = 'flex';
      if (propGroupImage) propGroupImage.style.display = 'none';
      if (propGroupShape) propGroupShape.style.display = 'none';

      if (fontPickerLabel) {
        fontPickerLabel.textContent = layer.fontFamily || 'Lilita One';
        fontPickerLabel.style.fontFamily = `"${layer.fontFamily || 'Lilita One'}", sans-serif`;
      }
      if (propSize) propSize.value = layer.fontSize || 44;
      if (propSizeVal) propSizeVal.textContent = `${layer.fontSize || 44}px`;

      const c = layer.color || '#222222';
      if (propColor) propColor.value = c;
      if (propColorHex) propColorHex.value = c.toUpperCase();

      if (propStrokeWidth) propStrokeWidth.value = layer.strokeWidth || 0;
      if (propStrokeWidthVal) propStrokeWidthVal.textContent = `${layer.strokeWidth || 0}px`;

      const sc = layer.strokeColor || '#000000';
      if (propStrokeColor) propStrokeColor.value = sc;
      if (propStrokeColorHex) propStrokeColorHex.value = sc.toUpperCase();

      if (propShadowDepth) propShadowDepth.value = layer.shadowDepth || 0;
      if (propShadowDepthVal) propShadowDepthVal.textContent = `${layer.shadowDepth || 0}px`;
      if (propShadowBlur) propShadowBlur.value = layer.shadowBlur || 0;
      if (propShadowBlurVal) propShadowBlurVal.textContent = `${layer.shadowBlur || 0}px`;

      const shc = layer.shadowColor || '#ffffff';
      if (propShadowColor) propShadowColor.value = shc;
      if (propShadowColorHex) propShadowColorHex.value = shc.toUpperCase();

      if (propLetterSpacing) propLetterSpacing.value = layer.letterSpacing || 0;
      if (propLetterSpacingVal) propLetterSpacingVal.textContent = `${layer.letterSpacing || 0}px`;
      if (propTextTransform) propTextTransform.value = layer.textTransform || 'none';
      if (propTextContent) propTextContent.value = layer.text || '';
      if (propTextCurve) propTextCurve.value = layer.curve || 0;
      if (propTextCurveVal) propTextCurveVal.textContent = `${layer.curve || 0}%`;

    } else if (layer.type === 'shape') {
      if (propGroupText) propGroupText.style.display = 'none';
      if (propGroupImage) propGroupImage.style.display = 'none';
      if (propGroupShape) propGroupShape.style.display = 'flex';

      const shCol = layer.color || '#fa5c5c';
      if (propShapeColor) propShapeColor.value = shCol;
      if (propShapeColorHex) propShapeColorHex.value = shCol.toUpperCase();

    } else if (layer.type === 'image') {
      if (propGroupText) propGroupText.style.display = 'none';
      if (propGroupImage) propGroupImage.style.display = 'flex';
      if (propGroupShape) propGroupShape.style.display = 'none';

      const op = layer.opacity !== undefined ? layer.opacity : 1.0;
      if (propOpacity) propOpacity.value = op;
      if (propOpacityVal) propOpacityVal.textContent = `${Math.round(op * 100)}%`;
    } else if (layer.type === 'group') {
      if (propGroupText) propGroupText.style.display = 'none';
      if (propGroupImage) propGroupImage.style.display = 'none';
      if (propGroupShape) propGroupShape.style.display = 'none';
      if (noSelectionMsg) {
        noSelectionMsg.style.display = 'block';
        noSelectionMsg.textContent = `${layer.name || 'Grupo'} (${(layer.children || []).length} objetos)`;
      }
    }
  }

  propSize?.addEventListener('input', (e) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      layer.fontSize = parseInt(e.target.value, 10);
      if (propSizeVal) propSizeVal.textContent = `${layer.fontSize}px`;
      engine.render();
    }
  });

  bindColorWithHex(propColor, propColorHex, (color) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      layer.color = color;
      engine.render();
    }
  });

  bindColorWithHex(propStrokeColor, propStrokeColorHex, (color) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      layer.strokeColor = color;
      engine.render();
    }
  });

  bindColorWithHex(propShadowColor, propShadowColorHex, (color) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      layer.shadowColor = color;
      engine.render();
    }
  });

  bindColorWithHex(propShapeColor, propShapeColorHex, (color) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'shape') {
      layer.color = color;
      engine.render();
    }
  });

  propStrokeWidth?.addEventListener('input', (e) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      layer.strokeWidth = parseInt(e.target.value, 10);
      if (propStrokeWidthVal) propStrokeWidthVal.textContent = `${layer.strokeWidth}px`;
      engine.render();
    }
  });

  propShadowDepth?.addEventListener('input', (e) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      layer.shadowDepth = parseInt(e.target.value, 10);
      if (propShadowDepthVal) propShadowDepthVal.textContent = `${layer.shadowDepth}px`;
      engine.render();
    }
  });

  propShadowBlur?.addEventListener('input', (e) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      layer.shadowBlur = parseInt(e.target.value, 10);
      if (propShadowBlurVal) propShadowBlurVal.textContent = `${layer.shadowBlur}px`;
      engine.render();
    }
  });

  propLetterSpacing?.addEventListener('input', (e) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      layer.letterSpacing = parseInt(e.target.value, 10);
      if (propLetterSpacingVal) propLetterSpacingVal.textContent = `${layer.letterSpacing}px`;
      engine.render();
    }
  });

  propTextTransform?.addEventListener('change', (e) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      pushHistory();
      layer.textTransform = e.target.value;
      engine.render();
    }
  });

  propTextContent?.addEventListener('input', (e) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      layer.text = e.target.value;
      engine.render();
      updateLayerListUI();
    }
  });

  propTextContent?.addEventListener('change', () => {
    pushHistory();
  });

  propTextCurve?.addEventListener('input', (e) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'text') {
      layer.curve = parseInt(e.target.value, 10);
      if (propTextCurveVal) propTextCurveVal.textContent = `${layer.curve}%`;
      engine.render();
    }
  });

  propTextCurve?.addEventListener('change', () => {
    pushHistory();
  });

  propOpacity?.addEventListener('input', (e) => {
    const layer = engine.getSelectedLayer();
    if (layer && layer.type === 'image') {
      layer.opacity = parseFloat(e.target.value);
      if (propOpacityVal) propOpacityVal.textContent = `${Math.round(layer.opacity * 100)}%`;
      engine.render();
    }
  });

  // 11.5 CATÁLOGO COMPLETO DE GOOGLE FONTS (Estilo oficial de Itch.io)

  let fullGoogleFontsCatalog = [];
  let displayedFontCount = 60;

  const fontSelectModal = document.getElementById('fontSelectModal');
  const btnOpenGoogleFontsModal = document.getElementById('btnOpenGoogleFontsModal');
  const fontDropdownGoogleFontsBtn = document.getElementById('fontDropdownGoogleFontsBtn');
  const btnCloseFontModal = document.getElementById('btnCloseFontModal');
  const modalFontSearch = document.getElementById('modalFontSearch');
  const modalFontCategory = document.getElementById('modalFontCategory');
  const modalFontList = document.getElementById('modalFontList');

  const openGoogleFontsModal = () => {
    if (!fontSelectModal) return;
    fontPickerDropdown?.classList.remove('open');
    displayedFontCount = 60;
    if (modalFontSearch) modalFontSearch.value = '';
    if (modalFontCategory) modalFontCategory.value = 'all';
    fontSelectModal.style.display = 'flex';
    renderModalFontList(true);
    setTimeout(() => modalFontSearch?.focus(), 50);
  };

  btnOpenGoogleFontsModal?.addEventListener('click', openGoogleFontsModal);
  fontDropdownGoogleFontsBtn?.addEventListener('click', openGoogleFontsModal);

  fetch('src/js/google-fonts-catalog.json')
    .then(res => res.json())
    .then(data => {
      fullGoogleFontsCatalog = data;
    })
    .catch(err => console.error('Error cargando catálogo:', err));

  function getFilteredGoogleFonts() {
    const q = (modalFontSearch?.value || '').trim().toLowerCase();
    const cat = modalFontCategory?.value || 'all';

    return fullGoogleFontsCatalog.filter(f => {
      if (cat !== 'all' && f.category !== cat) return false;
      if (q && !f.family.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderModalFontList(resetScroll = true) {
    if (!modalFontList) return;
    if (resetScroll) modalFontList.scrollTop = 0;

    const filtered = getFilteredGoogleFonts();
    const cur = getActiveScene();
    const selected = cur.layers.find(l => l.id === cur.selectedLayerId);
    const currentFamily = (selected && selected.type === 'text') ? (selected.fontFamily || 'Lilita One') : '';

    const toShow = filtered.slice(0, displayedFontCount);
    modalFontList.innerHTML = '';

    if (toShow.length === 0) {
      modalFontList.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--itch-muted); font-size: 13px;">No se encontraron fuentes</div>';
      return;
    }

    toShow.forEach(f => {
      const row = document.createElement('div');
      row.className = 'font-modal-item';
      if (f.family === currentFamily) row.classList.add('active');

      row.innerHTML = `
        <div class="font-modal-item-info">
          <span class="font-modal-item-name">${f.family}</span>
          <span class="font-modal-item-cat">${f.category}</span>
        </div>
        <span class="font-modal-item-preview">preview</span>
      `;

      // Carga directa de la tipografía para previsualización automática
      const nameSpan = row.querySelector('.font-modal-item-name');
      const previewBtn = row.querySelector('.font-modal-item-preview');

      nameSpan.style.fontFamily = `"${f.family}", sans-serif`;
      loadGoogleFont(f.family);

      // Enlace oficial de previsualización hacia la web de Google Fonts
      previewBtn.title = 'Ver en Google Fonts';
      previewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(`https://fonts.google.com/specimen/${encodeURIComponent(f.family.replace(/ /g, '+'))}`, '_blank', 'noopener,noreferrer');
      });

      row.addEventListener('click', () => {
        const activeScene = getActiveScene();
        const activeLayer = activeScene.layers.find(l => l.id === activeScene.selectedLayerId);
        if (activeLayer && activeLayer.type === 'text') {
          pushHistory();
          activeLayer.fontFamily = f.family;
          if (fontPickerLabel) {
            fontPickerLabel.textContent = f.family;
            fontPickerLabel.style.fontFamily = `"${f.family}", sans-serif`;
          }
          loadGoogleFont(f.family).then(() => {
            engine.render();
          });
          engine.render();
        }
        fontSelectModal.style.display = 'none';
        showToast(`Fuente: ${f.family}`);
      });

      modalFontList.appendChild(row);
    });
  }

  // Scroll infinito eficiente en el modal
  modalFontList?.addEventListener('scroll', () => {
    if (modalFontList.scrollTop + modalFontList.clientHeight >= modalFontList.scrollHeight - 50) {
      const filtered = getFilteredGoogleFonts();
      if (displayedFontCount < filtered.length) {
        displayedFontCount += 60;
        renderModalFontList(false);
      }
    }
  });

  btnCloseFontModal?.addEventListener('click', () => {
    if (fontSelectModal) fontSelectModal.style.display = 'none';
  });

  fontSelectModal?.addEventListener('click', (e) => {
    if (e.target === fontSelectModal) {
      fontSelectModal.style.display = 'none';
    }
  });

  modalFontSearch?.addEventListener('input', () => {
    displayedFontCount = 60;
    renderModalFontList(true);
  });

  modalFontCategory?.addEventListener('change', () => {
    displayedFontCount = 60;
    renderModalFontList(true);
  });

  // 12. CONTROLES DE FONDO (Patrón vs Imagen con Escala y Offset)
  const bgColorInput = document.getElementById('bgColorInput');
  const patternSelect = document.getElementById('patternSelect');
  const patternColorInput = document.getElementById('patternColorInput');
  const patternScale = document.getElementById('patternScale');
  const patternScaleVal = document.getElementById('patternScaleVal');
  const patternOpacity = document.getElementById('patternOpacity');
  const patternOpacityVal = document.getElementById('patternOpacityVal');

  const bgImageUpload = document.getElementById('bgImageUpload');
  const removeBgImageBtn = document.getElementById('removeBgImageBtn');
  const bgModePatternRadio = document.getElementById('bgModePattern');
  const bgModeImageRadio = document.getElementById('bgModeImage');
  const patternControlsWrapper = document.getElementById('patternControlsWrapper');
  const imageBgControlsWrapper = document.getElementById('imageBgControlsWrapper');

  // Escala y Offset de Imagen de Fondo
  const bgImgScale = document.getElementById('bgImgScale');
  const bgImgScaleVal = document.getElementById('bgImgScaleVal');
  const bgImgOffsetX = document.getElementById('bgImgOffsetX');
  const bgImgOffsetY = document.getElementById('bgImgOffsetY');

  bgImgScale?.addEventListener('input', (e) => {
    const cur = getActiveScene();
    cur.bgImgScale = parseFloat(e.target.value);
    if (bgImgScaleVal) bgImgScaleVal.textContent = `${Math.round(cur.bgImgScale * 100)}%`;
    engine.render();
  });

  bgImgOffsetX?.addEventListener('input', (e) => {
    const cur = getActiveScene();
    cur.bgImgOffsetX = parseInt(e.target.value, 10);
    engine.render();
  });

  bgImgOffsetY?.addEventListener('input', (e) => {
    const cur = getActiveScene();
    cur.bgImgOffsetY = parseInt(e.target.value, 10);
    engine.render();
  });

  // Degradado exterior de bordes
  const edgeFadeToggle = document.getElementById('edgeFadeToggle');
  const edgeFadeColorInput = document.getElementById('edgeFadeColorInput');
  const edgeFadeWidth = document.getElementById('edgeFadeWidth');
  const edgeFadeWidthVal = document.getElementById('edgeFadeWidthVal');
  const edgeFadeOptions = document.getElementById('edgeFadeOptions');

  edgeFadeToggle?.addEventListener('change', (e) => {
    const cur = getActiveScene();
    cur.edgeFade = e.target.checked;
    if (edgeFadeOptions) edgeFadeOptions.style.display = e.target.checked ? 'block' : 'none';

    if (e.target.checked) {
      if (!cur.layers.some(l => l.id === '__edge_fade__')) {
        cur.layers.push({
          id: '__edge_fade__',
          type: 'edge_fade',
          name: 'Fundido Exterior',
          locked: false
        });
      }
    } else {
      cur.layers = cur.layers.filter(l => l.id !== '__edge_fade__');
    }

    pushHistory();
    engine.render();
    updateLayerListUI();
  });

  bindColorWithHex(edgeFadeColorInput, edgeFadeColorHex, (color) => {
    pushHistory();
    getActiveScene().edgeFadeColor = color;
    engine.render();
  });

  edgeFadeWidth?.addEventListener('input', (e) => {
    const cur = getActiveScene();
    cur.edgeFadeWidth = parseInt(e.target.value, 10);
    if (edgeFadeWidthVal) edgeFadeWidthVal.textContent = `${cur.edgeFadeWidth}px`;
    engine.render();
  });

  const bgColorWrapper = document.getElementById('bgColorWrapper');

  function updateBgModeUI() {
    const cur = getActiveScene();
    if (cur.bgMode === 'image' && cur.bgImage) {
      if (bgModeImageRadio) bgModeImageRadio.checked = true;
      if (patternControlsWrapper) patternControlsWrapper.style.display = 'none';
      if (imageBgControlsWrapper) imageBgControlsWrapper.style.display = 'flex';
    } else {
      if (bgModePatternRadio) bgModePatternRadio.checked = true;
      if (patternControlsWrapper) patternControlsWrapper.style.display = 'flex';
      if (imageBgControlsWrapper) imageBgControlsWrapper.style.display = 'none';
    }

    if (cur.pattern === 'transparent') {
      if (bgColorWrapper) bgColorWrapper.style.display = 'none';
      if (patternPropsWrapper) patternPropsWrapper.style.display = 'none';
    } else {
      if (bgColorWrapper) bgColorWrapper.style.display = 'block';
      if (patternPropsWrapper) {
        patternPropsWrapper.style.display = (cur.pattern === 'none') ? 'none' : 'block';
      }
    }

    if (bgImgScale) bgImgScale.value = cur.bgImgScale !== undefined ? cur.bgImgScale : 1.0;
    if (bgImgScaleVal) bgImgScaleVal.textContent = `${Math.round((cur.bgImgScale !== undefined ? cur.bgImgScale : 1.0) * 100)}%`;
    if (bgImgOffsetX) bgImgOffsetX.value = cur.bgImgOffsetX || 0;
    if (bgImgOffsetY) bgImgOffsetY.value = cur.bgImgOffsetY || 0;

    if (edgeFadeToggle) edgeFadeToggle.checked = !!cur.edgeFade;
    if (edgeFadeOptions) edgeFadeOptions.style.display = cur.edgeFade ? 'block' : 'none';
    const efc = cur.edgeFadeColor || '#F7C6C8';
    if (edgeFadeColorInput) edgeFadeColorInput.value = efc;
    if (edgeFadeColorHex) edgeFadeColorHex.value = efc.toUpperCase();
    if (edgeFadeWidth) edgeFadeWidth.value = cur.edgeFadeWidth || 140;
    if (edgeFadeWidthVal) edgeFadeWidthVal.textContent = `${cur.edgeFadeWidth || 140}px`;
  }

  bgModePatternRadio?.addEventListener('change', () => {
    pushHistory();
    getActiveScene().bgMode = 'pattern';
    engine.render();
    updateBgModeUI();
  });

  bgModeImageRadio?.addEventListener('change', () => {
    const cur = getActiveScene();
    if (cur.bgImage) {
      pushHistory();
      cur.bgMode = 'image';
      engine.render();
      updateBgModeUI();
    }
  });

  bgImageUpload?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      pushHistory();
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        const img = new Image();
        img.onload = () => {
          const cur = getActiveScene();
          cur.bgImage = img;
          cur.bgImageSrc = dataUrl;
          cur.bgMode = 'image';
          cur.bgImgScale = 1.0;
          cur.bgImgOffsetX = 0;
          cur.bgImgOffsetY = 0;
          engine.render();
          updateBgModeUI();
          showToast('Fondo cargado (Ajustable con sliders)');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
      bgImageUpload.value = '';
    }
  });

  removeBgImageBtn?.addEventListener('click', () => {
    pushHistory();
    const cur = getActiveScene();
    cur.bgImage = null;
    cur.bgImageSrc = null;
    cur.bgMode = 'pattern';
    engine.render();
    updateBgModeUI();
  });

  bindColorWithHex(bgColorInput, bgColorHex, (color) => {
    pushHistory();
    getActiveScene().bgColor = color;
    engine.render();
  });

  const patternPropsWrapper = document.getElementById('patternPropsWrapper');

  patternSelect?.addEventListener('change', (e) => {
    pushHistory();
    getActiveScene().pattern = e.target.value;
    updateBgModeUI();
    engine.render();
  });

  bindColorWithHex(patternColorInput, patternColorHex, (color) => {
    pushHistory();
    getActiveScene().patternColor = color;
    engine.render();
  });

  patternScale?.addEventListener('input', (e) => {
    getActiveScene().patternScale = parseInt(e.target.value, 10);
    if (patternScaleVal) patternScaleVal.textContent = `${getActiveScene().patternScale}px`;
    engine.render();
  });

  patternOpacity?.addEventListener('input', (e) => {
    getActiveScene().patternOpacity = parseFloat(e.target.value);
    if (patternOpacityVal) patternOpacityVal.textContent = `${Math.round(getActiveScene().patternOpacity * 100)}%`;
    engine.render();
  });

  function syncAllControls() {
    const cur = getActiveScene();
    if (!cur) return;

    if (cur.edgeFade && !cur.layers.some(l => l.id === '__edge_fade__')) {
      cur.layers.push({
        id: '__edge_fade__',
        type: 'edge_fade',
        name: 'Fundido Exterior',
        locked: false
      });
    }

    if (bgColorInput) bgColorInput.value = cur.bgColor;
    if (bgColorHex) bgColorHex.value = (cur.bgColor || '#F7C6C8').toUpperCase();
    if (patternSelect) patternSelect.value = cur.pattern;
    if (bgColorWrapper) {
      bgColorWrapper.style.display = (cur.pattern === 'transparent') ? 'none' : 'block';
    }
    if (patternPropsWrapper) {
      patternPropsWrapper.style.display = (cur.pattern === 'none' || cur.pattern === 'transparent') ? 'none' : 'block';
    }
    if (patternColorInput) patternColorInput.value = cur.patternColor;
    if (patternColorHex) patternColorHex.value = (cur.patternColor || '#EDBCBE').toUpperCase();
    if (patternScale) patternScale.value = cur.patternScale;
    if (patternScaleVal) patternScaleVal.textContent = `${cur.patternScale}px`;
    if (patternOpacity) patternOpacity.value = cur.patternOpacity;
    if (patternOpacityVal) patternOpacityVal.textContent = `${Math.round(cur.patternOpacity * 100)}%`;
    if (canvasDimLabel) canvasDimLabel.textContent = `${cur.width} × ${cur.height} px`;

    // Botón de vista previa: Activo solo para Cover y Banner, gris claro y bloqueado para el resto
    const openMockupBtn = document.getElementById('openMockupBtn');
    if (openMockupBtn) {
      const isBanner = cur.typeKey === 'banner' || cur.category === 'banner';
      const isCover = cur.typeKey === 'cover' || cur.category === 'cover';
      if (isCover || isBanner) {
        openMockupBtn.disabled = false;
        openMockupBtn.style.opacity = '1';
        openMockupBtn.style.cursor = 'pointer';
        openMockupBtn.style.color = '';
        openMockupBtn.style.backgroundColor = '';
        openMockupBtn.title = isBanner ? 'Vista previa cabecera en Itch.io' : 'Vista previa catálogo en Itch.io';
      } else {
        openMockupBtn.disabled = true;
        openMockupBtn.style.opacity = '0.35';
        openMockupBtn.style.cursor = 'not-allowed';
        openMockupBtn.style.color = '#888888';
        openMockupBtn.style.backgroundColor = '#eaeaea';
        openMockupBtn.title = 'Vista previa no disponible para este lienzo';
      }
    }

    updateBgModeUI();
    updateLayerListUI();
    updatePropertiesUI();
  }

  // 13. ATAJOS DE TECLADO
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }

    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      const cur = getActiveScene();
      if (cur.selectedLayerId) {
        e.preventDefault();
        engine.duplicateLayer(cur.selectedLayerId);
        pushHistory();
        showToast('Capa duplicada (Ctrl+D)');
        return;
      }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const cur = getActiveScene();
      if (cur.selectedLayerId) {
        e.preventDefault();
        engine.removeLayer(cur.selectedLayerId);
        showToast('Objeto eliminado');
      }
    }
  });

  document.getElementById('undoBtn')?.addEventListener('click', undo);
  document.getElementById('redoBtn')?.addEventListener('click', redo);

  // 14. MENÚ DE DESCARGA (PNG, ZIP de todas las imágenes abiertas, .itch)
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadMenu = document.getElementById('downloadMenu');
  const downloadPngBtn = document.getElementById('downloadPngBtn');
  const downloadZipBtn = document.getElementById('downloadZipBtn');
  const downloadItchBtn = document.getElementById('downloadItchBtn');


  downloadBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadMenu?.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    downloadMenu?.classList.remove('open');
  });

  function renderCleanCanvas(isExport = false) {
    const cur = getActiveScene();
    const currentSel = cur.selectedLayerId;
    cur.selectedLayerId = null;
    engine.render(isExport);
    return currentSel;
  }

  function restoreSelection(id) {
    getActiveScene().selectedLayerId = id;
    engine.render();
  }

  // Descargar solo la imagen actual (con transparencia real si el fondo es transparente)
  downloadPngBtn?.addEventListener('click', () => {
    const sel = renderCleanCanvas(true);
    const cur = getActiveScene();
    const filename = `itch-${cur.typeKey}-${cur.width}x${cur.height}.png`;
    downloadCanvas(canvas, filename);
    restoreSelection(sel);
    downloadMenu?.classList.remove('open');
    showToast('Descargado PNG');
  });

  // Compilar y descargar todos los lienzos estructurados en 4 carpetas ZIP
  downloadZipBtn?.addEventListener('click', async () => {
    downloadMenu?.classList.remove('open');
    showToast('Compilando en 4 carpetas ZIP...');
    const projName = (currentProject?.name || 'itch-juego').toLowerCase().replace(/\s+/g, '-');
    const ok = await downloadAllScenesZip(scenesList, engine, `${projName}-assets.zip`);
    if (ok) showToast('ZIP descargado');
  });

  // Exportar proyecto .itch
  downloadItchBtn?.addEventListener('click', () => {
    downloadMenu?.classList.remove('open');
    const projName = (currentProject?.name || 'mi-juego').toLowerCase().replace(/\s+/g, '-');
    exportItchProject({ scenesList, activeSceneIndex }, `${projName}.itch`);
    showToast('Exportado .itch');
  });

  // 15. VISTA DE ITCH.IO EN VIVO (Cover catálogo y Banner cabecera)
  setupMockup(
    () => {
      const sel = renderCleanCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      restoreSelection(sel);
      return dataUrl;
    },
    () => getActiveScene(),
    () => currentProject?.name || 'Tu Juego'
  );

  syncAllControls();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
