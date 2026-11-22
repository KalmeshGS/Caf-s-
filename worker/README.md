# Cafe Journal AI helper (free)

A tiny Cloudflare Worker that powers two things in the app:
- **Ask AI** in *Menu & recipes* — typical ingredients for one serving of any dish (you check them before adding).
- **AI help** chat (✦ button at the top) — how to use the app, and everyday café questions.

It uses **Cloudflare Workers AI**, which has a **free daily allowance** — no AI key, no card. If the day's free allowance is used up, the app says so and it works again the next day.

- Only the website `https://kalmeshgs.github.io` can call it, and only people logged in to a café (Firebase login is checked).
- Each person can ask about 40 ingredient questions and 60 chat messages an hour.
- Models are set in `wrangler.toml` (`RECIPE_MODEL`, `CHAT_MODEL`).

## One-time setup (about 5 minutes, free)

1. **Cloudflare:** sign up free at <https://dash.cloudflare.com/sign-up> (Free plan, no card).
2. Open **Workers & Pages** once, so your free `workers.dev` address is created (choose a subdomain name if asked).
3. Copy your **Account ID** — it's on the right side of the Workers & Pages page (or in the browser address: `dash.cloudflare.com/<account id>/…`).
4. Create a token: top-right profile icon → **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers** → *Use template*. Under *Permissions* click **+ Add more** and add **Account · Workers AI · Read**. Choose your account under *Account Resources* → **Continue to summary → Create Token** → copy it (it is shown once).
5. **GitHub:** repo → **Settings → Secrets and variables → Actions → New repository secret** — add two secrets:
   - `CLOUDFLARE_API_TOKEN` — the token
   - `CLOUDFLARE_ACCOUNT_ID` — the account ID
6. GitHub → **Actions → Deploy AI helper → Run workflow**. The log shows the address, e.g. `https://cafe-journal-ai.<your-subdomain>.workers.dev`.
7. Put that address in [`app/js/ai-config.js`](../app/js/ai-config.js): `window.AI_URL = 'https://cafe-journal-ai.<your-subdomain>.workers.dev';` — the AI buttons then appear.

Never paste the token into a chat, an issue or the code — only into the GitHub secret.
