'use strict';
/* If this browser already has a café set up, greet it and point "Log in" at it.
   Only the café name is read — nothing else, and nothing leaves the device. */
(function () {
  // Same one-time clean-up as the app (fresh start after the database reset)
  try {
    if (window.localStorage.getItem('cj.epoch') !== '2026-11-21-fresh') {
      ['cafe-journal.v1', 'cafe-journal.session', 'cj.cafe', 'cj.cafeName', 'cj.session'].forEach((k) => localStorage.removeItem(k));
    }
  } catch (e) { /* ignore */ }
  let name = '';
  try { name = localStorage.getItem('cj.cafeName') || (JSON.parse(localStorage.getItem('cafe-journal.v1') || 'null') || {}).settings?.name || ''; } catch (e) { /* ignore */ }
  if (!name) return;
  const safe = document.createTextNode(name);
  const wb = document.getElementById('welcome-back');
  if (wb) { wb.textContent = 'Welcome back — '; wb.appendChild(safe); wb.append(' is set up on this device. Tap Log in to continue.'); wb.classList.add('known'); }
  document.querySelectorAll('[data-login]').forEach((a) => a.classList.replace('ghost', 'primary'));
  document.querySelectorAll('a[href="app/index.html#/signup"]').forEach((a) => { if (!a.closest('.start-card')) a.classList.replace('primary', 'ghost'); });
})();

/* Filter chips in "Every screen your team needs" */
(function () {
  const chips = document.querySelectorAll('.fchip');
  chips.forEach((c) => c.addEventListener('click', () => {
    chips.forEach((x) => x.classList.toggle('on', x === c));
    document.querySelectorAll('.dl').forEach((d) => { d.hidden = c.dataset.f !== 'all' && d.dataset.k !== c.dataset.f; });
  }));
  // underline the nav link of the section in view
  const links = [...document.querySelectorAll('.nav nav a')];
  const secs = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
  secs.forEach((s) => io.observe(s));
})();
