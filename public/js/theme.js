// Theme manager — light/dark mode
const ThemeManager = {
  init() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    this.set(theme);

    document.getElementById('btn-theme').addEventListener('click', () => {
      this.toggle();
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.set(e.matches ? 'dark' : 'light');
      }
    });
  },

  set(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this._current = theme;
    const btn = document.getElementById('btn-theme');
    if (btn) btn.textContent = theme === 'dark' ? '\u2600' : '\u263D';
  },

  toggle() {
    const next = this._current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    this.set(next);
  },
};
