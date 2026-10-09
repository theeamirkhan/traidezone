// deploy_middleware_fix.js
// Adds the Muse alert feed (and reference-price proxy) to the Clerk middleware
// public-route list so anonymous callers with the feed key can reach them.
// Run from the traidezone project folder:  node deploy_middleware_fix.js

const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'middleware.ts');
if (!fs.existsSync(file)) {
  console.error('ERROR: src/middleware.ts not found. Run this from C:\\Users\\theea\\traidezone');
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

// Routes that must be publicly reachable (they carry their own auth):
// - /api/alerts/high-prob  -> ALERT_FEED_KEY, fails closed 503 without env
// - /api/reference-price   -> read-only Yahoo Finance proxy used by the app
const wanted = [
  "'/api/alerts/high-prob(.*)'",
  "'/api/reference-price(.*)'",
];

const m = src.match(/createRouteMatcher\(\s*\[([\s\S]*?)\]\s*\)/);
if (!m) {
  console.error('ERROR: could not find createRouteMatcher([...]) in src/middleware.ts');
  console.error('Paste the contents of src/middleware.ts into the chat and I will patch it by hand.');
  process.exit(1);
}

let list = m[1];
const added = [];
for (const route of wanted) {
  const bare = route.replace(/'/g, '');
  if (!list.includes(bare)) {
    // insert before the end of the array, keeping indentation tidy
    list = list.replace(/\s*$/, '') + `\n  ${route},\n`;
    added.push(bare);
  }
}

if (added.length === 0) {
  console.log('Nothing to do — both routes are already in the public list.');
  process.exit(0);
}

src = src.replace(m[0], `createRouteMatcher([${list}])`);
fs.writeFileSync(file, src);

console.log('DONE. Added to public routes: ' + added.join(', '));
console.log('');
console.log('Verify with:  findstr /n "high-prob" src\\middleware.ts');
console.log('Then: git add -A && commit && push && npx vercel --prod && promote the printed URL.');
