# Decisions — Adaptive Business Setup

Where the spec ("Cafe Journal — Adaptive Business Setup: Research & Build Spec", 22 Nov 2026) met the existing code, these are the smallest changes made, and why.

## Phase 1 — Profile & flags (done)

| # | Decision | Why |
|---|----------|-----|
| D-01 | The spec's JSON (§13) is kept twice: `docs/businessProfile.config.json` (source of truth) and `app/js/businessProfile.config.js` (`window.BUSINESS_PROFILE = …`). A test checks that both are identical. | The app has no build step and loads plain scripts. A JSON fetch at start-up would add a network round-trip and an offline failure point. |
| D-02 | The profile lives in the café's existing settings document: `settings.profile = { preset, answers, updatedAt, updatedBy }`, `settings.features` (cached flags), `settings.taxProfile` (the spec's `tax`). | The spec's `business/{bizId}` maps onto our `cafes/{cid}/meta/settings` (Firestore). Only the owner can write it, which the existing rules already enforce. |
| D-03 | Older cafés with no profile are treated as **Family restaurant** (`casual_dining`), with their own table count and one kitchen on a screen. They are not written back until the owner runs Business setup. | The spec says to migrate to `casual_dining` or the closest match. The current app *is* a family-restaurant flow, so no screen disappears for existing users (e.g. Peda Cafe keeps tables, waiters, kitchen and bookings). |
| D-04 | `settings.tax` (one % used by the existing bill screen) is now set from the profile: food GST rate when "Regular GST", else 0. The full research tax object is in `settings.taxProfile`, and its rates come from config. | The existing bill math stays untouched. Rates stay editable, as the spec asks; confirm with a CA. |
| D-05 | The spec's 4-step signup is our 6-step signup: **Place → How you work → Tax & bills → Menu → Stock → Staff → Owner**. The old "How you work" step (currency, tables, tax %) is replaced. Currency moved to *Tax & bills*, tables come from `q_table_count`, and tax % comes from GST. | Smallest change that fits §5. |
| D-06 | "How you work" has 10 short screens instead of one question per screen (22 questions), each with a live "Your app will have" preview and a **Looks right — skip the rest** button. | Spec UX rule: "max ~12 screens". Follow-up questions (table count, hand-off, counters, kitchen device…) appear on the same screen as their parent question, only when relevant (spec `showIf`). |
| D-07 | FSSAI is required (14 digits), but the owner can tick **I'll add it later**. | The spec makes it required for bills. Blocking sign-up of someone who doesn't have the number handy would stop them trying the app. Bills print FSSAI when present. |
| D-08 | Screens hidden by flags in Phase 1: **Kitchen** (when kitchen = none), **Stock** (when stock = none), the **table grid** (when no tables; Orders becomes a counter list) and the **Reservations** tab (when bookings ≠ tables). The cashier's home becomes **Orders** when there is counter billing. Waiter and kitchen logins are only offered when those exist. | Spec §7 "Role → screens". Data is never deleted, and switching a flag back on shows everything again (acceptance test 4). |
| D-09 | The kitchen screen stays visible whenever the kitchen isn't "none", even if the owner picked "printed slip" only. | Printed kitchen slips are Phase 2. Until they exist, the screen is the only way the kitchen sees orders. |
| D-10 | "Optional" flags from `flagDefaults` (coupons, attendance, checklists, own_website) are **off** until the owner switches them on. The existing Staff → attendance screen is not tied to the new `attendance` flag. | `attendance` in the spec is a new selfie + GPS punch-in feature (Phase 3). The existing attendance register is a core Staff feature and must not disappear. |
| D-11 | Features that are switched on but not built yet show as **"· soon"** in the preview, never as working screens. Example: the cloud-kitchen aggregator inbox. | Honest feature list (spec §14.2 #7: "no promising features that don't exist"). The aggregator inbox v1 is Phase 3 in §12. |
| D-12 | Bills show GSTIN, FSSAI and "Tax Invoice" / "Bill of Supply" when set. | §10.4–10.5. Bill numbering, the optional service-charge toggle, packing charges and the CGST/SGST split are Phase 2. |
| D-13 | Menu import: paste from Excel / Google Sheets (tab or comma separated), a CSV file, or a photo of the printed menu (on-device OCR). A line without a price becomes a category heading. `.xlsx` files are asked to be saved as CSV. | §14.4 `menu_import` (Phase 1). It needs no paid AI and no upload, and it reuses the existing photo reader. |
| D-14 | Dashboard: a **Money received today** section splits takings by payment type: Cash, UPI/wallet and Card, plus any other method found on today's bills. | Owner request (22 Nov 2026). |

## Answers assumed for §15 "Open questions" (change any time)

- Backend: **stay on Firebase** (Auth + Firestore). It already runs live.
- QR menu / online ordering page: **later** (Phase 2/3).
- Printers: plan for **58 mm Bluetooth** first.
- Paid modules: **none for now**. Flags don't check a plan yet.
- Languages: **English first**. Kannada is next, and the question is already asked in setup.
- Pilot types to perfect first: **café, darshini / meals hotel, family restaurant**.
