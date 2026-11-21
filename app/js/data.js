'use strict';
/* =========================================================
   Starter templates per business type + sample data generator
   ========================================================= */

const TEMPLATES = {
  cafe: {
    menu: [
      ['Hot coffee', 'Espresso', 120], ['Hot coffee', 'Cappuccino', 160], ['Hot coffee', 'Café Latte', 170],
      ['Cold', 'Cold Coffee', 180], ['Cold', 'Iced Tea', 140], ['Cold', 'Lemonade', 110],
      ['Tea', 'Masala Chai', 40], ['Tea', 'Green Tea', 80],
      ['Food', 'Paneer Sandwich', 180], ['Food', 'Veg Club Sandwich', 160], ['Food', 'Peri Peri Fries', 100], ['Food', 'Masala Maggi', 90],
      ['Dessert', 'Chocolate Brownie', 120], ['Dessert', 'Cheesecake', 190],
    ],
    stock: [['Milk', 'L', 30, 6, 1], ['Coffee beans', 'kg', 5, 1, 0.5], ['Bread', 'pcs', 60, 12, 1], ['Paneer', 'kg', 5, 1, 0.5], ['Cheese slices', 'pcs', 100, 20, 5], ['Tea leaves', 'kg', 3, 0.5, 0.5], ['Sugar', 'kg', 10, 2, 1], ['Potatoes', 'kg', 15, 3, 1]],
  },
  restaurant: {
    menu: [
      ['Starters', 'Paneer Tikka', 260], ['Starters', 'Veg Manchurian', 220], ['Starters', 'Crispy Corn', 200],
      ['Mains', 'Dal Makhani', 240], ['Mains', 'Paneer Butter Masala', 280], ['Mains', 'Veg Biryani', 250], ['Mains', 'Jeera Rice', 150],
      ['Breads', 'Butter Naan', 50], ['Breads', 'Tandoori Roti', 25],
      ['Drinks', 'Fresh Lime Soda', 90], ['Drinks', 'Sweet Lassi', 80],
      ['Dessert', 'Gulab Jamun', 70],
    ],
    stock: [['Paneer', 'kg', 10, 2, 0.5], ['Basmati rice', 'kg', 40, 8, 1], ['Flour', 'kg', 40, 8, 1], ['Onions', 'kg', 30, 6, 1], ['Tomatoes', 'kg', 20, 4, 1], ['Cooking oil', 'L', 30, 6, 1], ['Cream', 'L', 8, 2, 0.5], ['Gas', 'cylinders', 4, 1, 1]],
  },
  hotel: {
    menu: [
      ['Breakfast', 'Idli Sambar', 60], ['Breakfast', 'Masala Dosa', 90], ['Breakfast', 'Poha', 50], ['Breakfast', 'Aloo Paratha', 70],
      ['Meals', 'Veg Thali', 150], ['Meals', 'Special Thali', 220], ['Meals', 'Curd Rice', 90],
      ['Snacks', 'Samosa', 20], ['Snacks', 'Vada Pav', 25],
      ['Drinks', 'Chai', 20], ['Drinks', 'Filter Coffee', 30], ['Drinks', 'Buttermilk', 30],
    ],
    stock: [['Rice', 'kg', 50, 10, 1], ['Atta', 'kg', 40, 8, 1], ['Potatoes', 'kg', 30, 6, 1], ['Cooking oil', 'L', 30, 6, 1], ['Milk', 'L', 25, 5, 1], ['Dal', 'kg', 20, 4, 1], ['Onions', 'kg', 30, 6, 1], ['Gas', 'cylinders', 4, 1, 1]],
  },
  bakery: {
    menu: [
      ['Cakes', 'Chocolate Truffle (slice)', 120], ['Cakes', 'Red Velvet (slice)', 140], ['Cakes', 'Baked Cheesecake', 180],
      ['Pastries', 'Butter Croissant', 110], ['Pastries', 'Fruit Danish', 120], ['Pastries', 'Cinnamon Roll', 130],
      ['Breads', 'Garlic Bread', 90], ['Breads', 'Sourdough Loaf', 220],
      ['Cookies', 'Choco Chip Cookie', 50],
      ['Drinks', 'Cappuccino', 150], ['Drinks', 'Hot Chocolate', 160],
    ],
    stock: [['Flour', 'kg', 50, 10, 1], ['Butter', 'kg', 15, 3, 0.5], ['Eggs', 'dozen', 30, 6, 1], ['Sugar', 'kg', 25, 5, 1], ['Cocoa', 'kg', 5, 1, 0.5], ['Cream cheese', 'kg', 6, 1, 0.5], ['Milk', 'L', 20, 4, 1], ['Yeast', 'packs', 20, 4, 1]],
  },
  other: { menu: [['General', 'Item one', 100], ['General', 'Item two', 150]], stock: [] },
};

