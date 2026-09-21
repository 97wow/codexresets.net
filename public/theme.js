(() => {
  const storageKey = 'codex-resets-theme';
  const preferredTheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const savedTheme = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return value === 'dark' || value === 'light' ? value : '';
    } catch {
      return '';
    }
  };
  const applyTheme = theme => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121318' : '#3929b8');
  };

  applyTheme(savedTheme() || preferredTheme());

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-theme-toggle]')) return;
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(storageKey, next); } catch {}
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', event => {
    if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light');
  });
})();
