/**
 * Presets, Tipografías y Especificaciones Oficiales de itch.io
 * CERO DEGRADADOS, CERO EMOJIS, Colores planos y sólidos
 */

// 35+ Tipografías gratuitas de Google Fonts (OFL / Comercial Libre)
export const GOOGLE_FONTS = [
  // Display & Cartoon / Gaming
  { name: 'Lilita One', category: 'Cartoon' },
  { name: 'Bungee', category: 'Cartoon' },
  { name: 'Luckiest Guy', category: 'Cartoon' },
  { name: 'Fredoka', category: 'Cartoon' },
  { name: 'Titan One', category: 'Cartoon' },
  { name: 'Righteous', category: 'Cartoon' },
  { name: 'Bangers', category: 'Comic' },
  { name: 'Boogaloo', category: 'Cartoon' },
  { name: 'Chango', category: 'Cartoon' },
  { name: 'Chewy', category: 'Cartoon' },
  { name: 'Shrikhand', category: 'Cartoon' },
  { name: 'Sigmar', category: 'Cartoon' },
  { name: 'Sniglet', category: 'Cartoon' },
  { name: 'Bungee Shade', category: 'Efecto' },
  { name: 'Bungee Inline', category: 'Efecto' },
  { name: 'Monoton', category: 'Retro' },
  { name: 'Permanent Marker', category: 'Brush' },

  // Pixel & Retro Gaming
  { name: 'Press Start 2P', category: 'Pixel' },
  { name: 'VT323', category: 'Pixel' },
  { name: 'Silkscreen', category: 'Pixel' },
  { name: 'Pixelify Sans', category: 'Pixel' },
  { name: 'Black Ops One', category: 'Acción' },
  { name: 'Russo One', category: 'Acción' },

  // Sans Modernas & Títulos
  { name: 'Rubik', category: 'Modern' },
  { name: 'Montserrat', category: 'Modern' },
  { name: 'Oswald', category: 'Modern' },
  { name: 'Teko', category: 'Condensada' },
  { name: 'Anton', category: 'Condensada' },
  { name: 'Bebas Neue', category: 'Condensada' },
  { name: 'Fjalla One', category: 'Condensada' },
  { name: 'Poppins', category: 'Limpia' },
  { name: 'Inter', category: 'Limpia' },
  { name: 'Nunito', category: 'Limpia' },
  { name: 'Comfortaa', category: 'Redonda' },
  { name: 'Quicksand', category: 'Redonda' },
  { name: 'Cinzel', category: 'Fantasía' },
  { name: 'MedievalSharp', category: 'Fantasía' },
  { name: 'Creepster', category: 'Terror' },
  { name: 'Nosifer', category: 'Terror' },
  { name: 'Special Elite', category: 'Vintage' }
];

