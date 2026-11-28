/* Light / dark theme, shared by all of Bright Kumedzro's tools. Loaded synchronously in <head> so the saved choice
   is applied before first paint (no flash). With no saved choice the page follows the system, live, in CSS alone.
   The sun/moon toggle is added here so it sits in the same corner on every page. */
(function () {
  var KEY = 'theme';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var BG = { light: '#ffffff', dark: '#0c0c0c' };

  var mem = null; // the choice for this page if storage is blocked
  function saved() {
    try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : mem; } catch (e) { return mem; }
  }
  function current() { return saved() || (mq && mq.matches ? 'dark' : 'light'); }

  function paint() {
    var s = saved();
    if (s) root.setAttribute('data-theme', s); else root.removeAttribute('data-theme');
    // theme-color: the pair of media-matched tags follows the system; an explicit choice sets both
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i];
      if (!m.hasAttribute('data-media')) m.setAttribute('data-media', m.getAttribute('media') || '');
      var media = m.getAttribute('data-media');
      var own = /dark/.test(media) ? 'dark' : 'light';
      m.setAttribute('content', BG[s || own]);
    }
    label();
  }

  var btn;
  var SUN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function label() {
    if (!btn) return;
    var dark = current() === 'dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.innerHTML = dark ? SUN : MOON;
  }
  function set(v) {
    mem = v;
    try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked: the choice still applies for this page */ }
    paint();
    try { window.dispatchEvent(new CustomEvent('themechange', { detail: v })); } catch (e) { /* ignore */ }
  }

  paint();

  function mount() {
    if (btn || !document.body) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.addEventListener('click', function () { set(current() === 'dark' ? 'light' : 'dark'); });
    document.body.appendChild(btn);
    label();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  if (mq) { var f = function () { if (!saved()) { paint(); } }; if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f); }
  window.addEventListener('storage', function (e) { if (e.key === KEY) paint(); });
})();
