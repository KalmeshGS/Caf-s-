# Cafe Journal AI helper

A tiny Cloudflare Worker that powers the **Ask AI** button in *Menu & recipes*.
It sends the dish name (plus your stock item names) to Claude and returns the
typical ingredients for **one serving**. You always check them before adding.

- The Anthropic API key is stored **only** as a Cloudflare secret — never in the website or in GitHub code.
- Only the website `https://kalmeshgs.github.io` can call it, and only people logged in to a café (Firebase login is checked).
- Each person can ask about 40 times an hour.
- Model: set in `wrangler.toml` (`MODEL`). `claude-haiku-5-5` is much cheaper if you prefer.

## One-time setup

1. **Anthropic (the AI):** sign up at <https://console.anthropic.com> → *Billing* → add a payment method and a small credit → *API keys* → *Create key*. Copy it (it starts with `sk-ant-`). Set a monthly spend limit under *Limits*.
2. **Cloudflare (free hosting):** sign up at <https://dash.cloudflare.com> → *Workers & Pages* → open it once so your free `workers.dev` address is created.
   - Copy your **Account ID** (right side of the Workers & Pages page).
   - *My Profile → API Tokens → Create Token →* template **Edit Cloudflare Workers** → *Create* → copy the token.
3. **GitHub:** repo → *Settings → Secrets and variables → Actions → New repository secret*, add three secrets:
   - `ANTHROPIC_API_KEY` — the Anthropic key
   - `CLOUDFLARE_API_TOKEN` — the Cloudflare token
   - `CLOUDFLARE_ACCOUNT_ID` — the account ID
4. GitHub → *Actions → Deploy AI helper → Run workflow*. The log shows the address, e.g. `https://cafe-journal-ai.<you>.workers.dev`.
5. Put that address in [`app/js/ai-config.js`](../app/js/ai-config.js): `window.AI_RECIPE_URL = 'https://cafe-journal-ai.<you>.workers.dev';` — the **Ask AI** button then appears.

Never paste any of these keys into a chat, an issue or the code.
