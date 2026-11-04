// Apply the stored appearance before first paint to avoid a flash of the
// wrong theme. Mirrors src/stores/appearance.ts (zustand `persist` format).
(function () {
  try {
    var raw = JSON.parse(localStorage.getItem('pulse.appearance') || '{}');
    var s = raw.state || raw;
    var t = s.theme || 'system';
    if (t === 'system') {
      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      t = dark ? s.systemDark || 'obsidian' : s.systemLight || 'paper';
    }
    var root = document.documentElement;
    root.setAttribute('data-theme', t);
    if (s.density) root.setAttribute('data-density', s.density);
    if (s.accent) root.setAttribute('data-accent', s.accent);
    if (s.language) root.setAttribute('lang', s.language);
  } catch (e) {
    /* storage unavailable: keep defaults */
  }
})();
