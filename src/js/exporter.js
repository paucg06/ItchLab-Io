import { CanvasEngine } from './canvas.js';

/**
 * Módulo de Exportación y Descarga de Lienzos (ItchLab.io)
 * CERO DEGRADADOS, CERO EMOJIS, Estructura estricta en carpetas
 * Límite estricto de compresión a máximo 3 MB por imagen
 */

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
    URL.revokeObjectURL(url);
  }, 2000);
}

export async function getCanvasBlobUnder3MB(canvas, preferredFormat = 'image/png') {
  const MAX_BYTES = 3 * 1024 * 1024; // 3 MB máximo estricto para itch.io

  // 1. Probar formato preferido (PNG)
  let blob = await new Promise(res => canvas.toBlob(res, preferredFormat));
  if (blob && blob.size <= MAX_BYTES) {
    return blob;
  }

  // 2. Si supera 3 MB, comprimir en JPEG con calidad decreciente
  let quality = 0.94;
  while (quality >= 0.5) {
    blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_BYTES) {
      return blob;
    }
    quality -= 0.1;
  }

  // 3. Si aún superase 3 MB (lienzos 4K masivos), reescalar ligeramente
  const temp = document.createElement('canvas');
  let scale = 0.85;
  while (scale >= 0.4) {
    temp.width = Math.round(canvas.width * scale);
    temp.height = Math.round(canvas.height * scale);
    const ctx = temp.getContext('2d');
    ctx.drawImage(canvas, 0, 0, temp.width, temp.height);
    blob = await new Promise(res => temp.toBlob(res, 'image/jpeg', 0.88));
    if (blob && blob.size <= MAX_BYTES) {
      return blob;
    }
    scale -= 0.15;
  }

  return blob;
}

/**
 * Renderizado de texto directo sobre el lienzo sin recuadros ni rebordes blancos/rosas
 * Solo texto grande negro (#111111) y texto rosa (#fa5c5c)
 */
function drawTemplateDirectText(ctx, width, height, catText, titleText, descText, subDescText) {
  ctx.save();

  // Escala tipográfica adaptativa al tamaño del lienzo
  const baseDim = Math.min(width, height);
  const titleSize = Math.max(36, Math.min(84, Math.round(baseDim * 0.11)));
  const catSize = Math.max(16, Math.min(26, Math.round(titleSize * 0.34)));
  const descSize = Math.max(14, Math.min(24, Math.round(titleSize * 0.30)));
  const subSize = Math.max(12, Math.min(18, Math.round(titleSize * 0.22)));

  const centerY = Math.round(height / 2);

  // 1. Categoría en rosa (#fa5c5c)
  ctx.fillStyle = '#fa5c5c';
  ctx.font = `800 ${catSize}px "Inter", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(catText.toUpperCase(), width / 2, centerY - titleSize * 0.85);

  // 2. Medida principal en texto negro sólido (#111111) MUCHO MÁS GRANDE
  ctx.fillStyle = '#111111';
  ctx.font = `900 ${titleSize}px "Inter", "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(titleText, width / 2, centerY);

  // 3. Descripción debajo en negro sólido / gris muy oscuro (#222222)
  ctx.fillStyle = '#222222';
  ctx.font = `700 ${descSize}px "Inter", "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(descText, width / 2, centerY + titleSize * 0.82);

  // 4. Detalle secundario / nota en rosa (#fa5c5c)
  if (subDescText) {
    ctx.fillStyle = '#fa5c5c';
    ctx.font = `600 ${subSize}px "Inter", "Segoe UI", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(subDescText, width / 2, centerY + titleSize * 0.82 + descSize * 1.55);
  }

  ctx.restore();
}

export async function downloadCanvas(canvas, filename = 'itch-cover.png') {
  const blob = await getCanvasBlobUnder3MB(canvas);
  let actualName = filename;
  if (blob.type === 'image/jpeg' && actualName.endsWith('.png')) {
    actualName = actualName.replace(/\.png$/, '.jpg');
  }
  triggerBlobDownload(blob, actualName);
}

export async function copyCanvasToClipboard(canvas) {
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
    return true;
  } catch (err) {
    console.warn('Error al copiar al portapapeles:', err);
    return false;
  }
}

