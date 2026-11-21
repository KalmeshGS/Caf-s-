'use strict';
/* If this browser already has a café set up, greet it and point "Log in" at it.
   Only the café name is read — nothing else, and nothing leaves the device. */
(function () {
  let name = '';
  try { name = (JSON.parse(localStorage.getItem('cafe-journal.v1') || 'null') || {}).settings?.name || ''; } catch (e) { /* ignore */ }
  if (!name) return;
  const safe = document.createTextNode(name);
  const wb = document.getElementById('welcome-back');
  if (wb) { wb.textContent = 'Welcome back — '; wb.appendChild(safe); wb.append(' is set up on this device. Tap Log in to continue.'); wb.classList.add('known'); }
  document.querySelectorAll('[data-login]').forEach((a) => a.classList.replace('ghost', 'primary'));
  document.querySelectorAll('a[href="app/index.html#/signup"]').forEach((a) => { if (!a.closest('.start-card')) a.classList.replace('primary', 'ghost'); });
})();
