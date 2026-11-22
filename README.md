# Cafe Journal ☕

**The daily journal for cafés, restaurants, hotels and bakeries.** It's a website and an installable app in one. It handles orders, the kitchen screen, billing, stock, expenses, vendors, staff and monthly reports.

The design is minimalist and neutral, so it fits any food business. You choose your own name, type, currency, tables, tax and brand colour.

## What's inside

| # | Screen | What it does |
|---|--------|--------------|
| 01 | **Owner dashboard** | Today's sales, expenses and profit, plus hourly sales, top items, low stock and vendor dues |
| 02 | **Orders → Kitchen** | The waiter picks a table and adds items, and the order goes to the kitchen screen |
| — | **Kitchen screen** | Tickets in *New → Cooking → Ready* columns, each with a live timer (amber after 10 min, red after 20). New tickets play a sound |
| 03 | **Billing** | Cash, UPI/wallet or card payments, with discounts, tax and printable receipts. *Day closing* shows the split by payment type and saves it to the journal |
| 04 | **Stock** | Stock levels with bars, quick +/− buttons and low-stock alerts |
| 05 | **Expenses** | Entries by category (Rent, Utilities, Vendor, Kitchen, Salary…), shown in a donut chart for each month |
| 06 | **Vendors** | What you owe each vendor. Adding a bill also records it as an expense, and you can record payments and see the history |
| 07 | **Staff** | Shifts, daily attendance (P / Late / Leave / Absent) and monthly salary, which is paid into expenses |
| 08 | **Reports** | The month's sales, expenses and **real profit**, plus daily sales, best sellers, where the money went and the payment split. You can export it as CSV |
| 09 | **Separate logins** | Owner, Manager, Cashier, Waiter and Kitchen roles, each with a PIN and only their own screens |
| ✎ | **Journal (daybook)** | A page per day with notes, tags, that day's numbers and the closing summary |
| ⚙ | **Settings** | Business profile, menu editor, PINs, backup and restore (JSON), sample data, and light or dark mode |

## Project structure

```
index.html            → marketing website (landing page)
assets/site.css       → website styles
app/                  → the web app (PWA)
  index.html
  app.css
  js/core.js          → helpers, store, charts, UI pieces
  js/data.js          → starter menus per business type + sample data
  js/views.js         → all screens
  js/main.js          → shell, actions, forms, boot
  manifest.webmanifest, sw.js, icons/   → installable + offline
```

It has **no build step and no dependencies**: plain HTML, CSS and JavaScript.

## Run it

- **Quickest:** open `app/index.html` in a browser.
- **Local server** (needed to install the app or use it offline):
  ```bash
  python3 -m http.server 8080
  # open http://localhost:8080
  ```

## Publish it free (GitHub Pages)

1. On GitHub, go to **Settings → Pages**.
2. Under *Source*, choose **Deploy from a branch**, pick your branch, select the `/ (root)` folder and click **Save**.
3. Your site will be at `https://<username>.github.io/<repo>/` and the app at `/app/`.

## Install as an app

- **Android / Chrome:** open the app, then menu ⋮ → **Install app**
- **iPhone / Safari:** Share → **Add to Home Screen**
- **Desktop Chrome / Edge:** use the install icon in the address bar

The installed app opens full-screen and works offline.

## Staff records & ID cards

- **Staff → Add staff** (owner): photo, name, designation, mobile, email, joining date, shift, salary, date of birth, gender, **blood group**, address, emergency contact, and **KYC** (ID proof type + number such as Aadhaar, plus PAN).
- **Employee ID is automatic**: café short code + joining year + running serial, e.g. **KK26001**, KK26002… The serial never restarts or repeats. Set the short code in Settings → Business.
- Open a profile → **ID card** → **Print ID card**: real card size (85.6 × 54 mm), front and back.
- KYC numbers are masked (•••• 9012) and visible to **owners only**; managers only see name, ID, shift and attendance.

## Logins & security

- **Login page**: Employee ID, phone or name + password. Nobody's name is shown on the page.
- **Team & access → Give login access**: pick the employee from the staff list, choose a role, and **type their first password yourself** (min 6 characters). They must change it at first login.
- **3 wrong passwords** → a pop-up offers *Ask owner to reset*. **4 wrong passwords** → the account is **locked**; even the right password won't open it until the owner unlocks it.
- Requests appear on the **Owner dashboard** and in Team & access: **Unlock & set password** (temporary password, must be changed) or **Unlock only**.
- **Owner** forgot/locked: use the **owner recovery code** (shown once at setup, a new one after each use).
- Passwords and the recovery code are stored only as **salted PBKDF2-SHA256 hashes** (150,000 rounds). Common passwords are refused.
- The app asks for the password every time it opens and **locks after 15 minutes** idle.
- **Backups are encrypted** (AES-256-GCM) with a passphrase you choose.
- A strict Content-Security-Policy blocks outside scripts.

## Online database (Firebase) — recommended

With an online database, **nothing is stored on the device**: all café data lives in Google Firebase, syncs live between every phone/computer, and each role can only reach what it's allowed to (enforced on Google's servers by `firestore.rules`). It's free for a café-sized workload (Firebase "Spark" plan).

### One-time setup (about 10 minutes)
1. Go to **https://console.firebase.google.com** → **Create a project** (any name, e.g. `cafe-journal`). Google Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
   Then **Settings → Authorized domains → Add domain →** `kalmeshgs.github.io`.
