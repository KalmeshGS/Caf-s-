// Publishes firestore.rules to Firebase with the Admin SDK (used by the GitHub Action).
// Reads the service-account key from the SA environment variable — never from a file in the repo.
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getSecurityRules } = require('firebase-admin/security-rules');

const EXPECTED_PROJECT = 'cafe-journal-9ba5e';

(async () => {
  let sa;
  try { sa = JSON.parse(process.env.SA || ''); } catch (e) {
    console.error('::error::FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the whole content of the downloaded key file.');
    process.exit(1);
  }
  if (sa.project_id !== EXPECTED_PROJECT) {
    console.error(`::error::The key belongs to project "${sa.project_id}", expected "${EXPECTED_PROJECT}".`);
    process.exit(1);
  }
  const source = fs.readFileSync(path.join(process.env.GITHUB_WORKSPACE || process.cwd(), 'firestore.rules'), 'utf8');
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
  const ruleset = await getSecurityRules().releaseFirestoreRulesetFromSource(source);
  console.log(`Published Firestore rules: ${ruleset.name} (created ${ruleset.createTime})`);
})().catch((e) => {
  console.error(`::error::Could not publish rules: ${e.message}`);
  process.exit(1);
});
