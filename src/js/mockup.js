/**
 * Simulador de Vista Previa Oficial de Itch.io (Catálogo para Cover y Cabecera de Juego para Banner)
 * CERO DEGRADADOS, CERO EMOJIS, Colores planos sólidos
 */

export function setupMockup(canvasGetter, getActiveSceneFn, getProjectNameFn) {
  const modal = document.getElementById('mockupModal');
  const closeBtn = document.getElementById('closeMockupBtn');
  const triggerBtn = document.getElementById('openMockupBtn');
  const titleBadge = document.getElementById('mockupTitleBadge');

  // Vista Cover (Catálogo)
  const coverView = document.getElementById('mockupCoverView');
  const coverImg = document.getElementById('userMockupImg');
  const coverTitle = document.getElementById('userMockupTitle');

  // Vista Banner (Cabecera)
  const bannerView = document.getElementById('mockupBannerView');
  const bannerImg = document.getElementById('userBannerMockupImg');
  const bannerTitle = document.getElementById('userBannerMockupTitle');

  if (!modal || !triggerBtn) return;

  function openMockup() {
    const cur = typeof getActiveSceneFn === 'function' ? getActiveSceneFn() : null;
    if (!cur) return;

    // Solo Cover y Banner tienen vista previa oficial
    const isBanner = cur.typeKey === 'banner' || cur.category === 'banner';
    const isCover = cur.typeKey === 'cover' || cur.category === 'cover';
    if (!isBanner && !isCover) return;

    const result = typeof canvasGetter === 'function' ? canvasGetter() : canvasGetter;
    if (!result) return;

    try {
      let dataUrl = '';
      if (typeof result === 'string') {
        dataUrl = result;
      } else if (result.dataUrl) {
        dataUrl = result.dataUrl;
      } else if (result.toDataURL) {
        dataUrl = result.toDataURL('image/png');
      }

      const projName = typeof getProjectNameFn === 'function' ? getProjectNameFn() : 'Tu Juego';

      if (isBanner) {
        if (coverView) coverView.style.display = 'none';
        if (bannerView) bannerView.style.display = 'block';
        if (titleBadge) titleBadge.textContent = 'Cabecera';
        if (bannerImg && dataUrl) bannerImg.src = dataUrl;
        if (bannerTitle) bannerTitle.textContent = projName;
      } else {
        if (bannerView) bannerView.style.display = 'none';
        if (coverView) coverView.style.display = 'block';
        if (titleBadge) titleBadge.textContent = 'Catálogo';
        if (coverImg && dataUrl) coverImg.src = dataUrl;
        if (coverTitle) coverTitle.textContent = projName;
      }

      modal.style.display = 'flex';
      modal.classList.add('active');
    } catch (err) {
      console.error('Error al generar vista previa de Itch.io:', err);
    }
  }

  function closeMockup() {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }

  triggerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (triggerBtn.disabled) return;
    openMockup();
  });

  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeMockup();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeMockup();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMockup();
  });
}
