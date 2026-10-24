/**
 * Generador de Patrones Infinitos Procedurales
 * Sin degradados - Colores planos sólidos
 */

export function drawPattern(ctx, width, height, type, color, scale = 32, opacity = 1.0) {
  if (type === 'none' || opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  const size = Math.max(8, scale);

  switch (type) {
    case 'checker': {
      // Tablero de cuadrados perfecto
      for (let x = 0; x < width; x += size * 2) {
        for (let y = 0; y < height; y += size * 2) {
          ctx.fillRect(x, y, size, size);
          ctx.fillRect(x + size, y + size, size, size);
        }
      }
      break;
    }

    case 'pixel_grid': {
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x += size) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
      for (let y = 0; y <= height; y += size) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();
      break;
    }

    case 'isometric': {
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -height; x <= width + height; x += size) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + height * 1.732, height);
      }
      for (let x = -height; x <= width + height; x += size) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x - height * 1.732, height);
      }
      ctx.stroke();
      break;
    }

    case 'scanlines': {
      const lineH = Math.max(2, Math.floor(size / 6));
      const gap = lineH * 2;
      for (let y = 0; y < height; y += gap) {
        ctx.fillRect(0, y, width, lineH);
      }
      break;
    }

    case 'dots': {
      const radius = Math.max(1, Math.floor(size / 8));
      for (let x = size / 2; x < width; x += size) {
        for (let y = size / 2; y < height; y += size) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }

    case 'stripes': {
      ctx.lineWidth = Math.max(2, size / 3);
      ctx.beginPath();
      for (let x = -height; x < width + height; x += size) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + height, height);
      }
      ctx.stroke();
      break;
    }

    case 'bricks': {
      ctx.lineWidth = 2;
      const brickH = size;
      const brickW = size * 2;
      ctx.beginPath();
      let row = 0;
      for (let y = 0; y <= height; y += brickH) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        const offset = (row % 2 === 0) ? 0 : brickW / 2;
        for (let x = offset; x <= width; x += brickW) {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + brickH);
        }
        row++;
      }
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}