3. **Build → Firestore Database → Create database** → choose a location near you (e.g. `asia-south1` Mumbai) → **Start in production mode**.
4. In Firestore open the **Rules** tab, delete everything, paste the whole content of [`firestore.rules`](firestore.rules) and click **Publish**.
5. **Project settings (⚙) → General → Your apps → Web (`</>`)** → register an app (no hosting needed) → copy the `firebaseConfig` values.
6. Put them in [`app/js/firebase-config.js`](app/js/firebase-config.js) (`window.FIREBASE_CONFIG = { ... }`) and push — or send them to whoever maintains the site. These values are **not secret**.
7. Recommended: Google Cloud console → APIs & Services → Credentials → your *Browser key* → restrict it to the website `https://kalmeshgs.github.io/*`.

### Already have sample data in your café?
Settings → Data → **Erase café data** (keeps your settings and logins), then **Set up menu, stock & staff** to type your real details.

### Automatic rules deploy (GitHub Actions)
`firestore.rules` is published to Firebase automatically by `.github/workflows/firestore-rules.yml` whenever it changes on `main` (or when you run the workflow by hand). One-time setup:
1. Firebase console → ⚙ **Project settings → Service accounts → Generate new private key** → a `.json` file downloads.
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret** → Name `FIREBASE_SERVICE_ACCOUNT`, Value: paste the whole content of that file → **Add secret**.
3. Delete the downloaded file from your computer. Never share it or paste it anywhere else.

### Fresh start (erase everything)
GitHub → **Actions → "Reset database (deletes everything)" → Run workflow**, type `DELETE EVERYTHING` → Run.
This deletes **all** café data and **all** login accounts in Firebase (rules stay). It cannot be undone.

### How it works once connected
- **Sign up** (6 steps, no sample data): place → how you work → **menu → stock → staff & their logins** (each optional) → owner account. The owner creates the café with name, mobile, **email** and password. The app shows a **café code** (e.g. `KK-7F3Q2`).
- **Owner login**: email + password, on any device. Forgot it → *Forgot password* emails a reset link.
- **Staff login**: café code (asked once per device) + **Employee ID** + password. The owner types each person's first password; they must change it at first login.
- 3 wrong passwords → *Ask owner to reset*; 4 → **locked** (stored online, enforced by the rules). The owner unlocks it / sets a temporary password from the dashboard.
- KYC, salary, address and date of birth are stored separately and **only owners** can read them.
- A refresh keeps you logged in. **Owner, manager, cashier**: after 5 minutes without use the screen locks and only the **password** is asked (4 wrong → account locked). **Waiter & kitchen** stay logged in; screens refresh every 15 seconds.
- **Food ready alerts**: when the kitchen marks an order *Ready*, the person who took it gets a sound, vibration and (if allowed) a phone notification, plus a *Ready to serve* list on Orders.
- **Tables**: Free / Running is automatic from orders; staff can also mark a table *Needs cleaning*, *Reserved* or *Out of service* (⋯ on the table). **Reservations** tab: guest, phone, date, time, guests, table; *Arrived* opens that table for ordering.
- **Menu & recipes** screen for Owner, Manager and Kitchen: add/edit dishes and pick each ingredient from a dropdown with the amount in ml / L or g / kg (set once).
- **Managers** can add and edit staff (salary, DOB, address, emergency contact and KYC stay owner-only), update stock and the menu.
- **Recipe library** (built in, free, offline): typical ingredients for one serving of **280+ common dishes** — teas, coffees, shakes, juices, dosa/idli, biryani, curries, breads, Chinese, sandwiches, pizza, pasta, cakes, desserts. *Fill all from recipe library* (Menu & recipes) fills every dish whose ingredients are in your stock; *Recipe library* inside a dish shows the list to check, and missing items can be added to stock in one tap.
- **Ask AI** (optional): Claude suggests the ingredients for any dish name. Needs a one-time setup of a small, free Cloudflare helper that keeps the AI key secret — see [`worker/README.md`](worker/README.md).
- **Add ingredients fast** (in each dish): *Search on Google* (copy the list back), *Paste ingredients* (cups/spoons converted to ml/g, divided by servings, matched to stock, preview before adding), or *From a photo* (text read on the phone, nothing uploaded). Missing ingredients can be added to stock in one tap.
- **Recipes → automatic stock**: each menu item has *Ingredients per serving* (e.g. Tea: Milk 0.1 L, Sugar 0.01 kg, Tea 0.005 kg). Typical amounts are filled in automatically from the recipe library, matched to your stock names. When a ticket is marked **Served** (or its bill is paid) the stock goes down by recipe × quantity.
- **Notifications (🔔)**: an inbox for everyone with an unread count — food ready (waiters: their own orders), new/changed kitchen tickets (kitchen), upcoming reservations, low stock and login-help requests (owner/manager), and **notices** the owner or a manager posts to everyone or one role.
- **Billing**: *Print bill* before payment, or *Paid & print* to print the receipt.

## About your data

**Without** the online database (no Firebase config), all data is stored **in the browser on that device** (localStorage). This means:

- Back up regularly with **Settings → Data → Download backup** (encrypted). On another phone or computer choose **I already use Cafe Journal → Restore** on the welcome screen.
- Several screens on the **same device** stay in sync. For example, the kitchen screen can be open in another window.
- Syncing *across* devices (for example, the waiter's phone sending orders to a kitchen tablet) needs a backend. Firebase or Supabase would be a natural next step.
