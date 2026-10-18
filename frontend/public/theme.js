// Apply before the app and stylesheet load to avoid a light flash in dark mode.
(() => {
  let saved;
  try { saved = localStorage.getItem('daily-quest-theme'); } catch {}
  const theme = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
