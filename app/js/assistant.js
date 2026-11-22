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
    <input name="q" maxlength="800" autocomplete="off" placeholder="Type your question…" aria-label="Your question" required>
    <button class="btn primary" type="submit" aria-label="Send">${icon('send')}</button>
  </form>
  <p class="fine">Free AI — answers can be wrong; check important things. Don't type passwords or customer details.</p>`;
}
const redrawChat = () => { const log = $('#chat-log'); if (log) { log.innerHTML = chatBody(); log.scrollTop = log.scrollHeight; } };
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
});
Forms.aiAsk = (fd, form) => { const q = fd.get('q'); if (form) form.q.value = ''; askAi(q); };
