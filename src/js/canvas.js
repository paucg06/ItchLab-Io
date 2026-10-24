import { drawPattern } from './patterns.js';

// Cursor de rotación exacto: exterior negro, interior blanco (32x32)
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 247 247' fill='none'%3E%3Cpath d='M194.741 114.548C194.741 149.198 169.874 178.146 137.049 184.492V203.693L84.8552 173.765L137.049 143.837V161.415C157.382 155.527 172.295 136.752 172.295 114.547C172.295 87.6407 150.405 65.7502 123.499 65.7502C96.5921 65.7502 74.7015 87.6407 74.7015 114.547C74.7015 119.5 76.5 124 76.5 125.5L55 134C54 131 52.2558 125.118 52.2558 114.548C52.2566 75.2649 84.2163 43.3052 123.499 43.3052C162.782 43.3052 194.741 75.2649 194.741 114.548Z' fill='%23ffffff' stroke-width='32' stroke-linecap='round' stroke-linejoin='round' stroke='%23000000'/%3E%3Cpath d='M194.741 114.548C194.741 149.198 169.874 178.146 137.049 184.492V203.693L84.8552 173.765L137.049 143.837V161.415C157.382 155.527 172.295 136.752 172.295 114.547C172.295 87.6407 150.405 65.7502 123.499 65.7502C96.5921 65.7502 74.7015 87.6407 74.7015 114.547C74.7015 121.794 74.7015 116.5 74.7015 123.5L55.5 131C54 128.5 52.2558 125.118 52.2558 114.548C52.2566 75.2649 84.2163 43.3052 123.499 43.3052C162.782 43.3052 194.741 75.2649 194.741 114.548Z' fill='%23ffffff' stroke-width='9' stroke='%23ffffff'/%3E%3C/svg%3E") 16 16, crosshair`;

export class CanvasEngine {
  constructor(canvasElement, onStateChange, onActionCommit, onContextMenu) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onStateChange = onStateChange || (() => {});
    this.onActionCommit = onActionCommit || (() => {});
    this.onContextMenu = onContextMenu || null;

    this.state = null;
    this.selectedLayerIds = new Set();
    this.initialMultiPositions = [];
    this.isDragging = false;
    this.isRotating = false;
    this.hasMoved = false;
    this.activeSnap = null;
    this.activeHandle = null;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialLayerState = null;
    this.rotationStartAngle = 0;

    this.handleSize = 12;

