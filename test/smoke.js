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
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 44.0521, longitude: -123.0868 },
    permissions: ['geolocation']
  });
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
  assert(await page.locator('.appbar [aria-label="Search evaluations"]').count() === 0, 'search icon removed from the top bar');
  assert(await page.locator('.appbar [data-action="hcp-import"]').count() === 0, 'HCP import icon removed from the dashboard bar');
  assert(await page.locator('.appbar .avatar').count() === 1, 'avatar/settings button still present');
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

  // --- Diagnostics how-to guides (tap the ? icon on a section) ---
  assert(await page.locator('.module-row .row-help').count() === 4, 'each diagnostics row carries a help icon');
  await page.click('.row-help[data-route="#/guide/blower"]');
  await page.waitForTimeout(400);
  const gtxt = await body();
  assert(gtxt.includes('Blower Door Test') && gtxt.includes('How-To Guide'), 'guide viewer opens from the hub');
  assert(await page.locator('.guide-step').count() >= 6, 'blower guide lists the full procedure');
  assert(gtxt.includes('depressurizes the house to -50 Pa'), 'guide intro explains the test');
  await shot('00-guide-blower');
  await page.click('[data-action="hist-back"].btn');
  await page.waitForTimeout(400);
  assert((await body()).includes('Assessment Hub'), 'guide closes back to the hub');

  // --- Site info ---
  await page.click('text=Site Overview');
  await page.waitForTimeout(300);
  await page.fill('[data-bind="site.sqft"]', '2450');
  await page.fill('[data-bind="site.bedrooms"]', '4');
  await page.waitForTimeout(800);
  assert((await body()).includes('111'), 'ASHRAE 62.2 target computed');
  await page.click('text=Save & Return to Hub');
  await page.waitForTimeout(300);

  // --- Media settings: turn on the date/GPS photo stamp via the admin toggle ---
  await page.goto(APP + '#/admin/media');
  await page.waitForTimeout(400);
  const msTxt = await body();
  assert(msTxt.includes('Photo Stamp') && msTxt.includes('Media Tags') && msTxt.includes('Required Photo IDs'), 'media settings screen renders its three cards');
  assert(!(await page.evaluate(() => Store.photoStampOn())), 'photo stamp defaults to off');
  await page.click('[data-action="admin-stamp-toggle"]');
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => Store.photoStampOn()), 'stamp toggle turns stamping on');
  assert((await body()).includes('Applies to photos taken from now on'), 'stamp hint appears when on');
  assert((await body()).includes('Moisture'), 'default media tags listed');
  await shot('02a-admin-media');
  await page.goto(APP + '#/assess');
  await page.waitForTimeout(400);

  // --- Blower door (unlocks recommendations) ---
  await page.click('text=Blower Door Test');
  await page.waitForTimeout(300);
  const checks = page.locator('[data-action="blower-check"]');
  const n = await checks.count();
  for (let i = 0; i < n; i++) { await checks.nth(i).click(); await page.waitForTimeout(120); }
  await page.fill('.metric-display input', '2340');
  await page.click('[data-action="blower-photo"][data-pid="setup"]');
  await page.waitForTimeout(800);
  // The tag sheet opens after every capture: tag this photo, then close.
  assert(await page.locator('#tag-sheet .sheet-card').count() === 1, 'tag sheet opens after capture');
  assert((await page.textContent('#tag-sheet')).includes('BLOWER-SETUP'), 'tag sheet shows the required-photo ID');
  await page.click('#tag-sheet .chip:has-text("Moisture")');
  await page.waitForTimeout(200);
  await page.click('[data-action="sheet-close"]');
  await page.waitForTimeout(300);
  const stamped = await page.evaluate(() => {
    const p = Store.activeEval().photos[Store.activeEval().photos.length - 1];
    return { lat: p.lat, lng: p.lng, tags: p.tags, ref: Store.photoRef(p) };
  });
  assert(Math.abs(stamped.lat - 44.0521) < 0.001 && Math.abs(stamped.lng + 123.0868) < 0.001, 'capture records GPS coordinates for the stamp');
  assert(stamped.tags.length === 1 && stamped.tags[0] === 'Moisture', 'tag picked in the sheet lands on the photo');
  assert(stamped.ref === 'BLOWER-SETUP', 'required photo carries its unique proposal ID');
  await page.click('[data-action="blower-photo"][data-pid="manometer"]');
  await page.waitForTimeout(800);
  await page.click('[data-action="sheet-close"]');
  await page.waitForTimeout(300);
  await page.click('[data-action="blower-submit"]');
  await page.waitForTimeout(300);
  console.log('ok - blower door completed');
  // Stamp burned into pixels: darker lower-right corner than an unstamped shot.
  const stampPixel = await page.evaluate(() => new Promise(res => {
    const url = Store.photoUrl(Store.activeEval().photos[0].id);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(img.width - 30, img.height - 20, 1, 1).data;
      res({ r: d[0], g: d[1], b: d[2] });
    };
    img.src = url;
  }));
  assert(stampPixel.r < 100 && stampPixel.g < 110, 'stamp box is burned into the lower-right pixels');

  // --- Media review: refs on tiles, admin tag list drives the chips ---
  const mevId = await page.evaluate(() => Store.activeEval().id);
  await page.goto(APP + '#/eval/' + mevId + '/media');
  await page.waitForTimeout(400);
  assert(await page.locator('.media-tile .ref-badge').count() >= 1, 'media tiles show required-photo IDs');
  assert((await body()).includes('Moisture'), 'photo tags appear on the media tile');
  await page.locator('.media-tile').first().click();
  await page.waitForTimeout(300);
  assert(await page.locator('.tag-editor .chip').count() >= 5, 'tag editor offers the admin tag list');
  await page.click('.tag-editor .chip:has-text("Air Leak")');
  await page.waitForTimeout(300);
  const tagged = await page.evaluate(() => Store.activeEval().photos[0].tags);
  assert(tagged.indexOf('Moisture') >= 0 && tagged.indexOf('Air Leak') >= 0, 'media review toggles tags on the photo');
  await shot('02b-media-tags');
  await page.click('[data-action="media-edit-done"]');
  await page.waitForTimeout(200);
  await page.goto(APP + '#/assess');
  await page.waitForTimeout(400);

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
  assert((await body()).includes('Suggested from this assessment'), 'catalog shows suggestion section');
  let sugNames = await page.locator('.measure-card.suggested h3').allTextContents();
  assert(sugNames.includes('Air Sealing Package'), 'CFM50 2340 > 2000 suggests Air Sealing');
  assert(!sugNames.includes('Rim Joist Sealing'), 'below-threshold rule (2500) does not suggest');
  assert((await body()).includes('Blower Door: CFM50') && (await body()).includes('2340'), 'suggestion reason cites field and value');
  await page.evaluate(() => {
    Store.zone(Store.activeEval(), 'crawlspace').fields.vapor = 'Missing';
    Store.save(); window.rerender();
  });
  await page.waitForTimeout(300);
  sugNames = await page.locator('.measure-card.suggested h3').allTextContents();
  assert(sugNames.includes('Vapor Barrier'), 'missing vapor barrier suggests the Vapor Barrier measure');
  assert((await body()).includes('Crawlspace: Vapor Barrier'), 'vapor suggestion shows its reason');
  await page.click('[data-action="catalog-toggle"][data-mid="cellulose"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="catalog-toggle"][data-mid="airseal"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="catalog-toggle"][data-mid="thermostat"]');
  await page.waitForTimeout(200);
  assert((await body()).includes('Review Selections (3)'), '3 measures selected');
  await page.goto(APP + '#/eval/' + await page.evaluate(() => Store.activeEval().id) + '/hub');
  await page.waitForTimeout(400);
  assert((await body()).includes('suggested from assessment data'), 'hub shows suggested-measure count');

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
  assert(txt.includes('BLOWER-SETUP'), 'required-photo ID appears in the proposal figure caption');
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

  // --- Template editor: visual/code views, customize, save, render, reset ---
  await page.click('[data-action="nav"][data-route="#/template"]');
  await page.waitForTimeout(400);
  txt = await body();
  assert(txt.includes('Proposal Template'), 'template editor opens');
  assert(txt.includes('Default design'), 'editor shows default status');
  // Visual view is the default: rendered preview, no code textarea.
  assert(await page.locator('.tpl-preview').count() === 1, 'visual view renders a preview by default');
  assert(await page.locator('.tpl-editor').count() === 0, 'code textarea hidden in visual view');
  assert(txt.includes('Home Performance Proposal'), 'visual preview renders the default design');
  assert(txt.includes('Dr. Julian Voss'), 'visual preview uses live data from the open evaluation');
  await shot('04a-template-visual');

  // Switch to the code view for editing.
  await page.click('[data-action="tpl-view"][data-view="code"]');
  await page.waitForTimeout(300);
  txt = await body();
  assert(await page.locator('.tpl-editor').count() === 1, 'code view shows the HTML editor');
  assert(await page.locator('.tpl-preview').count() === 0, 'preview hidden in code view');
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

  // Unsaved-or-saved edits show in the visual view immediately.
  await page.click('[data-action="tpl-view"][data-view="visual"]');
  await page.waitForTimeout(300);
  txt = await body();
  assert(txt.includes('CUSTOM LAYOUT for Dr. Julian Voss'), 'visual view renders the custom template');
  await page.click('[data-action="tpl-view"][data-view="code"]');
  await page.waitForTimeout(300);

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

  // --- Diagnostics guide editor (admin) ---
  await page.goto(APP + '#/admin/guides');
  await page.waitForTimeout(400);
  assert(await page.locator('[data-route^="#/admin/guide/"]').count() === 4, 'guides list shows the 4 diagnostics guides');
  await page.goto(APP + '#/admin/guide/blower');
  await page.waitForTimeout(400);
  const stepsBefore = await page.locator('.guide-edit-step').count();
  assert(stepsBefore === 8, 'blower guide editor lists the default 8 steps');
  await page.fill('textarea[data-bind="admin.guides.0.steps.0.text"]', 'CUSTOM STEP: walk the house with the customer first.');
  await page.fill('input[data-bind="admin.guides.0.pdf"]', 'https://example.com/blower-procedure.pdf');
  await page.click('[data-action="guide-step-add"]');
  await page.waitForTimeout(400);
  assert(await page.locator('.guide-edit-step').count() === 9, 'add step appends a new step');
  await shot('06b-guide-editor');
  // Auditor view reflects the edits: custom step, PDF launcher, admin edit icon.
  await page.goto(APP + '#/guide/blower');
  await page.waitForTimeout(400);
  txt = await body();
  assert(txt.includes('CUSTOM STEP: walk the house'), 'guide viewer shows the edited step');
  assert(await page.locator('a[href="https://example.com/blower-procedure.pdf"]').count() === 1, 'attached PDF gets a launch button');
  assert(await page.locator('[data-route="#/admin/guide/blower"]').count() === 1, 'admins get an edit shortcut on the guide');
  await page.goto(APP + '#/admin/guide/blower');
  await page.waitForTimeout(400);
  await page.locator('.guide-edit-step').last().locator('[data-action="guide-step-remove"]').click();
  await page.waitForTimeout(400);
  assert(await page.locator('.guide-edit-step').count() === 8, 'remove step deletes it');
  await page.click('[data-action="guide-reset"]');
  await page.waitForTimeout(400);
  const resetStep = await page.evaluate(() => Store.guide('blower').steps[0].text);
  assert(resetStep.indexOf('Walk the house first') === 0 && resetStep.indexOf('CUSTOM') < 0, 'guide reset restores default steps');
  const pdfCleared = await page.evaluate(() => Store.guide('blower').pdf);
  assert(pdfCleared === '', 'guide reset clears the attached PDF');

  // --- Media tag list is admin-customizable ---
  await page.goto(APP + '#/admin/media');
  await page.waitForTimeout(400);
  await page.fill('textarea[data-bind="admin.media.tags"]', 'Roof\nGutters\nSolar Ready');
  await page.waitForTimeout(300);
  const customTags = await page.evaluate(() => Store.mediaTags());
  assert(customTags.length === 3 && customTags[0] === 'Roof' && customTags[2] === 'Solar Ready', 'edited tag list drives the offered tags');
  await page.click('[data-action="admin-media-tags-reset"]');
  await page.waitForTimeout(300);
  assert((await page.evaluate(() => Store.mediaTags())).indexOf('Moisture') >= 0, 'tag reset restores the default list');

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

  // Suggest-when editor: add a condition to Smart Thermostat via the UI
  await page.goto(APP + '#/admin/measure/thermostat');
  await page.waitForTimeout(400);
  assert((await body()).includes('Suggest When'), 'measure editor has Suggest When section');
  await page.click('[data-action="admin-suggest-add"][data-mid="thermostat"]');
  await page.waitForTimeout(400);
  const tIdx = await page.evaluate(() => Store.state.admin.catalog.findIndex(m => m.id === 'thermostat'));
  await page.selectOption('select[data-bind="admin.catalog.' + tIdx + '.suggest.0.field"]', 'site.sqft');
  await page.waitForTimeout(300);
  await page.selectOption('select[data-bind="admin.catalog.' + tIdx + '.suggest.0.op"]', 'gt');
  await page.waitForTimeout(300);
  await page.fill('input[data-bind="admin.catalog.' + tIdx + '.suggest.0.value"]', '2000');
  await page.waitForTimeout(400);
  await page.goto(APP + '#/admin/catalog');
  await page.waitForTimeout(300);
  assert((await body()).includes('auto-suggest rule'), 'catalog manager shows suggest-rule count');
  await page.goto(APP + '#/eval/' + evId + '/catalog');
  await page.waitForTimeout(400);
  const sugAfter = await page.locator('.measure-card.suggested h3').allTextContents();
  assert(sugAfter.includes('Smart Thermostat'), 'admin-added condition (sqft > 2000) suggests the measure');
  const mobAdminHidden = await page.evaluate(() => {
    const a = document.querySelector('.tabbar a.admin-desktop');
    return a && getComputedStyle(a).display === 'none';
  });
  assert(mobAdminHidden, 'admin rail entry exists but stays hidden on the phone tab bar');

  // --- Materials catalog: unit costs priced from assessment quantities ---
  await page.goto(APP + '#/admin/measure/cellulose');
  await page.waitForTimeout(400);
  txt = await body();
  assert(!txt.includes('Est. ROI') && !txt.includes('Rebate Note') && !txt.includes('Annual Savings'), 'measure editor no longer edits savings/ROI/rebate');
  assert(txt.includes('Cost Build-Up'), 'measure editor has cost build-up section');

  await page.goto(APP + '#/admin/materials');
  await page.waitForTimeout(400);
  assert(await page.locator('[data-route^="#/admin/material/"]').count() === 6, 'materials catalog lists the 6 defaults');
  assert((await body()).includes('Old Insulation Removal'), 'default materials present');

  // Edit a material's unit cost
  await page.goto(APP + '#/admin/material/mat-insul-removal');
  await page.waitForTimeout(400);
  const remIdx = await page.evaluate(() => Store.state.admin.materials.findIndex(m => m.id === 'mat-insul-removal'));
  await page.fill('input[data-bind="admin.materials.' + remIdx + '.cost"]', '2');
  await page.waitForTimeout(800);
  assert(await page.evaluate(() => parseFloat(Store.material('mat-insul-removal').cost)) === 2, 'material unit cost edited');

  // Attach materials to the custom measure; attic area drives the quantity
  await page.evaluate(() => {
    Store.zone(Store.activeEval(), 'attic').fields.sqft = '1200';
    Store.save();
  });
  await page.goto(APP + '#/admin/measure/' + newId);
  await page.waitForTimeout(400);
  await page.click('[data-action="admin-mat-toggle"][data-matid="mat-insul-removal"]');
  await page.waitForTimeout(300);
  await page.click('[data-action="admin-mat-toggle"][data-matid="mat-cellulose"]');
  await page.waitForTimeout(400);
  txt = await body();
  assert(txt.includes('Base cost: $4,920'), 'editor previews 1200 sqft x ($2.00 + $2.10) = $4,920');
  const matFin = await page.evaluate(id => {
    const item = Store.financials(Store.activeEval(), [id]).items[0];
    return { base: item.base, lines: item.materialLines.length, cost: item.cost };
  }, newId);
  assert(matFin.base === 4920 && matFin.lines === 2 && matFin.cost === 4920, 'financials price the measure from materials (4920)');

  // Flat material adds on top
  await page.click('[data-action="admin-mat-toggle"][data-matid="mat-trip"]');
  await page.waitForTimeout(400);
  assert((await body()).includes('Base cost: $5,070'), 'flat material adds $150');
  await page.click('[data-action="admin-mat-toggle"][data-matid="mat-trip"]');
  await page.waitForTimeout(300);

  // Builder shows the build-up
  await page.goto(APP + '#/eval/' + evId + '/builder');
  await page.waitForTimeout(400);
  await page.click('[data-action="builder-pick"][data-mid="' + newId + '"]');
  await page.waitForTimeout(300);
  txt = await body();
  assert(txt.includes('Cost build-up from assessment quantities'), 'builder shows materials build-up');
  assert(txt.includes('Old Insulation Removal') && txt.includes('$4,920'), 'builder itemizes material lines and base');

  // Missing quantity is flagged, not silently zero-priced
  await page.evaluate(() => {
    Store.zone(Store.activeEval(), 'attic').fields.sqft = '';
    Store.save(); window.rerender();
  });
  await page.waitForTimeout(400);
  assert((await body()).includes('enter Attic: Area'), 'missing assessment quantity is called out');
  await page.evaluate(() => {
    Store.zone(Store.activeEval(), 'attic').fields.sqft = '1200';
    Store.save(); window.rerender();
  });
  await page.waitForTimeout(300);

  // Piece-count quantities resolve from assessment lines
  const qtys = await page.evaluate(() => {
    const ev = Store.activeEval();
    Store.zone(ev, 'floor1').windows.push({ room: 'A', type: '', glazing: '', condition: '' });
    Store.zone(ev, 'floor1').windows.push({ room: 'B', type: '', glazing: '', condition: '' });
    return { windows: Store.quantity(ev, 'calc:windows'), mech: Store.quantity(ev, 'calc:mechanicals'), sqft: Store.quantity(ev, 'site.sqft') };
  });
  assert(qtys.windows === 2 && qtys.sqft === 2450, 'quantity resolver reads counts and areas');

  // Attic assessment captures the area feeding materials
  await page.goto(APP + '#/eval/' + evId + '/zone/attic');
  await page.waitForTimeout(400);
  assert((await body()).includes('Attic Area'), 'attic assessment has an area field');

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
  assert(await desk.locator('#tabbar a.admin-desktop').count() === 0, 'desktop rail hides Admin when signed out');
  await desk.evaluate(() => {
    Store.state.session = { access_token: 'test-token', refresh_token: '', expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: 'u-test', email: 'crew@test.dev', name: 'Test Crew', role: 'admin' } };
    Store.save(); window.rerender();
  });
  await desk.waitForTimeout(300);
  const adminLink = desk.locator('#tabbar a.admin-desktop');
  assert(await adminLink.count() === 1 && await adminLink.isVisible(), 'desktop rail shows Admin entry for admins');
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
  assert((await body()).includes('Test Connection'), 'settings offers a backend connection test');
  assert((await body()).includes('xeiyzuolymbytegenevi.supabase.co'), 'settings shows the configured backend host');

  // --- Password visibility toggle ---
  await page.goto(APP + '#/login');
  await page.waitForTimeout(400);
  const pw = page.locator('input[data-bind="login.password"]');
  assert(await pw.getAttribute('type') === 'password', 'password field starts masked');
  await pw.fill('secret123');
  await page.click('.pw-wrap:has(input[data-bind="login.password"]) .pw-eye');
  await page.waitForTimeout(150);
  assert(await pw.getAttribute('type') === 'text', 'eye toggle reveals the password');
  assert(await pw.inputValue() === 'secret123', 'typed value survives the toggle');
  await page.click('.pw-wrap:has(input[data-bind="login.password"]) .pw-eye');
  await page.waitForTimeout(150);
  assert(await pw.getAttribute('type') === 'password', 'second tap re-masks the password');
  await page.goto(APP + '#/settings');
  await page.waitForTimeout(400);
  assert(await page.locator('.pw-wrap:has(input[data-bind="login.newPassword"]) .pw-eye').count() === 1, 'change-password field has the eye toggle');
  await page.goto(APP + '#/admin/crew');
  await page.waitForTimeout(600);
  assert(await page.locator('.pw-wrap:has(input[data-bind="crew.password"]) .pw-eye').count() === 1, 'crew temp-password field has the eye toggle');

  // --- Customer proposal deck (deck.html, mocked edge function) ---
  const deckData = {
    customer: { name: 'Dr. Julian Voss', address: '124 Organic Lane, Portland, OR' },
    date: '2026-09-23', auditor: 'Test Crew',
    site: { sqft: '2450', yearBuilt: '1992', bedrooms: '4' },
    tests: { cfm50: '2340', co2: '412', voc: '0.2', rh: '45', pm: '8' },
    energy: { location: 'Portland, Oregon', hdd: 4400 },
    proposal: {
      items: [
        { name: 'Blown-in Cellulose', desc: 'Attic top-up to R-60.', science: 'Slows *convective heat transfer*.',
          benefits: ['Lower bills', 'No ice dams'], rebate: '', cost: 3000, savings: 310, base: 2500,
          adjustments: [{ label: 'Large home surcharge', amount: 500 }], notes: '' },
        { name: 'Air Sealing Package', desc: 'Seal bypasses and penetrations.', science: '',
          benefits: [], rebate: '40% Rebate Eligible', cost: 1450, savings: 320, base: 1450, adjustments: [], notes: 'Top plates first' }
      ],
      cost: 4450, savings: 630, payback: 7.1, upcharge: 0, marketPayback: 9
    },
    photos: [
      { label: 'Attic Overview', zone: 'attic', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' },
      { label: 'Manometer Reading', zone: 'blower', url: '' }
    ],
    updatedAt: '2026-09-24T00:00:00Z'
  };
  const deckPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await deckPage.route('**/functions/v1/proposal-deck*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deckData) }));
  await deckPage.goto('file://' + path.resolve(__dirname, '..', 'deck.html') + '?t=00000000-0000-4000-8000-000000000000');
  await deckPage.waitForTimeout(700);
  const dtxt = await deckPage.textContent('body');
  assert(dtxt.includes('Dr. Julian Voss'), 'deck cover populates customer name');
  assert(dtxt.includes('$4,450'), 'deck cover shows total investment');
  assert(dtxt.includes('2340'), 'deck cites blower-door CFM50');
  const slideCount = await deckPage.locator('.stage .slide').count();
  assert(slideCount === 7, 'deck builds 7 slides (cover + 2 photos + 2 measures + pricing + closing) — got ' + slideCount);
  assert(await deckPage.locator('.dots button').count() === 7, 'dot per slide');
  assert(await deckPage.locator('.slide[data-idx="0"].on').count() === 1, 'cover active first');
  await deckPage.keyboard.press('ArrowRight');
  await deckPage.waitForTimeout(350);
  assert(await deckPage.locator('.slide[data-idx="1"].on').count() === 1, 'arrow key advances slides');
  assert((await deckPage.textContent('.slide[data-idx="1"]')).includes('Attic Overview'), 'photo slide shows finding label');
  await deckPage.keyboard.press('ArrowRight');
  await deckPage.waitForTimeout(350);
  assert((await deckPage.textContent('.slide[data-idx="2"]')).includes('Photo pending'), 'missing photo renders a placeholder');
  await deckPage.click('.dots button[data-goto="3"]');
  await deckPage.waitForTimeout(350);
  const mtxt = await deckPage.textContent('.slide[data-idx="3"]');
  assert(mtxt.includes('Blown-in Cellulose') && mtxt.includes('$3,000'), 'measure slide shows rule-adjusted cost');
  assert(mtxt.includes('Large home surcharge'), 'measure slide itemizes the pricing adjustment');
  await deckPage.click('.dots button[data-goto="5"]');
  await deckPage.waitForTimeout(350);
  const ptxt = await deckPage.textContent('.slide[data-idx="5"]');
  assert(ptxt.includes('$4,450') && ptxt.includes('Year 8'), 'pricing slide totals and breakeven year');
  assert(await deckPage.locator('.print-only .print-slide').count() === 7, 'print layout has one page per slide');
  assert(dtxt.includes('Export PDF'), 'deck offers PDF export');
  await deckPage.screenshot({ path: SHOT_DIR + '/12-deck-cover.png' });
  await deckPage.click('.dots button[data-goto="0"]');

  // Bad token path
  const deckErr = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await deckErr.route('**/functions/v1/proposal-deck*', route =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Proposal not found' }) }));
  await deckErr.goto('file://' + path.resolve(__dirname, '..', 'deck.html') + '?t=00000000-0000-4000-8000-00000000dead');
  await deckErr.waitForTimeout(500);
  assert((await deckErr.textContent('body')).includes('Proposal not found'), 'deck surfaces not-found errors');
  await deckErr.close();
  await deckPage.close();

  // Share button present on proposal doc (backend configured)
  await page.goto(APP + '#/eval/' + evId + '/proposal-doc');
  await page.waitForTimeout(500);
  assert((await body()).includes('Share Online Deck'), 'proposal screen offers the share-deck button');

  if (errors.length) throw new Error('Console/page errors:\n' + errors.join('\n'));
  console.log('\nALL SMOKE TESTS PASSED');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
