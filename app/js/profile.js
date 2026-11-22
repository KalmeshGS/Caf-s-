'use strict';
/* =========================================================
   Adaptive business setup — Phase 1 (spec §5–§7, §10, §14.4)
   Business Profile (onboarding answers) → Feature Flags.
   Screens, menus and roles read the flags. Switching a flag off
   only hides UI — no data is ever deleted.
   Config (questions, presets, flags, tax): businessProfile.config.js
   ========================================================= */
const BP = window.BUSINESS_PROFILE;

/* ---------------- presets (step 1 picker) ---------------- */
const PRESETS = {
  darshini:      { label: 'Darshini / self-service', blurb: 'Pay first, eat standing, very fast', ic: 'receipt', type: 'restaurant' },
  qsr:           { label: 'Fast food counter',       blurb: 'Order at counter, token number', ic: 'clock', type: 'restaurant' },
  cafe:          { label: 'Café',                     blurb: 'Coffee, snacks, name called', ic: 'cup', type: 'cafe' },
  casual_dining: { label: 'Family restaurant',        blurb: 'Tables, waiters, bill at the end', ic: 'grid', type: 'restaurant' },
  fine_dining:   { label: 'Fine dining',              blurb: 'Bookings, courses, wine', ic: 'star', type: 'restaurant' },
  meals_hotel:   { label: 'Meals / Udupi / military hotel', blurb: 'Meals & tiffin, pay at counter', ic: 'flame', type: 'hotel' },
  dhaba:         { label: 'Dhaba',                    blurb: 'Highway, long hours, parcels', ic: 'truck', type: 'hotel' },
  bar:           { label: 'Bar / pub',                blurb: 'Drinks by peg, running tabs', ic: 'cup', type: 'restaurant' },
  cloud_kitchen: { label: 'Cloud kitchen',            blurb: 'Delivery only, Swiggy/Zomato', ic: 'send', type: 'restaurant' },
  bakery:        { label: 'Bakery / sweet shop',      blurb: 'Counter sales, by weight, cake orders', ic: 'box', type: 'bakery' },
  kiosk_small:   { label: 'Juice / ice-cream / chai counter', blurb: 'Small counter, one phone', ic: 'cup', type: 'cafe' },
  food_truck:    { label: 'Food truck / stall',       blurb: 'Short menu, works offline', ic: 'truck', type: 'restaurant' },
  buffet:        { label: 'Buffet',                   blurb: 'Price per person', ic: 'users', type: 'restaurant' },
  canteen:       { label: 'Canteen / food court',     blurb: 'Regulars, tokens, meal cards', ic: 'clipboard', type: 'restaurant' },
  mess_tiffin:   { label: 'Mess / tiffin service',    blurb: 'Monthly meal plans', ic: 'calendar', type: 'restaurant' },
  hotel_rooms:   { label: 'Hotel / lodge with rooms', blurb: 'Rooms + restaurant', ic: 'key', type: 'hotel' },
  catering:      { label: 'Banquet / catering',       blurb: 'Events, per-plate quotes', ic: 'calendar', type: 'restaurant' },
};
const DEFAULT_PRESET = 'casual_dining';