    this.initEvents();
  }

  setState(state) {
    if (!state) return;
    this.state = state;
    if (state.selectedLayerId) {
      if (!this.selectedLayerIds.has(state.selectedLayerId)) {
        this.selectedLayerIds = new Set([state.selectedLayerId]);
      }
    } else {
      this.selectedLayerIds.clear();
    }
    const w = state.width || 630;
    const h = state.height || 500;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.render();
  }

  getSelectedLayer() {
    if (!this.state || !this.state.selectedLayerId) return null;
    if (this.state.selectedLayerId === '__background__') {
      if (this.state.bgMode === 'image' && this.state.bgImage) {
        return {
          id: '__background__',
          type: 'background',
          rotation: 0
        };
      }
      return null;
    }
    return this.state.layers.find(l => l.id === this.state.selectedLayerId) || null;
  }

  getBgImageBounds() {
    if (!this.state || this.state.bgMode !== 'image') return null;
    let bgImage = this.state.bgImage;
    if (!bgImage && this.state.bgImageSrc) {
      bgImage = new Image();
      bgImage.onload = () => this.render();
      bgImage.src = this.state.bgImageSrc;
      this.state.bgImage = bgImage;
    }
    if (!bgImage || (!bgImage.naturalWidth && !bgImage.width)) return null;

    const { width, height, bgImgScale, bgImgOffsetX, bgImgOffsetY } = this.state;
    const scale = bgImgScale !== undefined ? bgImgScale : 1.0;
    const offX = bgImgOffsetX || 0;
    const offY = bgImgOffsetY || 0;

    const imgW = bgImage.naturalWidth || bgImage.width || 1;
    const imgH = bgImage.naturalHeight || bgImage.height || 1;
    const imgAspect = imgW / imgH;
    const canvasAspect = width / height;
    let drawW, drawH;
    if (imgAspect > canvasAspect) {
      drawH = height * scale;
      drawW = drawH * imgAspect;
    } else {
      drawW = width * scale;
      drawH = drawW / imgAspect;
    }
    const drawX = (width - drawW) / 2 + offX;
    const drawY = (height - drawH) / 2 + offY;

    return { x: drawX, y: drawY, w: drawW, h: drawH };
  }

  getBounds(layer) {
    if (!layer) return null;

    if (layer.id === '__background__' || layer.type === 'background') {
      return this.getBgImageBounds();
    }

    if (layer.type === 'image' || layer.type === 'shape' || layer.type === 'group') {
      return { x: layer.x, y: layer.y, w: layer.width, h: layer.height };
    }

    if (layer.type === 'text') {
      this.ctx.save();
      const font = layer.fontFamily || 'Lilita One';
      const size = layer.fontSize || 44;
      this.ctx.font = `900 ${size}px "${font}", sans-serif`;

      if (layer.letterSpacing && this.ctx.letterSpacing !== undefined) {
        this.ctx.letterSpacing = `${layer.letterSpacing}px`;
      }

      let text = layer.text || '';
      if (layer.textTransform === 'uppercase') text = text.toUpperCase();
      if (layer.textTransform === 'lowercase') text = text.toLowerCase();

      const metrics = this.ctx.measureText(text);
      this.ctx.restore();

      const padX = 14;
      const padY = 8;
      const w = metrics.width + padX * 2;
      const h = size * 1.25 + padY * 2;

      return {
        x: Math.round(layer.x - w / 2),
        y: Math.round(layer.y - h / 2),
        w: Math.max(w, 24),
        h: Math.max(h, 24)
      };
    }

    return null;
  }

  getHandles(b, isBg = false) {
    const s = this.handleSize;
    return {
      tl: { x: b.x - s / 2, y: b.y - s / 2, w: s, h: s },
      tr: { x: b.x + b.w - s / 2, y: b.y - s / 2, w: s, h: s },
      bl: { x: b.x - s / 2, y: b.y + b.h - s / 2, w: s, h: s },
      br: { x: b.x + b.w - s / 2, y: b.y + b.h - s / 2, w: s, h: s },
      del: { x: b.x + b.w + 6, y: b.y - 18, w: 18, h: 18 }
    };
  }

  toLocalCoords(mx, my, layer) {
    const b = this.getBounds(layer);
    if (!b) return { x: mx, y: my };
    const rot = layer.rotation || 0;
    if (rot === 0) return { x: mx, y: my };

    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const dx = mx - cx;
    const dy = my - cy;
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);

    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  }

  getHitLayer(mx, my) {
    const layers = this.state.layers;
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const local = this.toLocalCoords(mx, my, layer);
      const b = this.getBounds(layer);
      if (b && local.x >= b.x && local.x <= b.x + b.w && local.y >= b.y && local.y <= b.y + b.h) {
        return layer;
      }
    }
    return null;
  }

  getHitHandle(mx, my, bounds, layer) {
    const isBg = !layer || layer.id === '__background__' || layer.type === 'background';
    const local = this.toLocalCoords(mx, my, layer);
    const handles = this.getHandles(bounds, isBg);
    const order = ['del', 'tl', 'tr', 'bl', 'br'];
    for (const key of order) {
      const h = handles[key];
      if (h && local.x >= h.x && local.x <= h.x + h.w && local.y >= h.y && local.y <= h.y + h.h) {
        return key;
      }
    }
    return null;
  }

  isInRotateZone(mx, my, bounds, layer) {
    if (!layer || layer.id === '__background__' || layer.type === 'background') return false;
    const local = this.toLocalCoords(mx, my, layer);
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y },
      { x: bounds.x, y: bounds.y + bounds.h },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h }
    ];

    for (const c of corners) {
      const dist = Math.hypot(local.x - c.x, local.y - c.y);
      if (dist >= this.handleSize / 2 && dist <= 16) {
        return true;
      }
    }
    return false;
  }

  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  initEvents() {
    const onStart = (e) => {
      if (!this.state) return;
      const { x: mx, y: my } = this.getCanvasCoords(e);
      this.dragStartX = mx;
      this.dragStartY = my;

      const selected = this.getSelectedLayer();
      if (selected) {
        const b = this.getBounds(selected);
        const hitHandle = this.getHitHandle(mx, my, b, selected);

        if (hitHandle === 'del') {
          if (selected.id === '__background__') {
            this.state.bgMode = 'pattern';
            this.state.bgImage = null;
            this.state.bgImageSrc = null;
            this.state.selectedLayerId = null;
            this.onStateChange(this.state);
            this.render();
          } else {
            this.removeLayer(selected.id);
          }
          return;
        }

        if (this.isInRotateZone(mx, my, b, selected)) {
          this.isRotating = true;
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          this.rotationStartAngle = Math.atan2(my - cy, mx - cx) - (selected.rotation || 0);
          return;
        }

        if (hitHandle) {
          this.activeHandle = hitHandle;
          this.isDragging = true;
          this.initialLayerState = { ...selected, bounds: { ...b } };
          this.initialBgState = {
            offX: this.state.bgImgOffsetX || 0,
            offY: this.state.bgImgOffsetY || 0,
            scale: this.state.bgImgScale || 1.0,
            bounds: { ...b }
          };
          return;
        }
      }

      const clickedLayer = this.getHitLayer(mx, my);
      if (clickedLayer) {
        if (e.shiftKey) {
          if (this.selectedLayerIds.has(clickedLayer.id)) {
            this.selectedLayerIds.delete(clickedLayer.id);
            this.state.selectedLayerId = this.selectedLayerIds.size > 0 ? Array.from(this.selectedLayerIds)[this.selectedLayerIds.size - 1] : null;
          } else {
            this.selectedLayerIds.add(clickedLayer.id);
            this.state.selectedLayerId = clickedLayer.id;
          }
          this.activeHandle = null;
          this.isDragging = false;
          this.initialMultiPositions = Array.from(this.selectedLayerIds).map(id => {
            const l = this.state.layers.find(x => x.id === id);
            return l ? { id: l.id, x: l.x, y: l.y } : null;
          }).filter(Boolean);
          this.onStateChange(this.state);
          this.render();
          return;
        }

        if (this.selectedLayerIds.has(clickedLayer.id) && this.selectedLayerIds.size > 1) {
          // Arrastrar grupo multiseleccionado
          this.activeHandle = null;
          this.isDragging = true;
          this.initialMultiPositions = Array.from(this.selectedLayerIds).map(id => {
            const l = this.state.layers.find(x => x.id === id);
            return l ? { id: l.id, x: l.x, y: l.y } : null;
          }).filter(Boolean);
          this.render();
          return;
        }

        if (e.altKey) {
          const copy = JSON.parse(JSON.stringify(clickedLayer));
          copy.id = 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
          copy.name = (copy.name || copy.type) + ' Copia';
          copy.img = clickedLayer.img || null;
          this.state.layers.push(copy);
          this.selectedLayerIds = new Set([copy.id]);
          this.state.selectedLayerId = copy.id;
          this.activeHandle = null;
          this.isDragging = true;
          this.hasMoved = true;
          this.initialLayerState = { ...copy, bounds: this.getBounds(copy) };
          this.initialMultiPositions = [];
          this.onStateChange(this.state);
          this.render();
          return;
        }

        this.selectedLayerIds = new Set([clickedLayer.id]);
        this.state.selectedLayerId = clickedLayer.id;
        this.activeHandle = null;
        this.isDragging = true;
        this.initialMultiPositions = [];
        this.initialLayerState = { ...clickedLayer, bounds: this.getBounds(clickedLayer) };
        this.onStateChange(this.state);
        this.render();
      } else {
        // Si no hay capa delantera pulsada, verificar si se pulsa la imagen de fondo
        if (this.state.bgMode === 'image' && this.state.bgImage && !e.shiftKey) {
          const bgB = this.getBgImageBounds();
          if (bgB && mx >= bgB.x && mx <= bgB.x + bgB.w && my >= bgB.y && my <= bgB.y + bgB.h) {
            this.selectedLayerIds.clear();
            this.state.selectedLayerId = '__background__';
            this.activeHandle = null;
            this.isDragging = true;
            this.initialBgState = {
              offX: this.state.bgImgOffsetX || 0,
              offY: this.state.bgImgOffsetY || 0,
              scale: this.state.bgImgScale || 1.0,
              bounds: { ...bgB }
            };
            this.onStateChange(this.state);
            this.render();
            return;
          }
        }

        if (!e.shiftKey) {
          this.selectedLayerIds.clear();
          if (this.state.selectedLayerId) {
            this.state.selectedLayerId = null;
            this.onStateChange(this.state);
            this.render();
          }
        }
      }
    };

    const onMove = (e) => {
      if (!this.state) return;
      const { x: mx, y: my } = this.getCanvasCoords(e);

      if (!this.isDragging && !this.isRotating) {
        const selected = this.getSelectedLayer();
        if (selected) {
          const b = this.getBounds(selected);
          const handle = this.getHitHandle(mx, my, b, selected);
          if (handle === 'del') {
            this.canvas.style.cursor = 'pointer';
            return;
          }
          if (this.isInRotateZone(mx, my, b, selected)) {
            this.canvas.style.cursor = ROTATE_CURSOR;
            return;
          }
          if (handle === 'tl' || handle === 'br') {
            this.canvas.style.cursor = 'nwse-resize';
            return;
          }
          if (handle === 'tr' || handle === 'bl') {
            this.canvas.style.cursor = 'nesw-resize';
            return;
          }

          const local = this.toLocalCoords(mx, my, selected);
          if (local.x >= b.x && local.x <= b.x + b.w && local.y >= b.y && local.y <= b.y + b.h) {
            this.canvas.style.cursor = 'move';
            return;
          }
        }

        const hit = this.getHitLayer(mx, my);
        if (hit) {
          this.canvas.style.cursor = 'pointer';
        } else if (this.state.bgMode === 'image' && this.state.bgImage) {
          this.canvas.style.cursor = 'crosshair';
        } else {
          this.canvas.style.cursor = 'default';
        }
        return;
      }

      const selected = this.getSelectedLayer();
      if (!selected) return;

      const dx = mx - this.dragStartX;
      const dy = my - this.dragStartY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        this.hasMoved = true;
      }

      // Movimiento y escalado de imagen de FONDO
      if (selected.id === '__background__') {
        if (this.activeHandle && this.initialBgState) {
          const cx = this.initialBgState.bounds.x + this.initialBgState.bounds.w / 2;
          const cy = this.initialBgState.bounds.y + this.initialBgState.bounds.h / 2;
          const currentDist = Math.hypot(mx - cx, my - cy);
          const startDist = Math.hypot(this.dragStartX - cx, this.dragStartY - cy);
          const ratio = currentDist / Math.max(startDist, 1);
          const newScale = Math.max(0.2, Math.min(3.5, (this.initialBgState.scale || 1.0) * ratio));
          this.state.bgImgScale = parseFloat(newScale.toFixed(2));
        } else if (this.initialBgState) {
          this.state.bgImgOffsetX = Math.round((this.initialBgState.offX || 0) + dx);
          this.state.bgImgOffsetY = Math.round((this.initialBgState.offY || 0) + dy);
        }
        this.onStateChange(this.state);
        this.render();
        return;
      }

      // 1. ROTACIÓN
      if (this.isRotating) {
        this.hasMoved = true;
        const b = this.getBounds(selected);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const currentAngle = Math.atan2(my - cy, mx - cx);
        selected.rotation = currentAngle - this.rotationStartAngle;
        this.canvas.style.cursor = ROTATE_CURSOR;
        this.render();
        return;
      }

      // 2. ESCALADO SIEMPRE DESDE EL CENTRO
      if (this.activeHandle) {
        this.hasMoved = true;
        const initB = this.initialLayerState.bounds;
        const cx = initB.x + initB.w / 2;
        const cy = initB.y + initB.h / 2;
        const initDist = Math.hypot(this.dragStartX - cx, this.dragStartY - cy);
        const currDist = Math.hypot(mx - cx, my - cy);
        const ratio = Math.max(0.08, currDist / Math.max(initDist, 1));

        if (selected.type === 'text') {
          selected.fontSize = Math.max(12, Math.min(260, Math.round((this.initialLayerState.fontSize || 44) * ratio)));
          selected.x = this.initialLayerState.x;
          selected.y = this.initialLayerState.y;
        } else {
          const newW = Math.max(16, Math.round(initB.w * ratio));
          const newH = Math.max(16, Math.round(initB.h * ratio));
          selected.width = newW;
          selected.height = newH;
          selected.x = Math.round(cx - newW / 2);
          selected.y = Math.round(cy - newH / 2);
        }
      } else {
        // Arrastre multiselección con Shift
        if (this.initialMultiPositions && this.initialMultiPositions.length > 1) {
          this.hasMoved = true;
          for (const pos of this.initialMultiPositions) {
            const l = this.state.layers.find(x => x.id === pos.id);
            if (l) {
              l.x = Math.round(pos.x + dx);
              l.y = Math.round(pos.y + dy);
            }
          }
          this.render();
          return;
        }

        let targetX = this.initialLayerState.x + dx;
        let targetY = this.initialLayerState.y + dy;

        // Smart Snapping al centro del lienzo
        const width = this.state.width;
        const height = this.state.height;
        const cx = width / 2;
        const cy = height / 2;
        const b = this.initialLayerState.bounds;

        let objCenterX, objCenterY;
        if (selected.type === 'text') {
          objCenterX = targetX;
          objCenterY = targetY;
        } else {
          objCenterX = targetX + (b.w || 100) / 2;
          objCenterY = targetY + (b.h || 100) / 2;
        }

        const snapThreshold = 10;
        let snappedX = null;
        let snappedY = null;

        if (Math.abs(objCenterX - cx) < snapThreshold) {
          targetX = selected.type === 'text' ? cx : Math.round(cx - (b.w || 100) / 2);
          snappedX = cx;
        }
        if (Math.abs(objCenterY - cy) < snapThreshold) {
          targetY = selected.type === 'text' ? cy : Math.round(cy - (b.h || 100) / 2);
          snappedY = cy;
        }

        selected.x = Math.round(targetX);
        selected.y = Math.round(targetY);
        this.activeSnap = (snappedX !== null || snappedY !== null) ? { x: snappedX, y: snappedY } : null;
      }

      this.render();
    };

    const onEnd = () => {
      if (this.isDragging || this.isRotating) {
        const didMove = this.hasMoved;
        this.isDragging = false;
        this.isRotating = false;
        this.hasMoved = false;
        this.activeSnap = null;
        this.activeHandle = null;
        this.initialLayerState = null;
        this.onStateChange(this.state);
        this.render();
        if (didMove) {
          this.onActionCommit('transform');
        }
      }
    };

    this.canvas.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(e); }, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    // Zoom y escalado del fondo con la rueda del ratón
    this.canvas.addEventListener('wheel', (e) => {
      if (this.state && this.state.bgMode === 'image' && this.state.bgImage) {
        if (this.state.selectedLayerId === '__background__' || this.state.selectedLayerId === null) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.05 : -0.05;
          const currentScale = this.state.bgImgScale !== undefined ? this.state.bgImgScale : 1.0;
          const newScale = Math.max(0.2, Math.min(3.5, currentScale + delta));
          this.state.bgImgScale = parseFloat(newScale.toFixed(2));
          this.onStateChange(this.state);
          this.render();
        }
      }
    }, { passive: false });

    // Doble clic para edición directa de texto en el lienzo
    this.canvas.addEventListener('dblclick', (e) => {
      const { x: mx, y: my } = this.getCanvasCoords(e);
      const clicked = this.getHitLayer(mx, my);
      if (clicked && clicked.type === 'text') {
        this.openInlineTextEditor(clicked);
      }
    });

    // Menú contextual con clic derecho sobre objetos
    this.canvas.addEventListener('contextmenu', (e) => {
      const { x: mx, y: my } = this.getCanvasCoords(e);
      const clicked = this.getHitLayer(mx, my);
      if (clicked) {
        e.preventDefault();
        this.state.selectedLayerId = clicked.id;
        this.render();
        this.onStateChange(this.state);
        if (this.onContextMenu) {
          this.onContextMenu(e, clicked);
        }
      }
    });
  }

  openInlineTextEditor(layer) {
    if (!layer || layer.type !== 'text') return;
    const existing = document.getElementById('canvasInlineEditor');
    if (existing) existing.remove();

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;
    const b = this.getBounds(layer);
    if (!b) return;

    const input = document.createElement('input');
    input.id = 'canvasInlineEditor';
    input.type = 'text';
    input.value = layer.text || '';
    input.className = 'canvas-inline-text-input';

    const screenX = rect.left + b.x * scaleX;
    const screenY = rect.top + (layer.y - (layer.fontSize || 44) * 0.6) * scaleY;

    input.style.position = 'fixed';
    input.style.left = `${screenX}px`;
    input.style.top = `${screenY}px`;
    input.style.minWidth = `${Math.max(120, b.w * scaleX)}px`;
    input.style.fontSize = `${Math.max(14, (layer.fontSize || 44) * scaleY)}px`;
    input.style.fontFamily = `"${layer.fontFamily || 'Lilita One'}", sans-serif`;
    input.style.color = layer.color || '#222222';
    input.style.textAlign = layer.textAlign || 'center';
    input.style.zIndex = '2000';

    document.body.appendChild(input);
    input.focus();
    input.select();

    let saved = false;
    const commit = () => {
      if (saved) return;
      saved = true;
      const val = input.value.trim();
      if (val && val !== layer.text) {
        layer.text = val;
        this.onStateChange(this.state);
        this.render();
        this.onActionCommit('editText');
      }
      input.remove();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commit();
      } else if (ev.key === 'Escape') {
        saved = true;
        input.remove();
      }
    });
  }

  addLayer(layer) {
    layer.id = 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    layer.rotation = layer.rotation || 0;
    this.state.layers.push(layer);
    this.state.selectedLayerId = layer.id;
    this.onStateChange(this.state);
    this.render();
    return layer;
  }

  removeLayer(layerId) {
    if (!this.state) return;
    if (layerId === '__background__') {
      this.state.bgMode = 'pattern';
      this.state.bgImage = null;
      this.state.bgImageSrc = null;
      this.state.selectedLayerId = null;
      this.onStateChange(this.state);
      this.render();
      this.onActionCommit('delete');
      return;
    }
    if (layerId === '__edge_fade__') {
      this.state.edgeFade = false;
    }
    this.selectedLayerIds.delete(layerId);
    this.state.layers = this.state.layers.filter(l => l.id !== layerId);
    if (this.state.selectedLayerId === layerId) {
      this.state.selectedLayerId = null;
    }
    this.onStateChange(this.state);
    this.render();
    this.onActionCommit('delete');
  }

  moveLayerUp(layerId) {
    const idx = this.state.layers.findIndex(l => l.id === layerId);
    if (idx !== -1 && idx < this.state.layers.length - 1) {
      const item = this.state.layers.splice(idx, 1)[0];
      this.state.layers.splice(idx + 1, 0, item);
      this.onStateChange(this.state);
      this.render();
    }
  }

  moveLayerDown(layerId) {
    const idx = this.state.layers.findIndex(l => l.id === layerId);
    if (idx > 0) {
      const item = this.state.layers.splice(idx, 1)[0];
      this.state.layers.splice(idx - 1, 0, item);
      this.onStateChange(this.state);
      this.render();
    }
  }

  duplicateLayer(layerId) {
    if (!this.state) return null;
    const target = this.state.layers.find(l => l.id === layerId);
    if (!target) return null;
    const copy = JSON.parse(JSON.stringify(target));
    copy.id = 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    copy.name = (copy.name || copy.type) + ' Copia';
    copy.x = (target.x || 0) + 20;
    copy.y = (target.y || 0) + 20;
    copy.img = target.img || null;
    this.state.layers.push(copy);
    this.state.selectedLayerId = copy.id;
    this.onStateChange(this.state);
    this.render();
    this.onActionCommit('duplicate');
    return copy;
  }

  alignLayer(layerId, alignType) {
    if (!this.state) return;
    const layer = this.state.layers.find(l => l.id === layerId);
    if (!layer) return;
    const b = this.getBounds(layer);
    if (!b) return;

    const { width, height } = this.state;
    if (alignType === 'centerX') {
      if (layer.type === 'text') {
        layer.x = width / 2;
      } else {
        layer.x = Math.round((width - b.w) / 2);
      }
    } else if (alignType === 'centerY') {
      if (layer.type === 'text') {
        layer.y = height / 2;
      } else {
        layer.y = Math.round((height - b.h) / 2);
      }
    } else if (alignType === 'bottom') {
      layer.y = layer.type === 'text' ? Math.round(height - b.h / 2 - 24) : Math.round(height - b.h - 24);
    }

    this.onStateChange(this.state);
    this.render();
    this.onActionCommit('align');
  }

  render() {
    if (!this.state) return;
    const { width, height, bgMode, bgImage, bgColor, pattern, patternColor, patternScale, patternOpacity, edgeFade, edgeFadeColor, edgeFadeWidth, layers, bgImgScale, bgImgOffsetX, bgImgOffsetY } = this.state;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    // 1. RENDERIZADO DE FONDO (Patrón vs Imagen Customizada con Escala y Offset)
    let activeBgImg = bgImage;
    if (bgMode === 'image' && !activeBgImg && this.state.bgImageSrc) {
      activeBgImg = new Image();
      activeBgImg.onload = () => this.render();
      activeBgImg.src = this.state.bgImageSrc;
      this.state.bgImage = activeBgImg;
    }

    if (bgMode === 'image' && activeBgImg && (activeBgImg.naturalWidth > 0 || activeBgImg.width > 0)) {
      ctx.fillStyle = bgColor || '#F7C6C8';
      ctx.fillRect(0, 0, width, height);

      const scale = bgImgScale !== undefined ? bgImgScale : 1.0;
      const offX = bgImgOffsetX || 0;
      const offY = bgImgOffsetY || 0;

      const imgW = activeBgImg.naturalWidth || activeBgImg.width || 1;
      const imgH = activeBgImg.naturalHeight || activeBgImg.height || 1;
      const imgAspect = imgW / imgH;
      const canvasAspect = width / height;
      let drawW, drawH;
      if (imgAspect > canvasAspect) {
        drawH = height * scale;
        drawW = drawH * imgAspect;
      } else {
        drawW = width * scale;
        drawH = drawW / imgAspect;
      }
      const drawX = (width - drawW) / 2 + offX;
      const drawY = (height - drawH) / 2 + offY;

      ctx.drawImage(activeBgImg, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = bgColor || '#F7C6C8';
      ctx.fillRect(0, 0, width, height);
      drawPattern(ctx, width, height, pattern, patternColor, patternScale, patternOpacity);
    }

    // 2. FILTRO DE FUNDIDO EXTERIOR DE BORDES (fallback si no existe capa 'edge_fade')
    const hasEdgeFadeLayer = layers.some(l => l.type === 'edge_fade' || l.id === '__edge_fade__');
    if (edgeFade && !hasEdgeFadeLayer) {
      this.drawEdgeFade(ctx, width, height, edgeFadeColor || '#F7C6C8', edgeFadeWidth || 140);
    }

    // 3. RENDERIZADO DE CAPAS
    for (const layer of layers) {
      if (layer.type === 'edge_fade') {
        if (edgeFade) {
          this.drawEdgeFade(ctx, width, height, edgeFadeColor || '#F7C6C8', edgeFadeWidth || 140);
        }
      } else {
        this.drawLayer(ctx, layer);
      }
    }

    // 3.5 GUÍAS MAGNÉTICAS DE ALINEACIÓN (Smart Snapping)
    if (this.activeSnap) {
      ctx.save();
      ctx.strokeStyle = '#fa5c5c';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      if (this.activeSnap.x !== null) {
        ctx.beginPath();
        ctx.moveTo(this.activeSnap.x, 0);
        ctx.lineTo(this.activeSnap.x, height);
        ctx.stroke();
      }
      if (this.activeSnap.y !== null) {
        ctx.beginPath();
        ctx.moveTo(0, this.activeSnap.y);
        ctx.lineTo(width, this.activeSnap.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. CAJA DELIMITADORA (Individual o Multiselección)
    if (this.selectedLayerIds.size > 1) {
      this.drawMultiSelectionBox(ctx);
    } else {
      const selected = this.getSelectedLayer();
      if (selected) {
        this.drawSelectionBox(ctx, selected);
      }
    }
  }

  drawEdgeFade(ctx, width, height, solidColor, fadeW) {
    if (!fadeW || fadeW <= 0) return;
    ctx.save();

    // Lienzo offscreen para crear un fundido gausiano continuo sin costuras diagonales
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const offCtx = off.getContext('2d');

    // 1. Fondo sólido exterior
    offCtx.fillStyle = solidColor || '#F7C6C8';
    offCtx.fillRect(0, 0, width, height);

    // 2. Desvanecimiento suave hacia el interior
    offCtx.globalCompositeOperation = 'destination-out';
    const fw = Math.min(fadeW, Math.floor(Math.min(width, height) / 2) - 2);
    const blurPx = Math.max(3, Math.round(fw * 0.65));

    if (offCtx.filter !== undefined) {
      offCtx.filter = `blur(${blurPx}px)`;
      const inset = Math.max(1, Math.round(fw * 0.75));
      const radius = Math.min(inset * 1.5, Math.floor(Math.min(width, height) / 4));
      offCtx.beginPath();
      if (offCtx.roundRect) {
        offCtx.roundRect(inset, inset, width - inset * 2, height - inset * 2, radius);
      } else {
        offCtx.rect(inset, inset, width - inset * 2, height - inset * 2);
      }
      offCtx.fill();
    } else {
      const steps = Math.min(fw, 40);
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const alpha = 0.5 * (1 + Math.cos(Math.PI * t));
        offCtx.strokeStyle = `rgba(0, 0, 0, ${(alpha / steps).toFixed(3)})`;
        offCtx.lineWidth = (fw / steps) * 2;
        offCtx.strokeRect(i, i, width - i * 2, height - i * 2);
      }
    }

    ctx.drawImage(off, 0, 0);
    ctx.restore();
  }

  drawLayer(ctx, layer) {
    const b = this.getBounds(layer);
    if (!b) return;

    ctx.save();
    ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;

    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (layer.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate(layer.rotation);
      ctx.translate(-cx, -cy);
    }

    if (layer.type === 'group') {
      if (Array.isArray(layer.children)) {
        const scale = layer.width / Math.max(layer.origWidth || layer.width, 1);
        for (const child of layer.children) {
          const childRender = { ...child };
          if (child.type === 'text') {
            childRender.x = layer.x + child.relX * scale;
            childRender.y = layer.y + child.relY * scale;
            childRender.fontSize = Math.max(12, Math.round((child.origFontSize || child.fontSize || 44) * scale));
          } else {
            childRender.x = layer.x + child.relX * scale;
            childRender.y = layer.y + child.relY * scale;
            childRender.width = Math.max(16, Math.round((child.width || child.origW || 100) * scale));
            childRender.height = Math.max(16, Math.round((child.height || child.origH || 100) * scale));
          }
          this.drawLayer(ctx, childRender);
        }
      }
    } else if (layer.type === 'image') {
      let lImg = layer.img;
      if (!lImg && layer.src) {
        lImg = new Image();
        lImg.onload = () => this.render();
        lImg.src = layer.src;
        layer.img = lImg;
      }
      if (lImg && (lImg.naturalWidth > 0 || lImg.width > 0)) {
        ctx.drawImage(lImg, layer.x, layer.y, layer.width, layer.height);
      }
    } else if (layer.type === 'shape') {
      ctx.fillStyle = layer.color || '#fa5c5c';
      ctx.strokeStyle = layer.strokeColor || '#222222';
      ctx.lineWidth = layer.strokeWidth || 0;

      if (layer.shapeType === 'circle') {
        ctx.beginPath();
        ctx.arc(layer.x + layer.width / 2, layer.y + layer.height / 2, Math.min(layer.width, layer.height) / 2, 0, Math.PI * 2);
        ctx.fill();
        if (layer.strokeWidth > 0) ctx.stroke();
      } else if (layer.shapeType === 'star') {
        this.drawStarPath(ctx, layer.x + layer.width / 2, layer.y + layer.height / 2, 5, layer.width / 2, layer.width / 4);
        ctx.fill();
        if (layer.strokeWidth > 0) ctx.stroke();
      } else if (layer.shapeType === 'triangle') {
        this.drawTrianglePath(ctx, layer.x, layer.y, layer.width, layer.height);
        ctx.fill();
        if (layer.strokeWidth > 0) ctx.stroke();
      } else if (layer.shapeType === 'diamond') {
        this.drawDiamondPath(ctx, layer.x, layer.y, layer.width, layer.height);
        ctx.fill();
        if (layer.strokeWidth > 0) ctx.stroke();
      } else if (layer.shapeType === 'hexagon') {
        this.drawHexagonPath(ctx, layer.x + layer.width / 2, layer.y + layer.height / 2, Math.min(layer.width, layer.height) / 2);
        ctx.fill();
        if (layer.strokeWidth > 0) ctx.stroke();
      } else if (layer.shapeType === 'heart') {
        this.drawHeartPath(ctx, layer.x, layer.y, layer.width, layer.height);
        ctx.fill();
        if (layer.strokeWidth > 0) ctx.stroke();
      } else if (layer.shapeType === 'arrow') {
        this.drawArrowPath(ctx, layer.x, layer.y, layer.width, layer.height);
        ctx.fill();
        if (layer.strokeWidth > 0) ctx.stroke();
      } else {
        ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
        if (layer.strokeWidth > 0) ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
      }
    } else if (layer.type === 'text') {
      const font = layer.fontFamily || 'Lilita One';
      const size = layer.fontSize || 44;
      ctx.font = `900 ${size}px "${font}", sans-serif`;

      if (layer.letterSpacing && ctx.letterSpacing !== undefined) {
        ctx.letterSpacing = `${layer.letterSpacing}px`;
      }

      ctx.textAlign = layer.textAlign || 'center';
      ctx.textBaseline = 'middle';

      let text = layer.text || '';
      if (layer.textTransform === 'uppercase') text = text.toUpperCase();
      if (layer.textTransform === 'lowercase') text = text.toLowerCase();

      if (layer.shadowBlur > 0) {
        ctx.save();
        ctx.shadowColor = layer.shadowColor || 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = layer.shadowBlur || 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = layer.color || '#222222';
        ctx.fillText(text, layer.x, layer.y);
        ctx.restore();
      }

      const strokeWidth = layer.strokeWidth || 0;

      // Sombra 3D sólida extruida
      const shadowDepth = layer.shadowDepth || 0;
      if (shadowDepth > 0) {
        ctx.fillStyle = layer.shadowColor || '#ffffff';
        for (let d = 1; d <= shadowDepth; d++) {
          if (strokeWidth > 0) {
            ctx.strokeStyle = layer.shadowColor || '#000000';
            ctx.lineWidth = strokeWidth;
            ctx.lineJoin = 'round';
            ctx.strokeText(text, layer.x + d, layer.y + d);
          }
          ctx.fillText(text, layer.x + d, layer.y + d);
        }
      }

      // Contorno / Stroke
      if (strokeWidth > 0) {
        ctx.strokeStyle = layer.strokeColor || '#000000';
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, layer.x, layer.y);
      }

      ctx.fillStyle = layer.color || '#222222';
      ctx.fillText(text, layer.x, layer.y);
    }

    ctx.restore();
  }

  drawStarPath(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerRadius;
      let y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }

  drawTrianglePath(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  drawDiamondPath(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
  }

  drawHexagonPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  drawHeartPath(ctx, x, y, w, h) {
    ctx.beginPath();
    const topCurveHeight = h * 0.3;
    ctx.moveTo(x + w / 2, y + topCurveHeight);
    ctx.bezierCurveTo(x + w / 2, y, x, y, x, y + topCurveHeight);
    ctx.bezierCurveTo(x, y + (h + topCurveHeight) / 2, x + w / 2, y + (h + topCurveHeight) / 2, x + w / 2, y + h);
    ctx.bezierCurveTo(x + w / 2, y + (h + topCurveHeight) / 2, x + w, y + (h + topCurveHeight) / 2, x + w, y + topCurveHeight);
    ctx.bezierCurveTo(x + w, y, x + w / 2, y, x + w / 2, y + topCurveHeight);
    ctx.closePath();
  }

  drawArrowPath(ctx, x, y, w, h) {
    ctx.beginPath();
    const stemH = h * 0.36;
    const stemY = y + (h - stemH) / 2;
    const headW = w * 0.42;
    ctx.moveTo(x, stemY);
    ctx.lineTo(x + w - headW, stemY);
    ctx.lineTo(x + w - headW, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w - headW, y + h);
    ctx.lineTo(x + w - headW, stemY + stemH);
    ctx.lineTo(x, stemY + stemH);
    ctx.closePath();
  }

  drawSelectionBox(ctx, layer) {
    if (layer.id === '__background__') {
      const b = this.getBounds(layer);
      if (!b) return;

      ctx.save();

      // Recorte visual: Oscurecer suavemente la parte de la imagen que queda fuera del lienzo
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      if (b.y < 0) ctx.fillRect(b.x, b.y, b.w, -b.y);
      if (b.y + b.h > this.state.height) ctx.fillRect(b.x, this.state.height, b.w, b.y + b.h - this.state.height);
      if (b.x < 0) ctx.fillRect(b.x, Math.max(0, b.y), -b.x, Math.min(this.state.height, b.h));
      if (b.x + b.w > this.state.width) ctx.fillRect(this.state.width, Math.max(0, b.y), b.x + b.w - this.state.width, Math.min(this.state.height, b.h));

      // Marco discontinuo sobre la imagen completa
      ctx.strokeStyle = '#fa5c5c';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);

      // Marco blanco del área de recorte del lienzo
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, this.state.width, this.state.height);

      // Puntos de ancla en las 4 esquinas para escalar el fondo
      const handles = this.getHandles(b);
      for (const key of ['tl', 'tr', 'bl', 'br']) {
        const h = handles[key];
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.strokeStyle = '#fa5c5c';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(h.x, h.y, h.w, h.h);
      }

      // Botón circular de eliminar fondo con cruz perfectamente simétrica
      const del = handles.del;
      const delCx = del.x + del.w / 2;
      const delCy = del.y + del.h / 2;
      ctx.beginPath();
      ctx.arc(delCx, delCy, del.w / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fa5c5c';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const r = 4.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(delCx - r, delCy - r);
      ctx.lineTo(delCx + r, delCy + r);
      ctx.moveTo(delCx + r, delCy - r);
      ctx.lineTo(delCx - r, delCy + r);
      ctx.stroke();

      ctx.restore();
      return;
    }

    const b = this.getBounds(layer);
    if (!b) return;

    ctx.save();

    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (layer.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate(layer.rotation);
      ctx.translate(-cx, -cy);
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x, b.y, b.w, b.h);

    ctx.strokeStyle = '#fa5c5c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x, b.y, b.w, b.h);

    const handles = this.getHandles(b, false);
    for (const key of ['tl', 'tr', 'bl', 'br']) {
      const h = handles[key];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeStyle = '#fa5c5c';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    }

    const del = handles.del;
    const delCx = del.x + del.w / 2;
    const delCy = del.y + del.h / 2;
    ctx.beginPath();
    ctx.arc(delCx, delCy, del.w / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fa5c5c';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const r = 4.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(delCx - r, delCy - r);
    ctx.lineTo(delCx + r, delCy + r);
    ctx.moveTo(delCx + r, delCy - r);
    ctx.lineTo(delCx - r, delCy + r);
    ctx.stroke();

    ctx.restore();
  }

  drawMultiSelectionBox(ctx) {
    if (!this.state) return;
    const ids = Array.from(this.selectedLayerIds);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const id of ids) {
      const layer = this.state.layers.find(l => l.id === id);
      if (!layer) continue;
      const b = this.getBounds(layer);
      if (!b) continue;

      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);

      // Marco punteado en cada objeto
      ctx.save();
      ctx.strokeStyle = '#fa5c5c';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }

    if (!isFinite(minX)) return;

    // Marco exterior continuo del grupo multiseleccionado
    const pad = 4;
    const gw = (maxX - minX) + pad * 2;
    const gh = (maxY - minY) + pad * 2;
    const gx = minX - pad;
    const gy = minY - pad;

    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(gx, gy, gw, gh);

    ctx.strokeStyle = '#fa5c5c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.restore();
  }

  groupSelected() {
    if (!this.state || this.selectedLayerIds.size < 2) return null;
    const ids = Array.from(this.selectedLayerIds);
    const layersToGroup = this.state.layers.filter(l => ids.includes(l.id));
    if (layersToGroup.length < 2) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    layersToGroup.forEach(l => {
      const b = this.getBounds(l);
      if (b) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
      }
    });

    if (!isFinite(minX)) return null;

    const groupW = Math.max(20, Math.round(maxX - minX));
    const groupH = Math.max(20, Math.round(maxY - minY));

    const children = layersToGroup.map(l => {
      const b = this.getBounds(l);
      const isText = l.type === 'text';
      return {
        ...l,
        relX: (isText ? l.x : b.x) - minX,
        relY: (isText ? l.y : b.y) - minY,
        origW: b.w,
        origH: b.h,
        origFontSize: l.fontSize || 44
      };
    });

    const groupLayer = {
      id: 'group_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      type: 'group',
      name: `Grupo (${layersToGroup.length})`,
      x: minX,
      y: minY,
      width: groupW,
      height: groupH,
      origWidth: groupW,
      origHeight: groupH,
      rotation: 0,
      children: children
    };

    const firstIdx = this.state.layers.findIndex(l => ids.includes(l.id));
    this.state.layers = this.state.layers.filter(l => !ids.includes(l.id));
    this.state.layers.splice(Math.max(0, firstIdx), 0, groupLayer);

    this.selectedLayerIds = new Set([groupLayer.id]);
    this.state.selectedLayerId = groupLayer.id;
    this.render();
    this.onStateChange(this.state);
    this.onActionCommit('group');
    return groupLayer;
  }

  ungroupSelected() {
    if (!this.state) return;
    const selected = this.getSelectedLayer();
    if (!selected || selected.type !== 'group' || !Array.isArray(selected.children)) return;
    const idx = this.state.layers.findIndex(l => l.id === selected.id);
    if (idx === -1) return;

    const scale = selected.width / Math.max(selected.origWidth || selected.width, 1);

    const unpacked = selected.children.map(child => {
      const copy = { ...child };
      if (copy.type === 'text') {
        copy.x = Math.round(selected.x + child.relX * scale);
        copy.y = Math.round(selected.y + child.relY * scale);
        copy.fontSize = Math.max(12, Math.round((child.origFontSize || child.fontSize || 44) * scale));
      } else {
        copy.x = Math.round(selected.x + child.relX * scale);
        copy.y = Math.round(selected.y + child.relY * scale);
        copy.width = Math.max(16, Math.round((child.width || child.origW || 100) * scale));
        copy.height = Math.max(16, Math.round((child.height || child.origH || 100) * scale));
      }
      delete copy.relX;
      delete copy.relY;
      delete copy.origW;
      delete copy.origH;
      delete copy.origFontSize;
      return copy;
    });

    this.state.layers.splice(idx, 1, ...unpacked);
    this.selectedLayerIds = new Set(unpacked.map(u => u.id));
    this.state.selectedLayerId = unpacked[0]?.id || null;
    this.render();
    this.onStateChange(this.state);
    this.onActionCommit('ungroup');
  }
}