/** Round a scaled price to something a person would actually write on a menu */
function nice(v) {
  const step = v < 20 ? 0.5 : v < 200 ? 5 : v < 5000 ? 50 : 500;
  return Math.max(step, Math.round(v / step) * step);
}

function starterMenu(type, currency) {
  const scale = (CURRENCIES.find((c) => c.code === currency) || CURRENCIES[0]).scale;
  return (TEMPLATES[type] || TEMPLATES.other).menu.map(([cat, name, price]) => ({ id: uid('m'), cat, name, price: nice(price * scale), available: true }));
}
function starterStock(type) {
  return (TEMPLATES[type] || TEMPLATES.other).stock.map(([name, unit, max, low, step]) => ({ id: uid('s'), name, unit, qty: max, max, low, step }));
}

/** Fill the store with ~5 weeks of realistic activity so every screen has something to show */
function makeDemo(state) {
  const st = state.settings;
  const scale = (CURRENCIES.find((c) => c.code === st.currency) || CURRENCIES[0]).scale;
  const R = (a, b) => a + Math.random() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const amt = (v) => nice(v * scale);

  state.menu = starterMenu(st.type, st.currency);
  const snap = (v, step) => round2(Math.round(v / step) * step);
  state.stock = starterStock(st.type).map((s, i) => ({ ...s, qty: i % 3 === 1 ? snap(s.low * 0.8, s.step) : snap(s.max * R(0.35, 0.9), s.step) }));
  state.orders = []; state.kots = []; state.expenses = []; state.vendorTx = []; state.attendance = {}; state.journal = {};

  const tables = Array.from({ length: Number(st.tables) || 8 }, (_, i) => `T${i + 1}`);
  const weights = { 8: 1, 9: 3, 10: 3, 11: 4, 12: 6, 13: 8, 14: 6, 15: 4, 16: 5, 17: 7, 18: 9, 19: 10, 20: 8, 21: 5, 22: 2 };
  const hours = Object.entries(weights).flatMap(([h, w]) => Array(w).fill(+h));
  const popular = state.menu.map((m, i) => ({ m, w: i % 4 === 3 ? 6 : i % 3 === 0 ? 3 : 1 })).flatMap(({ m, w }) => Array(w).fill(m));
  const now = new Date();

  for (let back = 34; back >= 0; back--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const count = RI(weekend ? 34 : 22, weekend ? 52 : 38);
    let no = 0;
    for (let i = 0; i < count; i++) {
      const h = pick(hours);
      const ts = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, RI(0, 59)).getTime();
      if (ts > now.getTime() - 20 * 60000) continue;
      const lines = {};
      for (let k = 0; k < RI(1, 4); k++) {
        const m = pick(popular);
        lines[m.id] = lines[m.id] || { id: uid('l'), menuId: m.id, name: m.name, price: m.price, qty: 0, sent: 0 };
        lines[m.id].qty += RI(1, 2); lines[m.id].sent = lines[m.id].qty;
      }
      const o = { id: uid('o'), no: ++no, table: Math.random() < 0.2 ? 'Takeaway' : pick(tables), items: Object.values(lines), status: 'paid', createdAt: ts - RI(15, 50) * 60000, by: 'waiter' };
      const r = Math.random();
      Object.assign(o, orderTotalsFor(o, st), { method: r < 0.58 ? 'upi' : r < 0.92 ? 'cash' : 'card', paidAt: ts });
      state.orders.push(o);
    }
    if (back === 0) state.seq = { day: dayKey(day), n: no };
  }

  // A few live orders right now, so Orders/Kitchen/Billing are not empty
  const liveTables = tables.slice(0, Math.min(3, tables.length));
  const stages = ['new', 'cooking', 'ready'];
  liveTables.forEach((t, i) => {
    const items = [];
    for (let k = 0; k < 2 + (i % 2); k++) {
      const m = state.menu[(i * 3 + k * 2) % state.menu.length];
      if (!items.find((x) => x.menuId === m.id)) items.push({ id: uid('l'), menuId: m.id, name: m.name, price: m.price, qty: 1 + (k === 0 ? 1 : 0), sent: 0 });
    }
    items.forEach((l) => { l.sent = l.qty; });
    state.seq.n += 1;
    const createdAt = Date.now() - (9 - i * 3) * 60000;
    const o = { id: uid('o'), no: state.seq.n, table: t, items, status: 'open', createdAt, by: 'waiter' };
    state.orders.push(o);
    state.kots.push({ id: uid('k'), orderId: o.id, table: t, no: o.no, items: items.map((l) => ({ name: l.name, qty: l.qty })), status: stages[2 - i] || 'new', createdAt, updatedAt: createdAt });
  });

  // Staff & attendance
  const roles = { cafe: ['Barista', 'Cashier', 'Waiter', 'Helper'], restaurant: ['Chef', 'Cashier', 'Waiter', 'Helper'], hotel: ['Cook', 'Cashier', 'Waiter', 'Helper'], bakery: ['Baker', 'Cashier', 'Counter', 'Helper'], other: ['Lead', 'Cashier', 'Staff', 'Helper'] }[st.type] || ['Chef', 'Cashier', 'Waiter', 'Helper'];
  state.staff = [
    { id: uid('p'), name: 'Ravi', role: roles[0], shift: '09:00 – 18:00', salary: amt(18000), phone: '' },
    { id: uid('p'), name: 'Pooja', role: roles[1], shift: '10:00 – 19:00', salary: amt(14000), phone: '' },
    { id: uid('p'), name: 'Aman', role: roles[2], shift: '12:00 – 21:00', salary: amt(12000), phone: '' },
    { id: uid('p'), name: 'Sunil', role: roles[3], shift: '09:00 – 18:00', salary: amt(10000), phone: '' },
  ];
  for (let back = 34; back >= 0; back--) {
    const dk = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
    state.attendance[dk] = {};
    state.staff.forEach((p, i) => {
      const r = Math.random();
      state.attendance[dk][p.id] = back === 0 ? ['present', 'present', 'late', 'leave'][i] : r < 0.86 ? 'present' : r < 0.94 ? 'late' : 'leave';
    });
  }

  // Vendors
  state.vendors = [
    { id: uid('v'), name: 'Sharma Dairy', supplies: 'Milk, paneer', phone: '', due: 0 },
    { id: uid('v'), name: 'Fresh Bakery', supplies: 'Bread, buns', phone: '', due: 0 },
    { id: uid('v'), name: 'Green Valley Veggies', supplies: 'Vegetables', phone: '', due: 0 },
    { id: uid('v'), name: 'Bean Roasters', supplies: st.type === 'cafe' ? 'Coffee beans' : 'Dry goods', phone: '', due: 0 },
  ];

  // Expenses over the period
  const exp = (date, cat, title, amount, extra = {}) => state.expenses.push({ id: uid('e'), date, cat, title, amount: amt(amount), ...extra });
  const months = new Set();
  for (let back = 34; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const dk = dayKey(d);
    if (d.getDate() === 1 || back === 34) months.add(monthKey(d));
    if (d.getDate() === 1) {
      exp(dk, 'Rent', 'Shop rent', 45000);
      state.staff.forEach((p) => state.expenses.push({ id: uid('e'), date: dk, cat: 'Salary', title: `Salary · ${p.name}`, amount: p.salary, staffId: p.id, forMonth: shiftMonth(monthKey(d), -1) }));
    }
    if (d.getDate() === 5) exp(dk, 'Utilities', 'Electricity bill', 6200);
    if (back % 9 === 2) exp(dk, 'Utilities', 'Gas cylinder', 1100);
    if (back % 3 === 0) exp(dk, 'Kitchen', 'Sabzi mandi', R(500, 1200));
    if (back % 12 === 6) exp(dk, 'Maintenance', 'Repairs & cleaning', R(600, 2000));
    if (back % 4 === 1) {
      const v = state.vendors[back % state.vendors.length];
      const a = amt(R(1800, 7000));
      state.expenses.push({ id: uid('e'), date: dk, cat: 'Vendor', title: `${v.name} bill`, amount: a, vendorId: v.id });
      state.vendorTx.push({ id: uid('t'), vendorId: v.id, type: 'bill', amount: a, date: dk, note: 'Supplies' });
      v.due += a;
    }
  }
  // Pay off most vendor dues, leave a few outstanding (like real life)
  state.vendors.forEach((v, i) => {
    const keep = i === 3 ? 0 : i === 0 ? amt(6800) : i === 1 ? amt(2400) : 0;
    const pay = round2(Math.max(0, v.due - keep));
    if (pay > 0) state.vendorTx.push({ id: uid('t'), vendorId: v.id, type: 'payment', amount: pay, date: shiftDay(dayKey(), -2), note: 'Cleared old bills', method: 'upi' });
    v.due = round2(v.due - pay);
  });

  // A couple of journal notes
  state.journal[shiftDay(dayKey(), -1)] = { note: 'Busy evening — ran out of cold coffee glasses by 8 PM. Order more tomorrow.', tags: ['Busy'], closing: null };
  state.journal[shiftDay(dayKey(), -3)] = { note: 'Rain all afternoon, footfall was low. Delivery orders picked up after 6.', tags: ['Slow', 'Rain'], closing: null };
  return state;
}

function orderTotalsFor(o, st) {
  const sub = sum(o.items, (l) => l.qty * l.price);
  const tax = round2((sub * (Number(st.tax) || 0)) / 100);
  return { subtotal: sub, discount: 0, tax, total: round2(sub + tax) };
}