/* ---------------- question wording (plain words — no "KOT") ---------------- */
const Q = {
  q_eat_where: { label: 'Where do your customers eat?', hint: 'Pick all that apply', opts: { tables: 'Sit at tables', standing: 'Stand at counters', takeaway: 'Take a parcel', own_delivery: 'You deliver', aggregator: 'Swiggy / Zomato', rooms: 'In their hotel room' } },
  q_order_by: { label: 'Who takes the order?', hint: 'Pick all that apply', opts: { waiter: 'Waiter at the table', counter: 'Cashier at the counter', qr: 'Customer scans a QR code', phone: 'Phone / WhatsApp' } },
  q_pay_when: { label: 'When do customers pay?', hint: 'Pick all that apply', opts: { prepaid: 'Before getting food', postpaid: 'After eating', account: 'Monthly / on account', room: 'Added to their room bill', advance: 'Advance now, balance later' } },
  q_handoff: { label: 'How do they get their food?', opts: { serve: 'We bring it to the table', token: 'We call a token number', name: 'We call their name', station_coupon: 'They collect slips at each counter', instant: 'Handed over right away' } },
  q_kitchen: { label: 'How is your kitchen set up?', opts: { none: 'The person billing also makes it', single: 'One kitchen', multi: 'Separate counters (e.g. tandoor, Chinese, juice, bar)' } },
  q_kitchen_device: { label: 'How should the kitchen see orders?', opts: { kds: 'On a screen / tablet', print: 'Printed kitchen slip', both: 'Both', verbal: 'Told by voice — no system' } },
  q_menu_style: { label: 'How is your menu priced?', hint: 'Pick all that apply', opts: { alacarte: 'Each item has a price', variants: 'Sizes / add-ons', combos: 'Combos', meals: 'Meals / thali / unlimited', buffet: 'Buffet per person', weight: 'By weight', mrp: 'Packaged items with MRP' } },
  q_bookings: { label: 'Do people book in advance?', hint: 'Pick all that apply', opts: { tables: 'Tables', preorders: 'Cakes / bulk orders', events: 'Events / halls', none: 'No' } },
  q_regulars: { label: 'Do regular customers…', hint: 'Pick all that apply', opts: { credit: 'Pay later / monthly', wallet: 'Keep a prepaid balance', subscription: 'Take a monthly plan', loyalty: 'Earn rewards', none: 'None of these' } },
  q_internet: { label: 'Is your internet reliable?', opts: { yes: 'Yes', sometimes: 'Sometimes drops', often_no: 'Often no internet' } },
  q_gst: { label: 'GST registration', opts: { regular: 'Regular GST', composition: 'Composition scheme', none: 'Not registered' } },
  q_service_charge: { label: 'Offer a service charge?', opts: { no: 'No', optional: 'Yes — optional for the customer (off on every bill until the cashier ticks it with the customer’s OK)' } },
  q_packing: { label: 'Packing charge for parcels?', opts: { none: 'None', per_item: 'Per item', per_order: 'Per order' } },
  q_printer: { label: 'Printer', opts: { none: 'None — e-bill on WhatsApp / SMS', bt58: '58 mm Bluetooth', usb80: '80 mm USB / LAN' } },
  q_stock: { label: 'How closely do you want to track stock?', opts: { none: 'Not now', purchases: 'Just purchases & bills', recipe: 'Full recipe-based — reduces automatically when sold' } },
  q_staff_roles: { label: 'Who works here?', hint: 'Pick all that apply', opts: { owner: 'Owner', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter / Captain', chef: 'Chef / Cook', bartender: 'Bartender', delivery: 'Delivery', housekeeping: 'Housekeeping', front_desk: 'Front desk' } },
  q_devices: { label: 'Devices you’ll use', hint: 'Pick all that apply', opts: { owner_phone: 'Owner’s phone', counter: 'Counter tablet / laptop', waiter_phones: 'Waiter phones', kitchen_tablet: 'Kitchen tablet', tv: 'TV for token numbers' } },
  q_language: { label: 'Languages for menu & staff screens', hint: 'Pick all that apply', opts: { en: 'English', kn: 'ಕನ್ನಡ', hi: 'हिन्दी', te: 'తెలుగు', ta: 'தமிழ்', mr: 'मराठी' } },
};
/* The "How you work" questions, grouped into ≤ 12 short screens (spec §5 UX rules) */
const HOW_SCREENS = [
  { id: 'eat', title: 'Where customers eat', qs: ['q_eat_where', 'q_table_count', 'q_area_pricing', 'q_brands'] },
  { id: 'order', title: 'Taking orders', qs: ['q_order_by'] },
  { id: 'pay', title: 'Paying', qs: ['q_pay_when', 'q_handoff'] },
  { id: 'kitchen', title: 'Your kitchen', qs: ['q_kitchen', 'q_stations', 'q_kitchen_device'] },
  { id: 'menu', title: 'Your menu', qs: ['q_menu_style', 'q_time_menus'] },
  { id: 'extras', title: 'Drinks & rooms', qs: ['q_alcohol', 'q_rooms'] },
  { id: 'people', title: 'Bookings & regulars', qs: ['q_bookings', 'q_regulars'] },
  { id: 'hours', title: 'Hours & internet', qs: ['q_hours', 'q_internet'] },
  { id: 'stock', title: 'Stock', qs: ['q_stock'] },
  { id: 'team', title: 'Team & devices', qs: ['q_staff_roles', 'q_devices', 'q_language'] },
];

/* ---------------- answers ---------------- */
const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
const asArr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
/** Default answers for a preset (spec §13 presets) + sensible base values */
function presetAnswers(preset) {
  const p = clone(BP.presets[preset] || BP.presets[DEFAULT_PRESET]);
  return {
    q_preset: BP.presets[preset] ? preset : DEFAULT_PRESET,
    q_table_count: { count: asArr(p.q_eat_where).includes('tables') ? 8 : 0, areas: [] },
    q_area_pricing: false, q_time_menus: false, q_alcohol: false,
    q_rooms: { has: false, count: 0, maxTariff: 0 }, q_brands: { has: false, names: [] }, q_hours: { pastMidnight: false, cutoff: '04:00' },
    q_internet: 'yes', q_gst: 'regular', q_price_incl: false, q_service_charge: 'no', q_packing: 'none', q_printer: 'none',
    q_staff_roles: ['owner'], q_language: ['en'],
    ...p,
  };
}
/** Older cafés (before adaptive setup): treated as a family restaurant, which matches how the app always worked.
    Their table count is kept. Nothing is hidden that they used before. (docs/DECISIONS.md D-03) */
function legacyAnswers(st = {}) {
  const a = presetAnswers(DEFAULT_PRESET);
  a.q_table_count = { count: Number(st.tables ?? 8), areas: [] };
  a.q_gst = Number(st.tax) > 0 ? 'regular' : 'none';
  a.q_stations = ['Kitchen']; a.q_kitchen = 'single'; a.q_kitchen_device = 'kds';
  return a;
}
const profileOf = (st = S.settings || {}) => (st.profile && st.profile.answers ? st.profile : { preset: DEFAULT_PRESET, answers: legacyAnswers(st), legacy: true });

/* ---------------- §7 rules: answers → flags ---------------- */
function deriveFeatures(a) {
  a = a || {};
  const has = (q, v) => asArr(a[q]).includes(v);
  const f = { menu: true, billing: true, day_close: true, expenses: true, vendors: true, staff: true, auth: true, reports: true };
  // D1 where they eat
  f.tables = has('q_eat_where', 'tables');
  f.takeaway = has('q_eat_where', 'takeaway') || has('q_eat_where', 'standing');
  f.own_delivery = has('q_eat_where', 'own_delivery');
  f.aggregator_inbox = has('q_eat_where', 'aggregator');
  f.rooms_pms = a.q_rooms?.has === true || has('q_eat_where', 'rooms');
  f.floor_plan = f.tables && (Number(a.q_table_count?.count) >= 10 || (a.q_table_count?.areas || []).length > 1);
  f.area_pricing = f.tables && a.q_area_pricing === true;
  // D2 who takes the order
  f.waiter_app = f.tables && has('q_order_by', 'waiter');
  f.counter_pos = has('q_order_by', 'counter') || !f.waiter_app; // always some billing screen
  f.qr_self_order = has('q_order_by', 'qr');
  f.phone_orders = has('q_order_by', 'phone') || f.own_delivery;
  // D3 when they pay
  f.prepaid_flow = has('q_pay_when', 'prepaid');
  f.running_bill = has('q_pay_when', 'postpaid') || has('q_pay_when', 'room');
  f.customers = has('q_pay_when', 'account') || !asArr(a.q_regulars).every((v) => v === 'none');
  f.credit_khata = has('q_pay_when', 'account') || has('q_regulars', 'credit');
  f.prepaid_wallet = has('q_regulars', 'wallet');
  f.subscriptions = has('q_regulars', 'subscription');
  f.loyalty = has('q_regulars', 'loyalty');
  // D4 hand-off
  f.handoff = f.prepaid_flow ? (a.q_handoff || 'token') : 'serve';
  f.token_display = f.handoff === 'token' && asArr(a.q_devices).includes('tv');
  f.station_coupons = f.handoff === 'station_coupon';
  // D5 menu
  const m = asArr(a.q_menu_style).length ? asArr(a.q_menu_style) : ['alacarte'];
  f.variants_addons = m.includes('variants');
  f.combos = m.includes('combos');
  f.unlimited_meals = m.includes('meals');
  f.buffet_covers = m.includes('buffet') && f.tables;
  f.weight_items = m.includes('weight');
  f.retail_mrp_items = m.includes('mrp');
  f.time_menus = a.q_time_menus === true;
  f.bar_liquor = a.q_alcohol === true;
  f.multi_brand = a.q_brands?.has === true;
  // D6 kitchen
  f.kitchen = a.q_kitchen || 'single'; // none | single | multi
  const kd = a.q_kitchen_device || 'kds';
  f.kds = f.kitchen !== 'none' && (kd === 'kds' || kd === 'both');
  f.kot_print = f.kitchen !== 'none' && (kd === 'print' || kd === 'both');
  if (f.station_coupons) f.kitchen = 'multi';
  f.course_fire = f.waiter_app && a.q_preset === 'fine_dining';
  f.seat_ordering = f.course_fire;
  // bookings
  f.reservations = f.tables && has('q_bookings', 'tables');
  f.preorders_advance = has('q_bookings', 'preorders') || has('q_pay_when', 'advance');
  f.events_banquet = has('q_bookings', 'events');
  // operations
  f.stock_level = a.q_stock || 'purchases';
  f.offline_mode = a.q_internet !== 'yes' || ['dhaba', 'food_truck', 'darshini'].includes(a.q_preset);
  f.business_day_cutoff = a.q_hours?.pastMidnight ? (a.q_hours.cutoff || '04:00') : '00:00';
  f.shift_cash = !!a.q_hours?.pastMidnight || asArr(a.q_staff_roles).includes('cashier');
  f.feedback = f.customers;
  // §14.4 flags (defaults from the config's flagDefaults; "optional" = off until the owner switches it on)
  f.leakage_panel = true;
  f.kot_change_log = f.kitchen !== 'none';
  f.quick_search = true;
  f.own_brand_ebill = true;
  f.coupons = false;
  f.purchase_orders = f.stock_level !== 'none';
  f.aggregator_reconciliation = f.aggregator_inbox;
  f.accounting_export = a.q_gst === 'regular';
  f.upsell_suggestions = f.waiter_app || f.qr_self_order;
  f.campaigns = f.customers;
  f.attendance = false;
  f.checklists = false;
  f.own_website = false;
  f.menu_import = true;
  f.multi_outlet = false;
  // tax (§10)
  f.tax = deriveTax(a, f);
  return f;
}

/* ---------------- §10 tax (research — rates live in config, editable; confirm with a CA) ---------------- */
function deriveTax(a, f) {
  const T = BP.tax;
  const rooms = f.rooms_pms, maxTariff = Number(a.q_rooms?.maxTariff) || 0;
  const foodRate = rooms && maxTariff >= 7500 ? T.food.hotelRoomTariffGte7500.rate : T.food.standalone.rate;
  return {
    scheme: a.q_gst || 'regular',
    pricesInclusive: a.q_price_incl === true,
    food: a.q_gst === 'regular' ? { rate: foodRate, split: T.food.split, sac: T.food.sac } : null,
    room: rooms ? { slabs: T.room.slabs, sac: T.room.sac } : null,
    liquor: f.bar_liquor ? { rate: null, label: T.liquor.label } : null,
    serviceCharge: { enabled: a.q_service_charge === 'optional', defaultOn: false, pct: 0, label: T.serviceCharge.label },
    billTitle: a.q_gst === 'regular' ? 'Tax Invoice' : 'Bill of Supply',
  };
}
/** The single % the existing bill screen uses (food GST; 0 when composition / not registered) */
const billTaxPct = (tax) => (tax && tax.food ? tax.food.rate : 0);

/* ---------------- reading flags anywhere ---------------- */
let featCache = { key: '', f: null };
function features(st = S.settings) {
  const prof = profileOf(st || {});
  const key = JSON.stringify(prof.answers);
  if (featCache.key !== key) featCache = { key, f: deriveFeatures(prof.answers) };
  return featCache.f;
}
const feat = (name) => { const f = features(); return f ? f[name] : true; };

/** Screens for a role, built from flags (spec §7 "Role → screens") */
function viewsFor(role) {
  const r = ROLES[role]; if (!r) return [];
  const f = features();
  let v = r.views.filter((x) => {
    if (x === 'kitchen') return f.kitchen !== 'none';
    if (x === 'stock') return f.stock_level !== 'none';
    return true;
  });
  // Cashier home: fast counter billing when there is a counter, otherwise the bills / tables board
  if (role === 'cashier' && f.counter_pos && v.includes('orders')) v = ['orders', ...v.filter((x) => x !== 'orders')];
  if (!v.length) v = role === 'kitchen' ? ['menu'] : ['orders'];
  return v;
}
/** Login roles offered in Team & access / sign-up for this business */
function rolesOffered() { return rolesOfferedFor(profileOf().answers); }
function rolesOfferedFor(answers) {
  const f = deriveFeatures(answers);
  return ['manager', 'cashier', 'waiter', 'kitchen', 'owner'].filter((r) => (r === 'waiter' ? f.waiter_app || f.tables : r === 'kitchen' ? f.kitchen !== 'none' : true));
}

/* ---------------- "Your app will have" (plain words) ---------------- */
// [flag test, label, built yet?]
const FEATURE_WORDS = [
  [(f) => f.tables, 'Tables', true], [(f) => f.waiter_app, 'Waiter phones', true], [(f) => f.counter_pos, 'Fast counter billing', true],
  [(f) => f.takeaway, 'Parcels / takeaway', true], [(f) => f.kitchen !== 'none', 'Kitchen screen', true], [(f) => f.kot_print, 'Printed kitchen slips', false],
  [(f) => f.kitchen === 'multi', 'Separate kitchen counters', false], [(f) => f.reservations, 'Table bookings', true],
  [(f) => f.prepaid_flow, 'Pay-first orders', false], [(f) => f.handoff === 'token', 'Token numbers', false], [(f) => f.handoff === 'name', 'Call by name', false],
  [(f) => f.station_coupons, 'Counter slips (one per counter)', false], [(f) => f.token_display, 'Token TV screen', false],
  [(f) => f.running_bill, 'Running bills (pay at the end)', true], [(f) => f.qr_self_order, 'QR self-ordering', false], [(f) => f.phone_orders, 'Phone / WhatsApp orders', false],
  [(f) => f.variants_addons, 'Sizes & add-ons', false], [(f) => f.combos, 'Combos', false], [(f) => f.time_menus, 'Breakfast / lunch / dinner menus', false],
  [(f) => f.unlimited_meals, 'Meals / thali', false], [(f) => f.buffet_covers, 'Buffet per person', false], [(f) => f.weight_items, 'Sell by weight', false],
  [(f) => f.retail_mrp_items, 'Packaged items (MRP)', false], [(f) => f.preorders_advance, 'Pre-orders with advance', false], [(f) => f.bar_liquor, 'Bar & liquor', false],
  [(f) => f.own_delivery, 'Home delivery', false], [(f) => f.aggregator_inbox, 'Swiggy / Zomato orders', false], [(f) => f.multi_brand, 'Several brands', false],
  [(f) => f.credit_khata, 'Credit (khata)', false], [(f) => f.prepaid_wallet, 'Prepaid wallet', false], [(f) => f.subscriptions, 'Monthly meal plans', false],
  [(f) => f.loyalty, 'Rewards', false], [(f) => f.rooms_pms, 'Rooms & front desk', false], [(f) => f.events_banquet, 'Events & banquets', false],
  [(f) => f.stock_level === 'recipe', 'Recipe stock (auto-reduces)', true], [(f) => f.stock_level === 'purchases', 'Stock & purchases', true],
  [(f) => f.offline_mode, 'Works without internet', false], [() => true, 'Billing, expenses, vendors, staff & reports', true],
];
const featureList = (f) => FEATURE_WORDS.filter(([t]) => t(f)).map(([, label, built]) => ({ label, built }));
function previewHtml(f) {
  const list = featureList(f);
  return `<div class="preview"><p class="eyebrow">Your app will have</p><div class="chip-row">${list.map((x) => `<span class="chip sm ${x.built ? '' : 'soon'}" title="${x.built ? '' : 'Coming in a later update'}">${esc(x.label)}${x.built ? '' : ' · soon'}</span>`).join('')}</div></div>`;
}
/** Owner-facing difference between two flag sets (for Settings → Business setup) */
function flagDiff(a, b) {
  const la = new Map(featureList(a).map((x) => [x.label, x])), lb = new Map(featureList(b).map((x) => [x.label, x]));
  return { on: [...lb.keys()].filter((k) => !la.has(k)), off: [...la.keys()].filter((k) => !lb.has(k)) };
}

/* ---------------- validation (§13 patterns) ---------------- */
const GSTIN_RE = new RegExp(BP.questions.find((q) => q.id === 'q_gstin').pattern);
const FSSAI_RE = new RegExp(BP.questions.find((q) => q.id === 'q_fssai').pattern);
