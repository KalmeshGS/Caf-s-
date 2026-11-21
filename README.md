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

## Default PINs

| Owner | Manager | Cashier | Waiter | Kitchen |
|------|---------|---------|--------|---------|
| set during setup (default 1234) | 2222 | 3333 | 4444 | 5555 |

Change them in **Settings → Logins**.

## About your data

All data is stored **in the browser on that device** (localStorage), and nothing is sent to any server. This means:

- Back up regularly with **Settings → Data → Download backup**. You can restore the backup on any device.
- Several screens on the **same device** stay in sync. For example, the kitchen screen can be open in another window.
- Syncing *across* devices (for example, the waiter's phone sending orders to a kitchen tablet) needs a backend. Firebase or Supabase would be a natural next step.