// Especificaciones Oficiales de itch.io con soporte para resoluciones Múltiples (Recomendada, Intermedia, Máxima)
export const ITCH_TYPES = {
  cover: {
    key: 'cover',
    category: 'cover',
    name: 'Cover',
    folder: 'cover',
    desc: '630 × 500 px. Portada oficial de itch.io.',
    note: '',
    resolutions: {
      recommended: { width: 630, height: 500, label: 'Recomendada' },
      intermediate: { width: 1260, height: 1000, label: 'Intermedia' },
      maximum: { width: 3840, height: 2160, label: 'Máxima' }
    }
  },
  banner: {
    key: 'banner',
    category: 'banner',
    name: 'Banner',
    folder: 'banner',
    desc: '960 × 400 px. Cabecera oficial de tu juego.',
    note: '',
    resolutions: {
      recommended: { width: 960, height: 400, label: 'Recomendada' },
      intermediate: { width: 1440, height: 600, label: 'Intermedia' },
      maximum: { width: 1920, height: 800, label: 'Máxima' }
    }
  },
  landscape_16_9: {
    key: 'landscape_16_9',
    category: 'landscape',
    name: 'Landscape (16:9)',
    folder: 'landscape',
    desc: 'Captura panorámica estándar 16:9.',
    note: '',
    resolutions: {
      recommended: { width: 1920, height: 1080, label: 'Recomendada' },
      intermediate: { width: 1280, height: 720, label: 'Intermedia' },
      maximum: { width: 3840, height: 2160, label: 'Máxima' }
    }
  },
  landscape_portal: {
    key: 'landscape_portal',
    category: 'landscape',
    name: 'Landscape (9:16)',
    folder: 'landscape',
    desc: 'Captura vertical 9:16.',
    note: '',
    resolutions: {
      recommended: { width: 1080, height: 1920, label: 'Recomendada' },
      intermediate: { width: 720, height: 1280, label: 'Intermedia' },
      maximum: { width: 1440, height: 2560, label: 'Máxima' }
    }
  },
  screenshot_4_3: {
    key: 'screenshot_4_3',
    category: 'landscape',
    name: 'Landscape (4:3)',
    folder: 'landscape',
    desc: 'Captura clásica proporción 4:3.',
    note: '',
    resolutions: {
      recommended: { width: 1440, height: 1080, label: 'Recomendada' },
      intermediate: { width: 1200, height: 900, label: 'Intermedia' },
      maximum: { width: 2048, height: 1536, label: 'Máxima' }
    }
  },
  screenshot_1_1: {
    key: 'screenshot_1_1',
    category: 'landscape',
    name: 'Landscape (1:1)',
    folder: 'landscape',
    desc: 'Captura cuadrada proporción 1:1.',
    note: '',
    resolutions: {
      recommended: { width: 1080, height: 1080, label: 'Recomendada' },
      intermediate: { width: 800, height: 800, label: 'Intermedia' },
      maximum: { width: 2048, height: 2048, label: 'Máxima' }
    }
  },
  background: {
    key: 'background',
    category: 'background',
    name: 'Background',
    folder: 'background',
    desc: '1920 × 1080 px. Fondo oficial.',
    note: '',
    resolutions: {
      recommended: { width: 1920, height: 1080, label: 'Recomendada' }
    }
  }
};

/**
 * Crea una nueva escena de lienzo
 */
export function createScene(typeKey = 'cover', customTitle = null, copyFromScene = null, resTier = 'recommended') {
  let actualKey = typeKey;
  if (typeKey === 'landscape') actualKey = 'landscape_16_9';

  const meta = ITCH_TYPES[actualKey] || ITCH_TYPES.cover;
  const resMeta = meta.resolutions[resTier] || meta.resolutions.recommended;
  const width = resMeta.width;
  const height = resMeta.height;
  const id = 'scene_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const title = customTitle || meta.name;

  let layers = [];

  if (copyFromScene && copyFromScene.layers && copyFromScene.layers.length > 0) {
    const scaleX = width / copyFromScene.width;
    const scaleY = height / copyFromScene.height;

    layers = copyFromScene.layers.map(l => {
      const cloned = JSON.parse(JSON.stringify(l));
      cloned.id = 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      cloned.x = Math.round(cloned.x * scaleX);
      cloned.y = Math.round(cloned.y * scaleY);
      if (cloned.width) cloned.width = Math.round(cloned.width * scaleX);
      if (cloned.height) cloned.height = Math.round(cloned.height * scaleY);
      if (cloned.fontSize) cloned.fontSize = Math.max(12, Math.round(cloned.fontSize * Math.min(scaleX, scaleY)));
      cloned.img = l.img || null;
      return cloned;
    });
  }

  return {
    id,
    typeKey: actualKey,
    category: meta.category || actualKey,
    resTier,
    title,
    width,
    height,
    // Fondo por defecto Tablero Rosa (#F7C6C8 y #EDBCBE)
    bgMode: 'pattern',
    bgImage: copyFromScene && copyFromScene.bgImage ? copyFromScene.bgImage : null,
    bgColor: '#F7C6C8',
    pattern: 'checker',
    patternColor: '#EDBCBE',
    patternScale: Math.round(28 * (width / 630)),
    patternOpacity: 1.0,
    bgImgScale: 1.0,
    bgImgOffsetX: 0,
    bgImgOffsetY: 0,
    edgeFade: false,
    edgeFadeColor: '#F7C6C8',
    edgeFadeWidth: Math.round(140 * (width / 630)),
    layers,
    selectedLayerId: null
  };
}
