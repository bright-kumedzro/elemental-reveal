/* Counting visitors to this website, anonymously: visits, which pages are viewed, where visits came from, and
   whether the install command gets copied. Only an event name is sent: no IPs, cookies or identifiers. A visit
   counts once per tab session, each page once per tab. This file is for the website only; it is not part of the
   npm package, which makes no network requests. Does nothing on localhost, file: or automated browsers. */
(function () {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:' || navigator.webdriver) return;

  function source() {
    var p = new URLSearchParams(location.search).get('ref');
    if (p) return /^[a-z]+$/.test(p) ? p : 'other';
    var h = '';
    try { h = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { /* ignore */ }
    if (!h || h === location.hostname) return 'direct';
    if (/linkedin|lnkd\.in/.test(h)) return 'linkedin';
    if (/whatsapp|wa\.me/.test(h)) return 'whatsapp';
    if (/(^|\.)x\.com$|twitter|t\.co$/.test(h)) return 'x';
    if (/facebook|fb\.com/.test(h)) return 'facebook';
    if (/instagram/.test(h)) return 'instagram';
    if (/google\./.test(h)) return 'google';
    if (/brightkumedzro\.com$/.test(h)) return 'portfolio';
    if (/github/.test(h)) return 'github';
    return 'other';
  }

  function once(e, cap) {
    try {
      var k = 'reveal:t:' + e, n = +(sessionStorage.getItem(k) || 0);
      if (n >= cap) return false;
      sessionStorage.setItem(k, n + 1);
    } catch (x) { /* storage blocked: count anyway */ }
    return true;
  }

  function track(e, cap) {
    if (!once(e, cap)) return;
    var body = JSON.stringify(e === 'visit' ? { e: e, src: source() } : { e: e });
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon('/api/count', body))) fetch('/api/count', { method: 'POST', body: body, keepalive: true }).catch(function () {});
    } catch (x) { /* never let counting break the page */ }
  }

  track('visit', 1);
  var page = location.pathname.replace(/^\/|\.html$|\/$/g, '') || 'home';
  if (page === 'index') page = 'home';
  track('view:' + page, 1);

  document.addEventListener('copy', function () {
    var s = String(window.getSelection && window.getSelection());
    if (/npm i(nstall)? @brightkumedzro\/reveal/.test(s)) track('copy', 5);
  });
})();
