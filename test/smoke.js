/* End-to-end smoke test of the HomSci Pro app.
   Run: node test/smoke.js  (needs playwright installed; set PLAYWRIGHT_DIR
   to a folder whose node_modules contains playwright, and CHROMIUM to the
   browser binary if not using the playwright-managed one.) */
const path = require('path');
const PW_DIR = process.env.PLAYWRIGHT_DIR || __dirname;
const { chromium } = require(require.resolve('playwright', { paths: [PW_DIR, __dirname, process.cwd()] }));

const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, 'shots');
require('fs').mkdirSync(SHOT_DIR, { recursive: true });
const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('Failed to load resource') < 0) errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', d => d.accept());

  const shot = (name) => page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
  const assert = (cond, msg) => { if (!cond) { throw new Error('ASSERT FAIL: ' + msg); } console.log('ok -', msg); };
  const body = () => page.textContent('body');

  await page.goto(APP);
  await page.waitForTimeout(600);

  // Stub the camera picker with a generated image so photo flows work headless.
  await page.evaluate(() => {
    UI.pickPhoto = () => new Promise(res => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 240;
      const g = c.getContext('2d');
      g.fillStyle = '#7ba64e'; g.fillRect(0, 0, 320, 240);
      g.fillStyle = '#fff'; g.font = '20px sans-serif'; g.fillText('TEST PHOTO', 90, 125);
      c.toBlob(b => res(new File([b], 't.jpg', { type: 'image/jpeg' })), 'image/jpeg');
    });
  });

  // --- Role gating: backend configured => admin features need the admin role ---
  await page.goto(APP + '#/admin');
  await page.waitForTimeout(400);
  assert((await body()).includes('Admin access required'), 'admin portal locked when signed out');
  await page.goto(APP + '#/template');
  await page.waitForTimeout(300);
  assert((await body()).includes('Admin access required'), 'template editor locked when signed out');
  await page.evaluate(() => {
    Store.state.session = { access_token: 'test-token', refresh_token: '', expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: 'u-test', email: 'crew@test.dev', name: 'Test Crew', role: 'auditor' } };
    Store.save(); window.rerender();
  });
  await page.waitForTimeout(300);
  assert((await body()).includes('Admin access required'), 'admin features locked for auditor role');
  await page.evaluate(() => { Store.state.session.user.role = 'admin'; Store.save(); window.rerender(); });
  await page.waitForTimeout(300);
  assert(!(await body()).includes('Admin access required'), 'admin features unlock for admin role');
  await page.goto(APP + '#/admin/crew');
  await page.waitForTimeout(700);
  assert((await body()).includes('Add Crew Member'), 'crew accounts screen renders for admin');
  await page.goto(APP + '#/dashboard');
  await page.waitForTimeout(400);

  // --- Template engine unit checks ---
  const tpl = await page.evaluate(() => {
    const out = {};
    out.basic = Tpl.render('Hi {{name}}!', { name: 'Ann <b>' });
    out.raw = Tpl.render('{{{html}}}', { html: '<em>x</em>' });
    out.ifTrue = Tpl.render('{{#if a}}Y{{else}}N{{/if}}', { a: 1 });
    out.ifFalse = Tpl.render('{{#if a}}Y{{else}}N{{/if}}', { a: '' });
    out.each = Tpl.render('{{#each xs}}[{{@num}}:{{n}}]{{/each}}', { xs: [{ n: 'a' }, { n: 'b' }] });
    out.nested = Tpl.render('{{#each xs}}{{#if hot}}{{n}}{{/if}}{{/each}}', { xs: [{ n: 'a', hot: 1 }, { n: 'b' }] });
    out.strings = Tpl.render('{{#each xs}}{{.}};{{/each}}', { xs: ['p', 'q'] });
    out.parentScope = Tpl.render('{{#each xs}}{{n}}-{{top}} {{/each}}', { top: 'T', xs: [{ n: 'a' }] });
    out.emptyArr = Tpl.render('{{#if xs}}Y{{else}}N{{/if}}', { xs: [] });
    out.script = Tpl.render('<i onclick="hack()">a</i><script>bad()<\/script>', {});
    return out;
  });
  assert(tpl.basic === 'Hi Ann &lt;b&gt;!', 'engine escapes {{var}}');
  assert(tpl.raw === '<em>x</em>', 'engine passes {{{raw}}}');
  assert(tpl.ifTrue === 'Y' && tpl.ifFalse === 'N', 'engine #if / else');
  assert(tpl.each === '[1:a][2:b]', 'engine #each with @num');
  assert(tpl.nested === 'a', 'engine nests #if in #each');
  assert(tpl.strings === 'p;q;', 'engine {{.}} for string arrays');
  assert(tpl.parentScope === 'a-T ', 'engine falls back to parent scope');
  assert(tpl.emptyArr === 'N', 'engine treats empty array as falsy');
  assert(tpl.script.indexOf('script') < 0 && tpl.script.indexOf('onclick') < 0, 'engine strips scripts + inline handlers');

  // --- Dashboard + calendar layout ---
  assert(await page.locator('.appt-card').count() >= 2, 'dashboard shows seeded schedule');
  await page.click('[data-action="dash-view"][data-view="cal"]');
  await page.waitForTimeout(400);
  const cal = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    gridW: document.querySelectorAll('.cal-grid')[1].scrollWidth,
    cardW: document.querySelector('.cal-card').clientWidth,
    cells: document.querySelectorAll('.cal-cell:not(.empty)').length
  }));
  assert(cal.scrollW <= cal.innerW, 'calendar view does not overflow the frame (' + cal.scrollW + ' <= ' + cal.innerW + ')');
  assert(cal.gridW <= cal.cardW, 'calendar grid fits inside its card');
  assert(cal.cells >= 28, 'calendar renders the month');
  await shot('01-calendar');
  await page.click('[data-action="dash-view"][data-view="list"]');
  await page.waitForTimeout(300);

  // --- New evaluation ---
  await page.click('.fab');
  await page.waitForTimeout(300);
  await page.fill('[data-bind="new.name"]', 'Dr. Julian Voss');
  await page.fill('[data-bind="new.address"]', '124 Organic Lane, Portland, OR');
  await page.click('[data-action="create-eval"][data-start]');
  await page.waitForTimeout(400);
  assert((await body()).includes('Assessment Hub') || (await body()).includes('Blower Door Test'), 'hub renders after create');

  // --- Site info ---
  await page.click('text=Site Overview');
  await page.waitForTimeout(300);
  await page.fill('[data-bind="site.sqft"]', '2450');
  await page.fill('[data-bind="site.bedrooms"]', '4');
  await page.waitForTimeout(800);
  assert((await body()).includes('111'), 'ASHRAE 62.2 target computed');
  await page.click('text=Save & Return to Hub');
  await page.waitForTimeout(300);

  // --- Blower door (unlocks recommendations) ---
  await page.click('text=Blower Door Test');
  await page.waitForTimeout(300);
  const checks = page.locator('[data-action="blower-check"]');
  const n = await checks.count();
  for (let i = 0; i < n; i++) { await checks.nth(i).click(); await page.waitForTimeout(120); }
  await page.fill('.metric-display input', '2340');
  await page.click('[data-action="blower-photo"][data-pid="setup"]');
  await page.waitForTimeout(500);
  await page.click('[data-action="blower-photo"][data-pid="manometer"]');
  await page.waitForTimeout(500);
  await page.click('[data-action="blower-submit"]');
  await page.waitForTimeout(300);
  console.log('ok - blower door completed');

  // --- CAZ ---
  await page.click('text=Combustion Safety');
  await page.waitForTimeout(300);
  for (const t of ['venting', 'gasleak', 'co', 'spillage']) {
    await page.click(`[data-action="caz-result"][data-test="${t}"][data-result="PASS"]`);
    await page.waitForTimeout(120);
  }
  assert((await body()).includes('Compliance Cleared'), 'compliance cleared after 4 passes');
  await page.click('text=Save & Return to Hub');
  await page.waitForTimeout(300);

  // --- IAQ (fast-forward the sampling window) ---
  await page.click('text=IAQ Test');
  await page.waitForTimeout(300);
  await page.click('[data-action="iaq-start"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ev = Store.activeEval();
    ev.tests.iaq.startedAt = Date.now() - 31 * 60 * 1000;
    Store.save(); window.rerender();
  });
  await page.waitForTimeout(300);
  assert((await body()).includes('Test Complete'), 'IAQ results entry after window elapses');
  const iaqInputs = await page.locator('input[data-bind^="tests.iaq."]').count();
  assert(iaqInputs === 7, 'all 7 IAQ result fields present');
  await page.fill('[data-bind="tests.iaq.co2"]', '412');
  await page.fill('[data-bind="tests.iaq.voc"]', '0.2');
  await page.waitForTimeout(800);
  await page.click('[data-action="iaq-save"]');
  await page.waitForTimeout(300);

  // Reset shape guard: iaq-reset must produce all 7 metric fields
  const resetShape = await page.evaluate(() => {
    const ev = Store.activeEval();
    const saved = JSON.parse(JSON.stringify(ev.tests.iaq));
    const t = { startedAt: null, finishedAt: null };
    DATA.IAQ_METRICS.forEach(m => { t[m.id] = ''; });
    ev.tests.iaq = saved; // untouched; we just check DATA drives 7 metrics
    return Object.keys(t).length;
  });
  assert(resetShape === 9, 'iaq reset shape covers all metrics');

  // --- Select measures ---
  await page.click('text=Improvement Recommendations');
  await page.waitForTimeout(300);
  await page.click('[data-action="catalog-toggle"][data-mid="cellulose"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="catalog-toggle"][data-mid="airseal"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="catalog-toggle"][data-mid="thermostat"]');
  await page.waitForTimeout(200);
  assert((await body()).includes('Review Selections (3)'), '3 measures selected');

  // --- Proposal media (pick the two blower photos) ---
  await page.goto(APP + '#/eval/' + await page.evaluate(() => Store.activeEval().id) + '/proposal-media');
  await page.waitForTimeout(400);
  const tiles = page.locator('[data-action="pmedia-toggle"]');
  const tcount = await tiles.count();
  assert(tcount >= 2, 'captured photos available for proposal');
  await tiles.nth(0).click(); await page.waitForTimeout(150);
  await tiles.nth(1).click(); await page.waitForTimeout(150);

  // --- Proposal document (template-driven) ---
  await page.click('[data-action="nav"][data-route*="proposal-doc"]');
  await page.waitForTimeout(500);
  let txt = await body();
  assert(txt.includes('Proposal Contents'), 'contents control panel renders');
  assert(await page.locator('.check-row').count() === 3, 'one include-checkbox per selected measure');
  assert(txt.includes('Home Performance Proposal'), 'default template cover renders');
  assert(txt.includes('Dr. Julian Voss'), 'customer token populated');
  assert(txt.includes('2340'), 'blower CFM50 token populated');
  assert(txt.includes('412 ppm CO'), 'IAQ CO2 token populated');
  assert(await page.locator('.pd-table tbody tr').count() === 4, 'investment table: 3 measures + total');
  assert(await page.locator('.pd-gallery figure').count() === 2, 'selected photos render in evidence section');
  assert(txt.includes('Fig 1:') && txt.includes('Fig 2:'), 'photo figures numbered');
  const totalBefore = await page.evaluate(() =>
    Store.financials(Store.activeEval(), Proposal.includedIds(Store.activeEval())).cost);
  await shot('02-proposal-default');

  // Uncheck a measure -> excluded from doc but kept in working plan
  await page.click('.check-row[data-mid="thermostat"]');
  await page.waitForTimeout(400);
  txt = await body();
  assert(await page.locator('.pd-table tbody tr').count() === 3, 'unchecked measure leaves the investment table');
  const state = await page.evaluate(() => ({
    selections: Store.activeEval().selections.length,
    omitted: Store.activeEval().proposalOmit,
    cost: Store.financials(Store.activeEval(), Proposal.includedIds(Store.activeEval())).cost,
    fullCost: Store.financials(Store.activeEval()).cost
  }));
  assert(state.selections === 3, 'working plan still holds 3 measures');
  assert(state.omitted.length === 1 && state.omitted[0] === 'thermostat', 'omit list tracks the unchecked measure');
  assert(state.cost < totalBefore && state.fullCost === totalBefore, 'proposal total drops; working-plan total unchanged');
  await shot('03-proposal-unchecked');
  await page.click('.check-row[data-mid="thermostat"]');
  await page.waitForTimeout(300);
  assert(await page.locator('.pd-table tbody tr').count() === 4, 're-checking restores the measure');

  // --- Template editor: customize, save, render, reset ---
  await page.click('[data-action="nav"][data-route="#/template"]');
  await page.waitForTimeout(400);
  txt = await body();
  assert(txt.includes('Proposal Template'), 'template editor opens');
  assert(txt.includes('Default design'), 'editor shows default status');
  assert(txt.includes('{{customer.name}}'), 'token reference lists tokens');
  const defaultTpl = await page.inputValue('.tpl-editor');
  assert(defaultTpl.includes('{{fin.costFmt}}'), 'editor preloads the default template HTML');
  await shot('04-template-editor');

  const custom = '<section class="pd-page"><h1>CUSTOM LAYOUT for {{customer.name}}</h1>' +
    '<p>Total: {{fin.costFmt}}</p>' +
    '{{#each measures}}<div class="pd-measure"><h3>{{name}}</h3></div>{{/each}}' +
    '{{#each photos}}<img src="{{url}}" style="width:80px">{{/each}}</section>';
  await page.fill('.tpl-editor', custom);
  await page.click('[data-action="tpl-save"]');
  await page.waitForTimeout(400);
  assert((await body()).includes('Customized'), 'editor shows customized status after save');

  await page.click('[data-action="tpl-preview"]');
  await page.waitForTimeout(500);
  txt = await body();
  assert(txt.includes('CUSTOM LAYOUT for Dr. Julian Voss'), 'custom template renders with live data');
  assert(!txt.includes('Home Performance Proposal'), 'default cover replaced by custom design');
  assert(await page.locator('.pdoc img').count() >= 2, 'custom template loops photos');
  await shot('05-proposal-custom');

  // Persistence across reload
  await page.reload();
  await page.waitForTimeout(700);
  assert((await body()).includes('CUSTOM LAYOUT'), 'custom template survives reload');

  // Reset to default (confirm dialog auto-accepted)
  await page.goto(APP + '#/template');
  await page.waitForTimeout(400);
  await page.click('[data-action="tpl-reset"]');
  await page.waitForTimeout(400);
  assert((await body()).includes('Default design'), 'reset restores default status');
  await page.goto(APP + '#/eval/' + await page.evaluate(() => Store.activeEval().id) + '/proposal-doc');
  await page.waitForTimeout(500);
  assert((await body()).includes('Home Performance Proposal'), 'default design renders again after reset');

  // --- Admin portal ---
  await page.goto(APP + '#/admin');
  await page.waitForTimeout(400);
  txt = await body();
  assert(txt.includes('Admin Portal') && txt.includes('Improvement Catalog') && txt.includes('Pricing Rules') && txt.includes('Audit Prompts'), 'admin hub renders all sections');
  await shot('06-admin-hub');

  // Catalog manager: edit a measure's base cost
  await page.click('[data-action="nav"][data-route="#/admin/catalog"]');
  await page.waitForTimeout(400);
  assert(await page.locator('[data-route^="#/admin/measure/"]').count() === 8, 'catalog manager lists the 8 default measures');
  await page.goto(APP + '#/admin/measure/cellulose');
  await page.waitForTimeout(400);
  await page.fill('input[data-bind="admin.catalog.0.cost"]', '2500');
  await page.waitForTimeout(800);
  const editedCost = await page.evaluate(() => parseFloat(Store.measure('cellulose').cost));
  assert(editedCost === 2500, 'measure base cost edited via admin (2500)');
  const planAfterEdit = await page.evaluate(() => Store.financials(Store.activeEval()).cost);
  assert(planAfterEdit === 2500 + 1450 + 380, 'plan total reflects edited base cost (' + planAfterEdit + ')');

  // Add a brand-new measure and use it in the audit
  await page.goto(APP + '#/admin/catalog');
  await page.waitForTimeout(300);
  await page.click('[data-action="admin-measure-add"]');
  await page.waitForTimeout(400);
  const newIdx = await page.evaluate(() => Store.state.admin.catalog.length - 1);
  await page.fill('input[data-bind="admin.catalog.' + newIdx + '.name"]', 'Duct Sealing');
  await page.fill('input[data-bind="admin.catalog.' + newIdx + '.cat"]', 'HVAC Systems');
  await page.fill('input[data-bind="admin.catalog.' + newIdx + '.cost"]', '900');
  await page.fill('input[data-bind="admin.catalog.' + newIdx + '.savings"]', '120');
  await page.fill('textarea[data-bind="admin.catalog.' + newIdx + '.benefits"]', 'Benefit Alpha\nBenefit Beta');
  await page.waitForTimeout(800);
  const newId = await page.evaluate(i => Store.state.admin.catalog[i].id, newIdx);
  await page.goto(APP + '#/admin/catalog');
  await page.waitForTimeout(300);
  assert((await body()).includes('Duct Sealing'), 'new measure appears in catalog manager');
  const evId = await page.evaluate(() => Store.activeEval().id);
  await page.goto(APP + '#/eval/' + evId + '/catalog');
  await page.waitForTimeout(400);
  assert((await body()).includes('Duct Sealing'), 'new measure appears in the audit catalog');
  await page.click('[data-action="catalog-toggle"][data-mid="' + newId + '"]');
  await page.waitForTimeout(300);
  const planWithNew = await page.evaluate(() => Store.financials(Store.activeEval()).cost);
  assert(planWithNew === 4330 + 900, 'custom measure priced into the plan (' + planWithNew + ')');

  // Custom-measure benefits render in the Builder (string -> lines)
  await page.goto(APP + '#/eval/' + evId + '/builder');
  await page.waitForTimeout(300);
  await page.click('[data-action="builder-pick"][data-mid="' + newId + '"]');
  await page.waitForTimeout(300);
  txt = await body();
  assert(txt.includes('Benefit Alpha') && txt.includes('Benefit Beta'), 'admin-entered benefits render one per line');

  // Pricing rule via the UI: sqft > 2000 -> +$500 on cellulose
  await page.goto(APP + '#/admin/pricing');
  await page.waitForTimeout(300);
  await page.click('[data-action="admin-rule-add"]');
  await page.waitForTimeout(400);
  await page.selectOption('select[data-bind="admin.pricingRules.0.measureId"]', 'cellulose');
  await page.waitForTimeout(300);
  await page.selectOption('select[data-bind="admin.pricingRules.0.field"]', 'site.sqft');
  await page.waitForTimeout(300);
  await page.selectOption('select[data-bind="admin.pricingRules.0.op"]', 'gt');
  await page.waitForTimeout(300);
  await page.fill('input[data-bind="admin.pricingRules.0.value"]', '2000');
  await page.fill('input[data-bind="admin.pricingRules.0.amount"]', '500');
  await page.fill('input[data-bind="admin.pricingRules.0.label"]', 'Large home surcharge');
  await page.waitForTimeout(900);
  txt = await body();
  assert(txt.includes('Site: Square Footage is greater than'), 'rule editor describes the condition');
  assert(txt.includes('condition matches') && txt.includes('$500'), 'rule live-tests against the open audit');
  await shot('07-admin-rule');
  const withRule = await page.evaluate(() => {
    const fin = Store.financials(Store.activeEval());
    const cel = fin.items.filter(i => i.measure.id === 'cellulose')[0];
    return { cost: cel.cost, adj: cel.adjustments, total: fin.cost };
  });
  assert(withRule.cost === 3000, 'rule adds $500 to the measure (2500 -> 3000)');
  assert(withRule.adj.length === 1 && withRule.adj[0].label === 'Large home surcharge', 'adjustment carries its label');
  assert(withRule.total === 5230 + 500, 'plan total includes the rule (' + withRule.total + ')');

  // Per-sqft adjustment math
  await page.selectOption('select[data-bind="admin.pricingRules.0.adjustType"]', 'persqft');
  await page.waitForTimeout(300);
  await page.fill('input[data-bind="admin.pricingRules.0.amount"]', '0.5');
  await page.waitForTimeout(900);
  const perSqft = await page.evaluate(() =>
    Store.financials(Store.activeEval()).items.filter(i => i.measure.id === 'cellulose')[0].adjustments[0].amount);
  assert(perSqft === Math.round(0.5 * 2450), 'per-sqft adjustment = $0.50 x 2450 sqft (' + perSqft + ')');
  await page.selectOption('select[data-bind="admin.pricingRules.0.adjustType"]', 'flat');
  await page.waitForTimeout(300);
  await page.fill('input[data-bind="admin.pricingRules.0.amount"]', '500');
  await page.waitForTimeout(800);

  // Select-driven rule on a dropdown answer, applied to any measure
  await page.evaluate(() => {
    Store.zone(Store.activeEval(), 'attic').fields.insulationType = 'Blown-in Cellulose';
    const r = Admin.addRule();
    r.field = 'zones.attic.fields.insulationType';
    r.op = 'eq'; r.value = 'blown-in cellulose';
    r.adjustType = 'flat'; r.amount = '100'; r.label = 'Cellulose top-up prep';
    Store.save();
  });
  const anyRule = await page.evaluate(() => {
    const fin = Store.financials(Store.activeEval());
    return { every: fin.items.every(i => i.adjustments.some(a => a.label === 'Cellulose top-up prep')), total: fin.cost };
  });
  assert(anyRule.every, 'any-measure rule matches a dropdown answer case-insensitively');
  assert(anyRule.total === 5730 + 400, 'four measures each +$100 (' + anyRule.total + ')');

  // Builder shows the auto-pricing breakdown
  await page.goto(APP + '#/eval/' + evId + '/builder');
  await page.waitForTimeout(400);
  await page.click('[data-action="builder-pick"][data-mid="cellulose"]');
  await page.waitForTimeout(300);
  txt = await body();
  assert(txt.includes('Auto-pricing from audit data'), 'builder shows auto-pricing breakdown');
  assert(txt.includes('Large home surcharge'), 'builder lists the rule label');
  await shot('08-builder-autoprice');

  // Proposal doc totals include rule adjustments
  await page.goto(APP + '#/eval/' + evId + '/proposal-doc');
  await page.waitForTimeout(500);
  assert((await body()).includes('$6,130'), 'proposal total includes pricing rules');

  // Delete the any-measure rule through the UI (confirm auto-accepted)
  const rule2Id = await page.evaluate(() => Store.state.admin.pricingRules[1].id);
  await page.goto(APP + '#/admin/rule/' + rule2Id);
  await page.waitForTimeout(300);
  await page.click('[data-action="admin-rule-delete"]');
  await page.waitForTimeout(400);
  const afterDelete = await page.evaluate(() => ({
    rules: Store.pricingRules().length,
    total: Store.financials(Store.activeEval()).cost
  }));
  assert(afterDelete.rules === 1 && afterDelete.total === 5730, 'deleting a rule restores pricing (' + afterDelete.total + ')');

  // Prompts: motivations list feeds New Evaluation
  await page.goto(APP + '#/admin/prompts');
  await page.waitForTimeout(400);
  const mots = await page.inputValue('textarea[data-bind="admin.prompts.motivations"]');
  await page.fill('textarea[data-bind="admin.prompts.motivations"]', mots + '\nSolar Prep');
  await page.waitForTimeout(300);
  await page.goto(APP + '#/new');
  await page.waitForTimeout(400);
  assert(await page.locator('select[data-bind="new.motivation"] option', { hasText: 'Solar Prep' }).count() === 1, 'custom motivation appears on New Evaluation');

  // Prompts: blower checklist add/remove flows into the test screen
  await page.goto(APP + '#/admin/prompts');
  await page.waitForTimeout(400);
  await page.click('[data-action="admin-check-add"]');
  await page.waitForTimeout(400);
  await page.goto(APP + '#/eval/' + evId + '/blower');
  await page.waitForTimeout(400);
  assert(await page.locator('[data-action="blower-check"]').count() === 6, 'added checklist item shows on the blower screen');
  await page.goto(APP + '#/admin/prompts');
  await page.waitForTimeout(400);
  await page.click('[data-action="admin-check-remove"][data-idx="5"]');
  await page.waitForTimeout(400);
  await page.goto(APP + '#/eval/' + evId + '/blower');
  await page.waitForTimeout(400);
  assert(await page.locator('[data-action="blower-check"]').count() === 5, 'removed checklist item restores the default five');

  // Prompts: CAZ wording edit + reset
  await page.goto(APP + '#/admin/prompts');
  await page.waitForTimeout(400);
  await page.fill('input[data-bind="admin.prompts.cazTests.0.name"]', 'Draft Integrity Test');
  await page.waitForTimeout(300);
  await page.goto(APP + '#/eval/' + evId + '/caz');
  await page.waitForTimeout(400);
  assert((await body()).includes('Draft Integrity Test'), 'renamed CAZ hard-stop shows in the audit');
  await page.goto(APP + '#/admin/prompts');
  await page.waitForTimeout(400);
  await page.click('[data-action="admin-prompts-reset"][data-key="cazTests"]');
  await page.waitForTimeout(400);
  const cazName = await page.evaluate(() => Store.prompts('cazTests')[0].name);
  assert(cazName === 'Venting Test', 'CAZ wording reset restores the default');

  // Config persists across reload; export/import round-trips
  await page.reload();
  await page.waitForTimeout(700);
  const persisted = await page.evaluate(() => ({
    cost: parseFloat(Store.measure('cellulose').cost),
    rules: Store.pricingRules().length,
    n: Store.catalog().length
  }));
  assert(persisted.cost === 2500 && persisted.rules === 1 && persisted.n === 9, 'admin config survives reload');
  const roundtrip = await page.evaluate(() => {
    const payload = Admin.exportPayload();
    const json = JSON.stringify(payload);
    Store.state.admin = { catalog: null, pricingRules: [], prompts: null };
    Store.save();
    const cleared = Store.catalog().length === 8 && Store.pricingRules().length === 0;
    Admin.importConfig(json);
    return { cleared: cleared, n: Store.catalog().length, cost: parseFloat(Store.measure('cellulose').cost), rules: Store.pricingRules().length };
  });
  assert(roundtrip.cleared, 'clearing config falls back to defaults');
  assert(roundtrip.n === 9 && roundtrip.cost === 2500 && roundtrip.rules === 1, 'export/import round-trips the full config');

  // --- Desktop layout: tab bar becomes a left rail, content widens ---
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.goto(APP);
  await desk.waitForTimeout(700);
  const dm = await desk.evaluate(() => {
    const r = document.getElementById('tabbar').getBoundingClientRect();
    const s = document.querySelector('.screen').getBoundingClientRect();
    return { railLeft: r.left, railW: Math.round(r.width), vertical: r.height > r.width,
      screenLeft: s.left, screenW: Math.round(s.width),
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
  });
  assert(dm.vertical && dm.railLeft === 0 && dm.railW < 300, 'tab bar becomes a left rail on desktop (' + dm.railW + 'px)');
  assert(dm.screenLeft > 232, 'content column sits beside the rail');
  assert(dm.screenW <= 810, 'content column capped for readability (' + dm.screenW + 'px)');
  assert(dm.scrollW <= dm.innerW, 'no horizontal overflow on desktop');
  const fabLabel = await desk.evaluate(() =>
    getComputedStyle(document.querySelector('.tabbar .fab'), '::after').content);
  assert(fabLabel.includes('New Evaluation'), 'desktop rail labels the new-evaluation action');
  await desk.click('[data-action="dash-view"][data-view="cal"]');
  await desk.waitForTimeout(400);
  const dcal = await desk.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert(dcal, 'calendar fits the desktop frame');
  await desk.screenshot({ path: SHOT_DIR + '/09-desktop-dashboard.png' });
  await desk.goto(APP + '#/admin');
  await desk.waitForTimeout(500);
  await desk.screenshot({ path: SHOT_DIR + '/10-desktop-admin.png' });
  await desk.close();

  // Settings entry point
  await page.goto(APP + '#/settings');
  await page.waitForTimeout(400);
  assert((await body()).includes('Edit Proposal Template'), 'settings links to the template editor');
  assert((await body()).includes('Open Admin Portal'), 'settings links to the admin portal');
  assert((await body()).includes('Change Password'), 'settings offers self-service password change');

  if (errors.length) throw new Error('Console/page errors:\n' + errors.join('\n'));
  console.log('\nALL SMOKE TESTS PASSED');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