export function exportItchProject(projectData, filename = 'mi-juego.itch') {
  // Limpiar referencias no serializables conservando src y bgImageSrc
  const cleanData = JSON.parse(JSON.stringify(projectData, (key, val) => {
    if (key === 'img' || key === 'bgImage') return undefined;
    return val;
  }));

  const jsonStr = JSON.stringify(cleanData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  triggerBlobDownload(blob, filename.endsWith('.itch') ? filename : `${filename}.itch`);
}

/**
 * Compila y descarga todos los lienzos abiertos en un ZIP estructurado
 * Cada archivo garantizado bajo el límite de 3 MB
 */
export async function downloadAllScenesZip(scenesList, engine, zipFilename = 'itch-pack-completo.zip') {
  const JSZipLib = window.JSZip;
  if (!JSZipLib) {
    alert('Cargando librería ZIP, reintenta en un segundo.');
    return false;
  }

  const zip = new JSZipLib();
  const coverFolder = zip.folder('cover');
  const bannerFolder = zip.folder('banner');
  const landscapeFolder = zip.folder('landscape');
  const backgroundFolder = zip.folder('background');

  const originalState = engine.state;

  for (let i = 0; i < scenesList.length; i++) {
    const scene = scenesList[i];
    const tempScene = JSON.parse(JSON.stringify(scene));
    tempScene.selectedLayerId = null;
    tempScene.bgImage = scene.bgImage;
    tempScene.layers.forEach((l, idx) => {
      l.img = scene.layers[idx]?.img || null;
    });

    engine.setState(tempScene);
    engine.render(true);
    const blob = await getCanvasBlobUnder3MB(engine.canvas);
    const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';

    const safeName = (scene.title || `asset-${i + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const filename = `${safeName}-${scene.width}x${scene.height}.${ext}`;

    const cat = scene.category || scene.typeKey || 'cover';
    if (cat === 'cover') {
      coverFolder.file(filename, blob);
    } else if (cat === 'banner') {
      bannerFolder.file(filename, blob);
    } else if (cat === 'background') {
      backgroundFolder.file(filename, blob);
    } else {
      landscapeFolder.file(filename, blob);
    }
  }

  engine.setState(originalState);

  const content = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(content, zipFilename);
  return true;
}

/**
 * Genera y descarga el paquete ZIP oficial de medidas:
 * - Raíz del ZIP:
 *   - cover.png (630 x 500)
 *   - banner.png (960 x 400)
 *   - landscape-16x9.png (1920 x 1080)
 *   - background.png (1920 x 1080)
 * - Carpeta 'otras-landscape/':
 *   - landscape-vertical-9x16.png (1080 x 1920)
 *   - landscape-arcade-4x3.png (1440 x 1080)
 *   - landscape-cuadrada-1x1.png (1080 x 1080)
 * Sin recuadros blancos ni bordes, solo texto negro y rosa grande directamente sobre el lienzo.
 */
export async function downloadOfficialTemplatesZip(createSceneFn) {
  const JSZipLib = window.JSZip;
  if (!JSZipLib) {
    alert('Cargando librería ZIP, reintenta en un segundo.');
    return;
  }

  const zip = new JSZipLib();
  const otherLandscapeFolder = zip.folder('otras-landscape');

  const off = document.createElement('canvas');
  const offEngine = new CanvasEngine(off);

  const templates = [
    // 4 Principales en la raíz del ZIP:
    {
      folder: zip,
      file: 'cover.png',
      type: 'cover',
      cat: 'itch.io · Portada',
      title: '630 × 500 px',
      desc: 'Tamaño recomendado para tu portada del juego',
      sub: 'Máx. 3840 × 2160 px (3 MB) · Ratio 1.26:1'
    },
    {
      folder: zip,
      file: 'banner.png',
      type: 'banner',
      cat: 'itch.io · Cabecera',
      title: '960 × 400 px',
      desc: 'Dimensiones recomendadas para la cabecera',
      sub: 'Mínimo 960 px de ancho · Máx. 3 MB'
    },
    {
      folder: zip,
      file: 'landscape-16x9.png',
      type: 'landscape_16_9',
      cat: 'itch.io · Captura Panorámica',
      title: '1920 × 1080 px (16:9)',
      desc: 'Captura panorámica estándar recomendada para itch.io',
      sub: 'Resolución Full HD · Aspect ratio 16:9 (YouTube)'
    },
    {
      folder: zip,
      file: 'background.png',
      type: 'background',
      cat: 'itch.io · Fondo de Pantalla',
      title: '1920 × 1080 px',
      desc: 'Fondo oficial repetible o escalado para tu página de juego',
      sub: 'Fondo Full HD · Compatible con mosaico y cover'
    },
    // En la subcarpeta 'otras-landscape/':
    {
      folder: otherLandscapeFolder,
      file: 'landscape-vertical-9x16.png',
      type: 'landscape_portal',
      cat: 'itch.io · Captura Vertical (9:16)',
      title: '1080 × 1920 px (9:16)',
      desc: 'Captura vertical optimizada para catálogo y móvil',
      sub: 'Resolución Full HD · Aspect ratio 9:16'
    },
    {
      folder: otherLandscapeFolder,
      file: 'landscape-arcade-4x3.png',
      type: 'screenshot_4_3',
      cat: 'itch.io · Captura Arcade (4:3)',
      title: '1440 × 1080 px (4:3)',
      desc: 'Captura de pantalla estándar arcade y retro',
      sub: 'Resolución HD · Aspect ratio 4:3'
    },
    {
      folder: otherLandscapeFolder,
      file: 'landscape-cuadrada-1x1.png',
      type: 'screenshot_1_1',
      cat: 'itch.io · Captura Cuadrada (1:1)',
      title: '1080 × 1080 px (1:1)',
      desc: 'Captura de pantalla cuadrada',
      sub: 'Resolución 1080 × 1080 px · Aspect ratio 1:1'
    }
  ];

  for (const t of templates) {
    const s = createSceneFn(t.type);
    s.selectedLayerId = null;
    offEngine.setState(s);

    const ctx = off.getContext('2d');
    drawTemplateDirectText(ctx, s.width, s.height, t.cat, t.title, t.desc, t.sub);

    const blob = await getCanvasBlobUnder3MB(off);
    t.folder.file(t.file, blob);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(content, 'medidas.zip');
}
