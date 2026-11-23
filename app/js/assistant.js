'use strict';
/* =========================================================
   AI help chat — ask how to use the app, or any café question.
   Uses the free AI helper (window.AI_URL). Nothing is saved:
   the chat is kept only while this screen is open.
   ========================================================= */
App.chat = App.chat || [];
const aiBtn = () => (window.AI_URL ? `<button type="button" class="icon-btn ai-btn" data-act="aiChat" aria-label="AI help" title="AI help">${icon('spark')}</button>` : '');
const CHAT_IDEAS = ['How do I give a waiter a login?', 'How does stock reduce automatically?', 'How do I print a bill?', 'Suggest a price for masala chai'];
function chatBody() {
  const msgs = App.chat.map((m) => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}${m.err ? ' err' : ''}">${esc(m.content).replace(/\n/g, '<br>')}</div>`).join('');
  return msgs || `<div class="chat-hello"><p class="muted">Hi! Ask me how to do something in Cafe Journal, or any question about running your place.</p>
    <div class="chip-row">${CHAT_IDEAS.map((q) => `<button type="button" class="chip" data-act="aiIdea" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
}
function chatSheet() {
  return `${sheetHead('AI help', 'Ask anything')}
  <div class="chat" id="chat-log" aria-live="polite">${chatBody()}</div>
  <form data-form="aiAsk" class="chat-form">
    <button type="button" class="icon-btn" data-act="menuImpOpen" aria-label="Add a menu photo or file" title="Add a menu photo or file (Excel, CSV)">${icon('upload')}</button>
    <input name="q" maxlength="800" autocomplete="off" placeholder="Type your question…" aria-label="Your question" required>
    <button class="btn primary" type="submit" aria-label="Send">${icon('send')}</button>
  </form>
  <p class="muted sm">${icon('upload')} Got a menu as a photo, Excel or CSV? Tap the upload button — it's read on this phone, you check it, then add it to Menu or download a Cafe Journal menu file.</p>
  <p class="fine">Free AI — answers can be wrong; check important things. Don't type passwords or customer details.</p>`;
}
const msgsHtml = () => App.chat.map((m) => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}${m.err ? ' err' : ''}${m.pending ? ' pending' : ''}">${esc(m.content).replace(/\n/g, '<br>')}</div>`).join('');
const redrawChat = () => {
  const log = $('#chat-log'); if (log) { log.innerHTML = chatBody(); log.scrollTop = log.scrollHeight; }
  const home = $('#home-chat');
  if (home) {
    home.innerHTML = msgsHtml(); home.hidden = !App.chat.length;
    $('.home-ai')?.classList.toggle('talking', !!App.chat.length);
    home.scrollTop = home.scrollHeight;
  }
};

/* ---------------- Home: AI chat first, dashboard below (like opening an AI app) ---------------- */
function greeting() {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const first = String(Session.user()?.name || '').trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
function homeHero() {
  if (!window.AI_URL) return '';
  return `<section class="home-ai${App.chat.length ? ' talking' : ''}">
    <h1 class="home-hi"><span class="home-mark">${icon('spark')}</span>${esc(greeting())}</h1>
    <div class="home-thread" id="home-chat" aria-live="polite" ${App.chat.length ? '' : 'hidden'}>${msgsHtml()}</div>
    <form data-form="aiAsk" class="home-box">
      <textarea id="home-q" name="q" rows="2" maxlength="800" placeholder="How can I help you today?" aria-label="Ask the AI"></textarea>
      <div class="home-box-bar">
        <button type="button" class="btn ghost sm" data-act="menuImpOpen" title="Read a menu photo, Excel or CSV file">${icon('upload')}<span>Menu photo / file</span></button>
        <span class="muted sm">Free AI · ask about the app, recipes, prices…</span>
        <button class="btn primary home-send" type="submit" aria-label="Send">${icon('send')}</button>
      </div>
    </form>
    <div class="chip-row home-ideas">${CHAT_IDEAS.map((q) => `<button type="button" class="chip" data-act="aiIdea" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <a class="home-down" href="#home-dash" data-act="toDash">Today at a glance ${icon('down')}</a>
  </section><div id="home-dash"></div>`;
}
// Enter sends, Shift+Enter makes a new line
document.addEventListener('keydown', (e) => {
  if (e.target.id !== 'home-q' || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  e.preventDefault(); e.target.form.requestSubmit();
});
async function askAi(q) {
  q = String(q || '').trim().slice(0, 800); if (!q || App.chatBusy) return;
  App.chat.push({ role: 'user', content: q });
  App.chat.push({ role: 'assistant', content: 'Thinking…', pending: true });
  App.chatBusy = true; redrawChat();
  const history = App.chat.filter((m) => !m.pending && !m.err).slice(-10).map(({ role, content }) => ({ role, content }));
  let answer;
  try {
    const d = await aiCall('chat', { messages: history, role: ROLES[Session.role()]?.label || 'Staff', cafe: S.settings?.name || '' });
    answer = { role: 'assistant', content: d.reply };
  } catch (e) {
    answer = { role: 'assistant', content: `Sorry, I couldn't answer (${e.message}).`, err: true };
  }
  App.chat = App.chat.filter((m) => !m.pending); App.chat.push(answer);
  App.chatBusy = false; redrawChat();
}
Object.assign(Actions, {
  aiChat() { openSheet(chatSheet()); redrawChat(); },
  aiIdea(el) { askAi(el.dataset.q); },
  toDash(el, e) { e?.preventDefault?.(); $('#home-dash')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
});
Forms.aiAsk = (fd, form) => { const q = fd.get('q'); if (form) form.q.value = ''; askAi(q); };
