// DANGER: erases the whole Firebase project data — every Firestore document and every
// login account — so the café can start completely fresh. Run only via the
// "Reset database" GitHub Action (manual, with a typed confirmation).
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const EXPECTED_PROJECT = 'cafe-journal-9ba5e';

(async () => {
  if (process.env.CONFIRM !== 'DELETE EVERYTHING') {
    console.error('::error::Confirmation text did not match "DELETE EVERYTHING". Nothing was deleted.');
    process.exit(1);
  }
  let sa;
  try { sa = JSON.parse(process.env.SA || ''); } catch (e) { console.error('::error::FIREBASE_SERVICE_ACCOUNT is not valid JSON.'); process.exit(1); }
  if (sa.project_id !== EXPECTED_PROJECT) { console.error(`::error::Key is for "${sa.project_id}", expected "${EXPECTED_PROJECT}".`); process.exit(1); }
  initializeApp({ credential: cert(sa), projectId: sa.project_id });

  // 1) Firestore: delete every top-level collection with everything inside it
  const db = getFirestore();
  const cols = await db.listCollections();
  for (const c of cols) {
    const before = (await c.count().get()).data().count;
    await db.recursiveDelete(c);
    console.log(`Deleted collection "${c.id}" (${before} top-level documents and everything under them)`);
  }
  if (!cols.length) console.log('Firestore was already empty.');

  // 2) Authentication: delete every login account (owners and staff)
  const auth = getAuth();
  let next, deleted = 0;
  do {
    const page = await auth.listUsers(1000, next);
    if (page.users.length) {
      const r = await auth.deleteUsers(page.users.map((u) => u.uid));
      deleted += r.successCount;
      r.errors.forEach((e) => console.log(`Could not delete an account: ${e.error.message}`));
    }
    next = page.pageToken;
  } while (next);
  console.log(`Deleted ${deleted} login account(s).`);

  // 3) Check
  const left = (await db.listCollections()).length;
  const users = (await auth.listUsers(1)).users.length;
  console.log(left === 0 && users === 0 ? 'RESET COMPLETE — database and accounts are empty.' : `Something is left: ${left} collection(s), ${users ? 'some' : 'no'} accounts.`);
  if (left || users) process.exit(1);
})().catch((e) => { console.error(`::error::Reset failed: ${e.message}`); process.exit(1); });
