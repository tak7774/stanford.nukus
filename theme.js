/* Light / dark theme. Loaded in <head> so the right colours show before the page paints.
   Order of choice: the visitor's saved choice, then the device setting, then light. */
(function () {
  var KEY = 'stanford-theme';
  var root = document.documentElement;
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function systemDark() { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', theme);
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    });
  }
  var initial = saved();
  if (initial !== 'dark' && initial !== 'light') initial = systemDark() ? 'dark' : 'light';
  apply(initial);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (err) { /* private mode: the choice just lasts for this visit */ }
  });
  document.addEventListener('DOMContentLoaded', function () { apply(root.getAttribute('data-theme')); });

  // Follow the device when the visitor has not chosen
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (e) { if (!saved()) apply(e.matches ? 'dark' : 'light'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }
})();
