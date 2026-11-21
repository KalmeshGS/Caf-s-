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

## About your data

All data is stored **in the browser on that device** (localStorage), and nothing is sent to any server. This means:

- Back up regularly with **Settings → Data → Download backup** (encrypted). On another phone or computer choose **I already use Cafe Journal → Restore** on the welcome screen.
- Several screens on the **same device** stay in sync. For example, the kitchen screen can be open in another window.
- Syncing *across* devices (for example, the waiter's phone sending orders to a kitchen tablet) needs a backend. Firebase or Supabase would be a natural next step.
