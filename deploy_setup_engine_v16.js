// deploy_setup_engine_v16.js
// v16: the risk officer finally reads the morning plan.
//
// - Setup-engine fires now send the trader's morning-plan bias AND the AI
//   morning brief's bias to the overlay risk officer.
// - The overlay prompt is told to flag counter-plan fires explicitly
//   (conflictFactor "against morning plan"; CONFIRM requires strong support).
// - Each fire is mechanically stamped planConflict / briefConflict in
//   context_snapshot, so we can MEASURE whether counter-plan fires underperform
//   before changing any sizing or gating.
// - The Focus Panel fire card shows "⚠ AGAINST PLAN" / "⚠ AGAINST AI BRIEF".
//
// Detectors, gates, targets, and sizing are untouched. Measurement first.
//
// Run from the traidezone project folder:  node deploy_setup_engine_v16.js

const fs = require('fs');
const path = require('path');

const patches = [
  // ───────────────────────────── page.tsx ─────────────────────────────
  {
    file: 'src/app/cockpit/page.tsx',
    label: 'overlay context: add morning plan + brief bias',
    old: `              breadth:     breadthData?.summary ?? null,
              measuredSetupStats: measured ?`,
    new: `              breadth:     breadthData?.summary ?? null,
              morningPlanBias: morningPlan?.bias || null,
              briefBias:       morningBrief?.todaysBias || null,
              measuredSetupStats: measured ?`,
  },
  {
    file: 'src/app/cockpit/page.tsx',
    label: 'compute planConflict/briefConflict before logging',
    old: `      // 4. Log to trade_alerts — the treatment arm of the engine experiment.`,
    new: `      // v16: mechanical plan-conflict check — does this fire go against the
      // trader's morning plan bias or the AI brief's bias? Stamped for
      // measurement; no behavior change until the data says counter-plan
      // fires actually underperform.
      const _planBias = String(morningPlan?.bias || '').toUpperCase()
      const planBiasNorm = (_planBias === 'LONG' || _planBias === 'SHORT') ? _planBias : null
      const briefBiasNorm = (morningBrief?.todaysBias === 'LONG' || morningBrief?.todaysBias === 'SHORT') ? morningBrief.todaysBias : null
      const planConflict = !!(planBiasNorm && planBiasNorm !== fire.direction)
      const briefConflict = !!(briefBiasNorm && briefBiasNorm !== fire.direction)
      if (planConflict || briefConflict) console.log('[SetupEngine] fire goes AGAINST', planConflict ? \`plan (\${planBiasNorm})\` : '', briefConflict ? \`brief (\${briefBiasNorm})\` : '')

      // 4. Log to trade_alerts — the treatment arm of the engine experiment.`,
  },
  {
    file: 'src/app/cockpit/page.tsx',
    label: 'stamp conflicts into context_snapshot',
    old: `              measuredHitRate: measured?.hitRate ?? null, measuredN: measured?.n ?? 0,`,
    new: `              measuredHitRate: measured?.hitRate ?? null, measuredN: measured?.n ?? 0,
              planBias: planBiasNorm, briefBias: briefBiasNorm,
              planConflict: planConflict || undefined, briefConflict: briefConflict || undefined,`,
  },
  {
    file: 'src/app/cockpit/page.tsx',
    label: 'pass conflicts to Focus Panel fire card',
    old: `        measured, overlay, sizing, pending: false, firedAt: fire.firedAt, logFailed: !logOk,`,
    new: `        measured, overlay, sizing, planConflict, briefConflict, pending: false, firedAt: fire.firedAt, logFailed: !logOk,`,
  },

  // ─────────────────────── overlay risk officer ───────────────────────
  {
    file: 'src/app/api/triggers/overlay/route.ts',
    label: 'overlay prompt: show plan + brief bias in context',
    old: `- Breadth: \${context.breadth ?? 'unknown'}`,
    new: `- Breadth: \${context.breadth ?? 'unknown'}
- Trader's MORNING PLAN bias (set by the trader pre-open): \${context.morningPlanBias ?? 'not set'}
- AI morning brief bias (generated pre-open): \${context.briefBias ?? 'not set'}`,
  },
  {
    file: 'src/app/api/triggers/overlay/route.ts',
    label: 'overlay prompt: counter-plan rule',
    old: `- Be direct and specific. The trader is experienced — no hand-holding, just the read.`,
    new: `- Be direct and specific. The trader is experienced — no hand-holding, just the read.
- MORNING PLAN CHECK: if the trader's morning plan bias or the AI brief bias is set and this fire goes AGAINST it, you MUST say so explicitly in reasoning and include a conflictFactor labeled "against morning plan". A counter-plan fire needs strong contextual support (flow, breadth, and gamma all aligned with the fire) to earn CONFIRM — otherwise default to CAUTION.`,
  },

  // ──────────────────────────── FocusPanel ────────────────────────────
  {
    file: 'src/app/cockpit/FocusPanel.tsx',
    label: 'SetupFireDisplay type: conflict fields',
    old: `  firedAt: number
  logFailed?: boolean
}`,
    new: `  firedAt: number
  logFailed?: boolean
  planConflict?: boolean
  briefConflict?: boolean
}`,
  },
  {
    file: 'src/app/cockpit/FocusPanel.tsx',
    label: 'fire card: AGAINST PLAN tag',
    old: `              — {measuredLine} — <span style={{ color: verdict ? verdictColor : P.muted, fontWeight: 700 }}>{aiLine}</span>`,
    new: `              — {measuredLine} — <span style={{ color: verdict ? verdictColor : P.muted, fontWeight: 700 }}>{aiLine}</span>{(setupFire.planConflict || setupFire.briefConflict) && <span style={{ color: P.red, fontWeight: 700 }}>{' '}⚠ AGAINST {setupFire.planConflict ? 'PLAN' : 'AI BRIEF'}</span>}`,
  },
];

// ── verify every patch matches exactly once BEFORE writing anything ──
const contents = {};
let ok = true;
for (const p of patches) {
  const full = path.join(process.cwd(), p.file);
  if (!(p.file in contents)) {
    if (!fs.existsSync(full)) { console.error(`ERROR: ${p.file} not found — run from the traidezone folder`); process.exit(1); }
    contents[p.file] = fs.readFileSync(full, 'utf8');
  }
  const count = contents[p.file].split(p.old).length - 1;
  // already-applied marker: the first line of `new` that does NOT appear in `old`
  const marker = p.new.split('\n').find(l => l.trim() && !p.old.includes(l.trim()));
  if (marker && contents[p.file].includes(marker.trim())) {
    console.log(`SKIP (already applied): ${p.label}`);
    p.skip = true;
    continue;
  }
  if (count !== 1) {
    console.error(`ERROR: anchor for "${p.label}" matched ${count} times (need exactly 1). No files were changed.`);
    ok = false;
  }
}
if (!ok) process.exit(1);

for (const p of patches) {
  if (p.skip) continue;
  contents[p.file] = contents[p.file].replace(p.old, p.new);
  console.log(`APPLIED: ${p.label}`);
}
for (const [file, src] of Object.entries(contents)) {
  fs.writeFileSync(path.join(process.cwd(), file), src);
}

console.log('');
console.log('DONE — v16 applied to 3 files.');
console.log('Next:');
console.log('  git add -A');
console.log('  git commit -m "v16: risk officer reads the morning plan — counter-plan fires flagged + measured"');
console.log('  git push origin main');
console.log('  npx vercel --prod');
console.log('then promote the printed URL:  npx vercel promote <the real URL>');
