# Reglas del Proyecto - EternoDev

## Arquitectura de Carpetas
- `index.html` en la raíz (GitHub Pages ready).
- Todo el código fuente en `src/`:
  - `src/html/`: Vistas y plantillas HTML secundarias.
  - `src/css/`: Hojas de estilo CSS modulares.
  - `src/js/`: JavaScript modular (ES Modules).
  - `src/assets/images/`: Subdividido estrictamente por formato:
    - `src/assets/images/png/`
    - `src/assets/images/jpg/`
    - `src/assets/images/svg/`

## Restricciones Visuales y UX
- ❌ CERO SOBREINFORMACIÓN: Textos mínimos, directos y concisos. Nada de parrafadas. Etiquetas de 1-2 palabras ("Inicio", "Descargar", "Copiar"). Tan intuitivo que lo use un niño sin leer.
- ❌ CERO DEGRADADOS: Queda totalmente prohibido el uso de degradados (`linear-gradient`, `radial-gradient`, etc.). Únicamente colores planos sólidos con buen contraste.
- ❌ CERO EMOJIS: Queda totalmente prohibido el uso de emojis en toda la interfaz.
- ✅ ICONOS VECTORIALES: Utilizar siempre iconos vectoriales SVG limpios.

## Despliegue en GitHub (Multicuenta)
- En la primera subida a GitHub, no hacer push directo en segundo plano: preparar el commit y dejar un script `.bat` en el Escritorio para que el usuario ejecute el push interactivo una sola vez. Una vez autenticado, los pushes posteriores se pueden realizar automáticamente.
