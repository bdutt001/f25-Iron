// Basic image lightbox for Deliverables page
(function(){
  const backdrop = document.createElement('div');
  backdrop.className = 'lightbox-backdrop';
  backdrop.innerHTML = '<div class="lightbox-inner"><img class="lightbox-content" alt="Expanded image"/><div class="lightbox-caption" role="status" aria-live="polite"></div></div>';
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(backdrop);
  });

  function open(src, caption) {
    const img = backdrop.querySelector('.lightbox-content');
    const cap = backdrop.querySelector('.lightbox-caption');
    img.src = src;
    cap.textContent = caption || '';
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Delegate clicks for any element with [data-lightbox]
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lightbox]');
    if (!t) return;
    e.preventDefault();
    const src = t.getAttribute('data-lightbox-src') || t.getAttribute('src');
    const caption = t.getAttribute('data-lightbox') || t.getAttribute('alt') || '';
    if (src) open(src, caption);
  });
})();