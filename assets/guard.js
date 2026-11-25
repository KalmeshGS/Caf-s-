/* Clickjacking guard. GitHub Pages cannot send X-Frame-Options or a frame-ancestors header,
   so the page refuses to run inside another site's frame (a trick used to steal clicks on log-in or pay buttons). */
(function () {
  if (window.top === window.self) return;
  document.documentElement.style.display = 'none';
  try { window.top.location = window.self.location.href; } catch (e) { /* framed inside a sandbox: stay blank */ }
})();
