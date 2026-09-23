/* Sales-pipeline screens: Improvement Catalog, Recommendation Builder,
   Proposed Solution Summary, Media Review & Proposal Selection, and the
   read-only Assessment Record. */
(function () {
  var esc = UI.esc;

  function flowTabs(ev, current) {
    var tabs = [
      { id: 'audit', label: 'Audit', icon: 'clipboard', route: '#/eval/' + ev.id + '/hub' },
      { id: 'catalog', label: 'Catalog', icon: 'layers', route: '#/eval/' + ev.id + '/catalog' },
      { id: 'builder', label: 'Builder', icon: 'edit', route: '#/eval/' + ev.id + '/builder' },
      { id: 'summary', label: 'Summary', icon: 'doc', route: '#/eval/' + ev.id + '/summary' }
    ];
    return '<div class="segmented lite" style="margin-bottom:18px">' + tabs.map(function (t) {
      return '<button data-action="nav" data-route="' + t.route + '" class="' + (t.id === current ? 'on' : '') + '">' +
        esc(t.label) + '</button>';
    }).join('') + '</div>';
  }

  function measureById(id) {
    return Store.measure(id);
  }

  function impactPill(impact) {
    var kind = impact === 'Critical' ? 'action' : impact === 'Elite' ? 'magenta' :
      impact === 'High Impact' ? 'magenta' : 'progress';
    return UI.pill(kind, impact);
  }

  /* Render *emphasized* science copy safely. */
  function science(text) {
    var parts = esc(text).split('*');
    return parts.map(function (p, i) { return i % 2 ? '<em>' + p + '</em>' : p; }).join('');
  }

  /* ---------------- Improvement Catalog ---------------- */
  window.ScreenCatalog = function (ev, filterCat) {
    filterCat = filterCat || 'All Measures';
    var groups = {};
    Store.catalog().forEach(function (m) {
      if (filterCat !== 'All Measures' && m.cat !== filterCat) return;
      (groups[m.cat] = groups[m.cat] || []).push(m);
    });

    var chips = '<div class="filter-chips">' + Store.catalogCats().map(function (c) {
      return '<button class="chip ' + (c === filterCat ? 'on' : '') + '" data-action="catalog-filter" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('') + '</div>';

    var body = Object.keys(groups).map(function (cat) {
      return '<h2 style="font:800 19px var(--font-display);color:var(--green);margin:22px 0 12px">' + esc(cat) + '</h2>' +
        groups[cat].map(function (m) {
          var added = ev.selections.indexOf(m.id) >= 0;
          return '<div class="measure-card">' +
            '<div class="mtop"><span class="mic">' + icon(m.icon) + '</span>' + impactPill(m.impact) + '</div>' +
            '<h3>' + esc(m.name) + '</h3><p>' + esc(m.desc) + '</p>' +
            '<div class="mfoot"><span class="roi">Est. ROI: <b style="color:var(--green)">' + m.roi + '%</b></span>' +
            '<button class="addbtn ' + (added ? 'added' : '') + '" data-action="catalog-toggle" data-mid="' + m.id + '" aria-label="' + (added ? 'Remove from plan' : 'Add to plan') + '">' +
            icon(added ? 'check' : 'plus') + '</button></div></div>';
        }).join('');
    }).join('');

    return UI.subbar('Improvement Catalog', '#/eval/' + ev.id + '/hub') +
      '<div class="screen">' + flowTabs(ev, 'catalog') +
      '<h1 class="screen-title">Improvement Catalog</h1>' +
      '<p class="screen-sub">Curated library of standard energy-saving measures. Select high-performance retrofits to add to your clinical home evaluation.</p>' +
      chips + body +
      (ev.selections.length ?
        '<div class="review-dock"><button class="btn primary" data-action="nav" data-route="#/eval/' + ev.id + '/builder">' +
        icon('bolt') + ' Review Selections (' + ev.selections.length + ') ' + icon('chevR') + '</button></div>' : '') +
      '</div>';
  };

  /* ---------------- Recommendation Builder ---------------- */
  window.ScreenBuilder = function (ev, measureId) {
    if (!ev.selections.length) {
      return UI.subbar('Builder', '#/eval/' + ev.id + '/catalog') +
        '<div class="screen">' + flowTabs(ev, 'builder') +
        '<div class="empty">' + icon('layers') + '<b>No measures selected</b><p>Add improvements from the Catalog first.</p></div></div>';
    }
    var mid = measureId && ev.selections.indexOf(measureId) >= 0 ? measureId : ev.selections[0];
    var m = measureById(mid);
    if (!m) {
      var valid = ev.selections.filter(measureById);
      if (!valid.length) {
        return UI.subbar('Builder', '#/eval/' + ev.id + '/catalog') +
          '<div class="screen">' + flowTabs(ev, 'builder') +
          '<div class="empty">' + icon('layers') + '<b>Selected measures no longer exist</b><p>They were removed from the catalog. Pick current measures from the Catalog.</p></div></div>';
      }
      mid = valid[0]; m = measureById(mid);
    }
    var fi = Store.financials(ev, [mid]).items[0];
    var rec = ev.recs[mid] || {};
    var cost = fi.cost;
    var savings = fi.savings;
    var payback = savings > 0 ? Math.round((cost / savings) * 10) / 10 : null;

    var picker = '<div class="filter-chips">' + ev.selections.map(function (id) {
      var mm = measureById(id);
      if (!mm) return '';
      return '<button class="chip ' + (id === mid ? 'on' : '') + '" data-action="builder-pick" data-mid="' + id + '">' + esc(mm.name) + '</button>';
    }).join('') + '</div>';

    var zonePhotos = ev.photos.slice(0, 1);
    var heroUrl = zonePhotos.length ? Store.photoUrl(zonePhotos[0].id) : null;

    return UI.subbar('Recommendation Builder', '#/eval/' + ev.id + '/catalog') +
      '<div class="screen">' + flowTabs(ev, 'builder') +
      '<span class="eyebrow blue">Recommendation Builder</span>' +
      '<h1 class="screen-title">' + esc(m.name) + '</h1>' +
      '<p class="screen-sub">Detailed specification for the improvement at ' + esc(ev.customer.address || 'this residence') + '.</p>' +
      picker +

      '<div class="card">' + UI.sectionHeading('Financial Estimates', 'calc') +
      (fi.adjustments.length ?
        '<div class="insight" style="margin-top:0"><b>' + icon('calc') + ' Auto-pricing from audit data</b><br>' +
        'Base ' + UI.money(fi.base) +
        fi.adjustments.map(function (a) {
          return ' &nbsp;' + (a.amount < 0 ? '− ' + UI.money(-a.amount) : '+ ' + UI.money(a.amount)) +
            ' <span style="color:var(--muted)">(' + esc(a.label) + ')</span>';
        }).join('') +
        ' &nbsp;→ <b>' + UI.money(fi.autoCost) + '</b>' +
        (rec.cost != null && rec.cost !== '' ? '<br><span style="color:var(--muted)">Overridden by the manual cost below.</span>' : '') +
        '</div>' : '') +
      UI.field({ label: 'Estimated Cost ($)', bind: 'recs.' + mid + '.cost', type: 'number', inputmode: 'decimal', placeholder: String(fi.autoCost), value: rec.cost }) +
      UI.field({ label: 'Annual Savings ($)', bind: 'recs.' + mid + '.savings', type: 'number', inputmode: 'decimal', placeholder: String(m.savings), value: rec.savings }) +
      UI.field({ label: 'Contractor Notes & Scope', bind: 'recs.' + mid + '.notes', textarea: true, placeholder: 'Specify materials, R-targets (e.g. Blown cellulose to R-60), and access notes…', value: rec.notes }) +
      '</div>' +

      '<div class="stat-cards">' +
      '<div class="stat-card" style="border-bottom:3px solid var(--green)"><div class="v">' + m.roi + '%</div><div class="foot">Avg. ROI (Yearly)</div></div>' +
      '<div class="stat-card" style="border-bottom:3px solid var(--magenta)"><div class="v" style="color:var(--magenta)">' + (payback != null ? payback : '—') + '</div><div class="foot">Payback Period (Yrs)</div></div>' +
      '</div>' +

      '<div class="science-block"><h3>Science Context</h3>' +
      '<p>' + science(m.science) + '</p>' +
      '<div class="benefit-list"><b class="blt">Benefit Summary</b>' +
      Store.measureBenefits(m).map(function (b) {
        return '<div class="brow"><span class="ok">' + icon('check') + '</span>' + esc(b) + '</div>';
      }).join('') + '</div></div>' +

      (heroUrl ? '<div class="hero-photo"><img src="' + heroUrl + '" alt="Site evidence">' +
        '<div class="fig-caption">Fig 1.2: Site evidence captured during the field assessment.</div></div>' : '') +

      '<div class="cta-dock"><button class="btn primary" data-action="nav" data-route="#/eval/' + ev.id + '/summary">Continue to Summary ' + icon('chevR') + '</button></div>' +
      '</div>';
  };

  /* ---------------- Proposed Solution Summary ---------------- */
  window.ScreenSummary = function (ev) {
    var fin = Store.financials(ev);
    var years = [1, 3, 5, 7, 9, 10];
    var maxVal = Math.max.apply(null, years.map(function (y) { return Math.max(0, fin.savings * y - fin.cost) + fin.cost * 0.15; }).concat([1]));
    var bars = years.map(function (y, i) {
      var net = fin.savings * y - fin.cost;
      var h = Math.max(6, Math.round((Math.max(0, net) + fin.cost * 0.15) / maxVal * 100));
      var cls = net <= 0 ? '' : i < 2 ? 'pos1' : i < 3 ? 'pos2' : i < 5 ? 'pos3' : 'pos4';
      return '<div class="bar ' + cls + '" style="height:' + h + '%"></div>';
    }).join('');
    var breakeven = fin.payback != null ? Math.ceil(fin.payback) : null;

    var lineItems = fin.items.map(function (i) {
      return '<div class="line-item"><span class="lic">' + icon(i.measure.icon) + '</span>' +
        '<div class="lbody"><b>' + esc(i.measure.name) + '</b><span>' + esc(i.measure.desc.split('.')[0]) + '</span></div>' +
        '<div class="lprice"><b>' + UI.money(i.cost) + '</b>' +
        (i.measure.rebate ? '<span>' + esc(i.measure.rebate) + '</span>' : '<span style="color:var(--muted)">Immediate ROI</span>') +
        '</div></div>';
    }).join('') +
    (fin.upcharge ? '<div class="line-item" style="background:var(--magenta-soft)"><span class="lic">' + icon('alert') + '</span>' +
      '<div class="lbody"><b>Restricted Space Upcharge</b><span>Crawlspace clearance below ' + DATA.CRAWL_MIN_CLEARANCE_IN + '&quot;</span></div>' +
      '<div class="lprice"><b style="color:var(--magenta)">' + UI.money(fin.upcharge) + '</b></div></div>' : '');

    return UI.subbar('Proposed Solution', '#/eval/' + ev.id + '/hub') +
      '<div class="screen">' + flowTabs(ev, 'summary') +
      '<h1 class="screen-title">Proposed Solution Summary</h1>' +
      '<p class="screen-sub">A curated ecological and financial analysis of your home’s efficiency trajectory based on the selected improvements.</p>' +

      (fin.items.length === 0 ?
        '<div class="empty">' + icon('doc') + '<b>Nothing selected yet</b><p>Add measures from the Catalog to build the proposal.</p></div>' :

        '<div class="card"><div class="k" style="font:500 12px var(--font-body);color:var(--muted)">Total Investment</div>' +
        '<div class="bignum">' + UI.money(fin.cost) + '<small>est.</small></div>' +
        '<p class="hint" style="display:flex;align-items:center;gap:6px;margin-top:6px">' + icon('info') + ' Post-rebate projections</p></div>' +

        '<div class="stat-cards">' +
        '<div class="stat-card"><div class="k" style="color:var(--muted)">Annual Savings</div><div class="v">' + UI.money(fin.savings) + '<small>/ yr</small></div></div>' +
        '<div class="stat-card"><div class="k" style="color:var(--muted)">Simple Payback</div><div class="v">' + (fin.payback != null ? fin.payback : '—') + '<small>Years</small></div>' +
        (fin.payback != null && fin.payback < DATA.MARKET_AVG_PAYBACK_YEARS ?
          '<div class="foot">' + UI.pill('progress', 'Optimized') + ' Ahead of market average (' + DATA.MARKET_AVG_PAYBACK_YEARS + 'y)</div>' : '') +
        '</div></div>' +

        (function () {
          var em = ev.energyModel && ev.energyModel.climate ? EnergyModel.compute(ev) : null;
          if (!em || !em.totalCost || !fin.savings) return '';
          var pct = Math.round(fin.savings / em.totalCost * 100);
          return '<div class="insight"><b>' + icon('chart') + ' Energy Model</b><br>' +
            'This home’s modeled annual energy spend is ' + UI.money(em.totalCost) +
            ' (' + ev.energyModel.climate.hdd.toLocaleString() + ' HDD at ' +
            esc(ev.energyModel.resolved ? ev.energyModel.resolved.name : ev.energyModel.location) +
            '). The selected improvements target ≈ ' + pct + '% of it.</div>';
        })() +

        UI.sectionHeading('Investment Breakdown', 'dollar') + lineItems +

        '<div class="card"><h3>Cumulative ROI Projection</h3>' +
        '<div class="roi-chart">' + bars + '</div>' +
        '<div class="roi-xlabels">' + years.map(function (y) { return '<span>Year ' + y + (y === 10 ? '+' : '') + '</span>'; }).join('') + '</div>' +
        '<div class="insight" style="margin-bottom:0"><b>' + icon('sparkle') + ' Clinical Insight</b><br>' +
        (breakeven != null ?
          'Your home will enter a &quot;Positive Yield&quot; phase by Year ' + breakeven + '. Total 20-year net gain projected at ' + UI.money(fin.savings * 20 - fin.cost) + '.' :
          'Enter costs and savings in the Builder to project yield.') + '</div></div>' +

        '<div class="card" style="background:var(--surface-3);border:none;text-align:center;padding:24px 16px">' +
        '<h3>Ready to proceed?</h3>' +
        '<p class="hint">Generate a formal clinical proposal to share with contractors and lenders. This includes full technical specs and selected site media.</p>' +
        '<button class="btn primary" data-action="nav" data-route="#/eval/' + ev.id + '/proposal-media">Select Proposal Media ' + icon('photo') + '</button>' +
        '<div style="height:8px"></div>' +
        '<button class="btn dark" data-action="nav" data-route="#/eval/' + ev.id + '/proposal-doc">Generate Proposal PDF ' + icon('print') + '</button>' +
        '</div>') +
      '</div>';
  };

  /* ---------------- Media Review & Tagging ---------------- */
  window.ScreenMedia = function (ev, filterZone, editingPhotoId) {
    filterZone = filterZone || 'all';
    var zonesWithPhotos = {};
    ev.photos.forEach(function (p) { zonesWithPhotos[p.zone || 'other'] = true; });
    var cats = ['all'].concat(Object.keys(zonesWithPhotos));

    var chips = '<div class="filter-chips">' + cats.map(function (c) {
      var z = DATA.ZONES.filter(function (zz) { return zz.id === c; })[0];
      var label = c === 'all' ? 'All Media' : z ? z.name.split(' ')[0] : c;
      return '<button class="chip ' + (c === filterZone ? 'on' : '') + '" data-action="media-filter" data-zone="' + esc(c) + '">' + esc(label) + '</button>';
    }).join('') + '</div>';

    var missing = ev.photos.filter(function (p) { return !p.zone || !p.label; }).length;

    var shown = ev.photos.filter(function (p) { return filterZone === 'all' || (p.zone || 'other') === filterZone; });
    var grid = '<div class="media-grid">' + shown.map(function (p) {
      var url = Store.photoUrl(p.id);
      if (!url) return '';
      var untagged = !p.zone || !p.label;
      return '<button class="media-tile' + (untagged ? ' untagged' : '') + (p.id === editingPhotoId ? ' editing' : '') + '"' +
        ' data-action="media-edit" data-photo="' + p.id + '">' +
        '<img src="' + url + '" alt="' + esc(p.label || 'Photo') + '">' +
        '<span class="meta">' + esc(p.label || 'Untitled') + '<br>' + esc((p.ts || '').slice(0, 10)) + ' · ' + esc(p.inspector || '') +
        (p.storagePath ? ' · ☁' : '') + '</span>' +
        '</button>';
    }).join('') + '</div>';

    var editor = '';
    if (editingPhotoId) {
      var idx = -1;
      ev.photos.forEach(function (p, i) { if (p.id === editingPhotoId) idx = i; });
      if (idx >= 0) {
        var p = ev.photos[idx];
        editor = '<div class="tag-editor">' +
          '<b style="display:block;margin-bottom:10px">Tag this photo</b>' +
          UI.field({ label: 'Label', bind: 'photos.' + idx + '.label', placeholder: 'e.g. Furnace 1: Exhaust Vent', value: p.label }) +
          UI.field({ label: 'Zone', bind: 'photos.' + idx + '.zone', options: DATA.ZONES.map(function (z) { return z.id; }).concat(['blower', 'caz']), value: p.zone }) +
          '<div class="btn-row" style="margin:4px 0 0">' +
          '<button class="btn small primary" data-action="media-edit-done">Done</button>' +
          '<button class="btn small danger-ghost" data-action="photo-remove" data-photo="' + p.id + '">Delete Photo</button>' +
          '</div></div>';
      }
    }

    return UI.subbar('Media Review', '#/eval/' + ev.id + '/hub',
        '<button class="iconbtn" data-action="export-json" aria-label="Export audit JSON">' + icon('export') + '</button>') +
      '<div class="screen">' +
      '<h1 class="screen-title">Assessment Media</h1>' +
      '<p class="screen-sub">Captured media for residential energy systems and compliance documentation. Tap a photo to tag it.</p>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      (missing ? UI.pill('action', missing + ' required tag' + (missing > 1 ? 's' : '') + ' missing') : UI.pill('complete', 'All media tagged')) +
      UI.pill('pending', ev.photos.length + ' items') + '</div>' +
      chips + editor +
      (shown.length ? grid :
        '<div class="empty">' + icon('photo') + '<b>No media yet</b><p>Photos captured in zone assessments and tests appear here.</p></div>') +
      '</div>';
  };

  /* ---------------- Proposal Media Selection ---------------- */
  window.ScreenProposalMedia = function (ev) {
    var sel = ev.proposalMedia || [];
    var grid = '<div class="media-grid">' + ev.photos.map(function (p) {
      var url = Store.photoUrl(p.id);
      if (!url) return '';
      var on = sel.indexOf(p.id) >= 0;
      return '<button class="media-tile ' + (on ? 'selected' : '') + '" data-action="pmedia-toggle" data-photo="' + p.id + '">' +
        '<img src="' + url + '" alt="' + esc(p.label || 'Photo') + '">' +
        '<span class="selmark">' + icon('check') + '</span>' +
        '<span class="meta">' + esc(p.label || 'Photo') + '</span></button>';
    }).join('') + '</div>';

    return UI.subbar('Proposal Media', '#/eval/' + ev.id + '/summary') +
      '<div class="screen">' +
      '<h1 class="screen-title">Media Selection</h1>' +
      '<p class="screen-sub">Choose the site evidence to include in the customer proposal.</p>' +
      (ev.photos.length ? grid :
        '<div class="empty">' + icon('photo') + '<b>No media captured</b><p>Capture photos during assessment first.</p></div>') +
      (sel.length ?
        '<div class="selection-dock"><span class="badge-ic" style="width:38px;height:38px;border-radius:10px;background:var(--green-soft);color:var(--green);display:inline-flex;align-items:center;justify-content:center">' + icon('photo') + '</span>' +
        '<div class="sbody"><b>' + sel.length + ' items ready</b><span>Estimated ' + Math.max(1, Math.ceil(sel.length / 2) + 2) + ' pages in proposal</span></div>' +
        '<button class="btn ghost" style="width:auto" data-action="pmedia-clear">Clear</button>' +
        '<button class="btn primary" data-action="nav" data-route="#/eval/' + ev.id + '/proposal-doc">Review ' + icon('chevR') + '</button></div>' : '') +
      '</div>';
  };

  /* ---------------- Customer-facing Proposal Document ----------------
     Rendered from the editable HTML template (js/proposal.js, #/template).
     The controls card lets the assessor check/uncheck which recommended
     improvements make it into this document. */
  window.ScreenProposalDoc = function (ev) {
    var omit = ev.proposalOmit || [];
    var included = Proposal.includedIds(ev);

    var measureChecks = ev.selections.map(function (id) {
      var m = measureById(id);
      if (!m) return '';
      var on = omit.indexOf(id) < 0;
      var r = ev.recs[id] || {};
      var cost = r.cost != null && r.cost !== '' ? r.cost : m.cost;
      return '<button class="check-row" data-action="pdoc-measure" data-mid="' + id + '">' +
        '<span class="cbox ' + (on ? 'on' : '') + '">' + (on ? icon('check') : '') + '</span>' +
        '<span class="cbody"><b>' + esc(m.name) + '</b><span>' + UI.money(parseFloat(cost) || 0) + ' · ' + esc(m.impact) + '</span></span>' +
        '</button>';
    }).join('');

    var controls = '<div class="card no-print">' + UI.sectionHeading('Proposal Contents', 'edit') +
      '<p class="hint">Uncheck an improvement to leave it out of this document — it stays in your working plan.</p>' +
      measureChecks +
      '<div class="kv-row" style="margin-top:8px"><span class="k">' + icon('photo') + ' Site photos</span>' +
      '<span class="v">' + (ev.proposalMedia || []).length + ' selected</span></div>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn small secondary" data-action="nav" data-route="#/eval/' + ev.id + '/proposal-media">Choose Photos</button>' +
      '<button class="btn small secondary" data-action="nav" data-route="#/template">' + icon('edit') + ' Edit Template</button>' +
      '</div></div>';

    var doc;
    try {
      doc = Tpl.render(Proposal.template(), Proposal.context(ev));
    } catch (err) {
      doc = '<div class="empty no-print">' + icon('alert') + '<b>Template error</b><p>' + esc(err.message) +
        '</p><button class="btn small secondary" style="width:auto;margin-top:10px" data-action="nav" data-route="#/template">Open Template Editor</button></div>';
    }

    return UI.subbar('Proposal Preview', '#/eval/' + ev.id + '/summary',
        '<button class="btn small primary" style="width:auto" data-action="print-doc">' + icon('print') + ' Print / Save PDF</button>') +
      '<div class="screen pdoc">' +
      (ev.selections.length ? controls : '') +
      (included.length ? doc :
        '<div class="empty">' + icon('doc') + '<b>No measures in the proposal</b><p>' +
        (ev.selections.length ? 'Everything is unchecked above — include at least one improvement.'
          : 'Add improvements from the Catalog before generating a proposal.') + '</p></div>') +
      '</div>';
  };

  /* ---------------- Proposal Template Editor ---------------- */
  window.ScreenTemplate = function () {
    var custom = !!Store.state.proposalTemplate;
    if (TemplateDraft.html == null) TemplateDraft.html = Proposal.template();

    var tokenRows = Proposal.TOKENS.map(function (t) {
      return '<div class="tok-row"><code>' + esc(t[0]) + '</code><span>' + esc(t[1]) + '</span></div>';
    }).join('');

    var active = Store.activeEval();

    return UI.subbar('Proposal Template', '#/settings') +
      '<div class="screen">' +
      '<span class="eyebrow blue">' + icon('edit') + ' Document Designer</span>' +
      '<h1 class="screen-title">Proposal Template</h1>' +
      '<p class="screen-sub">The proposal document is generated from this HTML. Edit the layout, wording and branding freely — <code>{{tokens}}</code> are replaced with live assessment data when the proposal is generated.</p>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      UI.pill(custom ? 'progress' : 'complete', custom ? 'Customized' : 'Default design') + '</div>' +

      '<textarea class="tpl-editor" data-bind="tpl.html" spellcheck="false">' + esc(TemplateDraft.html) + '</textarea>' +

      '<div class="btn-row" style="margin:12px 0">' +
      '<button class="btn primary" data-action="tpl-save">Save Template</button>' +
      '<button class="btn secondary" data-action="tpl-preview"' + (active ? '' : ' disabled') + '>Save &amp; Preview</button>' +
      '</div>' +
      '<button class="btn danger-ghost" data-action="tpl-reset"' + (custom ? '' : ' disabled') + '>Reset to default design</button>' +

      '<div class="card" style="margin-top:16px">' + UI.sectionHeading('Available Tokens', 'info') +
      '<p class="hint">Sections: <code>{{#if x}}…{{/if}}</code> renders only when data exists; <code>{{#each list}}…{{/each}}</code> repeats per item. Style with the <code>pd-page</code>, <code>pd-table</code>, <code>pd-hero</code>, <code>pd-measure</code>, <code>pd-gallery</code> classes or your own inline CSS.</p>' +
      '<div class="tok-list">' + tokenRows + '</div></div>' +
      '</div>';
  };
  window.TemplateDraft = {};

  /* ---------------- Assessment Record (read-only summary) ---------------- */
  window.ScreenRecord = function (ev) {
    var a = Store.ashrae(ev);
    var fin = Store.financials(ev);
    var ms = Store.moduleStatus(ev);
    var basement = ev.zones.basement;
    var sysRows = basement ? DATA.BASEMENT_SYSTEMS.filter(function (s) { return basement.systems[s.id]; }).map(function (s) {
      var d = basement.systems[s.id];
      var count = ev.photos.filter(function (p) { return (p.slotKey || '').indexOf('basement-' + s.id) === 0; }).length;
      return '<div class="kv-row"><span class="k">' + esc(s.name) + (d && d.fuel ? ' · ' + esc(d.fuel) : '') + '</span>' +
        '<span class="v">' + (count ? count + ' photo' + (count > 1 ? 's' : '') : '—') + '</span></div>';
    }).join('') : '';

    var windows = [];
    ['floor1', 'floor2', 'floor3'].forEach(function (fid) {
      if (ev.zones[fid]) windows = windows.concat(ev.zones[fid].windows || []);
    });

    var mediaWall = '<div class="media-grid">' + ev.photos.slice(0, 6).map(function (p) {
      var url = Store.photoUrl(p.id);
      return url ? '<div class="media-tile"><img src="' + url + '" alt=""></div>' : '';
    }).join('') + '</div>';

    return UI.subbar('Assessment Record', '#/eval/' + ev.id + '/hub',
        '<button class="iconbtn" data-action="export-json" aria-label="Export JSON">' + icon('export') + '</button>' +
        '<button class="btn small primary" style="width:auto" data-action="finalize-eval">' + icon('sync') + ' Finalize &amp; Sync</button>') +
      '<div class="screen">' +
      UI.pill(ev.status === 'complete' ? 'complete' : 'progress', null, true) +
      '<h1 class="screen-title" style="margin-top:10px">Residential Audit — ' + esc(ev.customer.name || 'Unnamed') + '</h1>' +

      '<div class="card">' + UI.sectionHeading('Assessment Overview', 'chart') +
      '<p class="hint">Property diagnostic baseline for weatherization.</p>' +
      '<div class="stat-cards">' +
      '<div class="stat-card"><div class="k" style="color:var(--muted)">Square Footage</div><div class="v">' + esc(ev.site.sqft || '—') + '<small>ft²</small></div></div>' +
      '<div class="stat-card"><div class="k" style="color:var(--muted)">Year Built</div><div class="v">' + esc(ev.site.yearBuilt || '—') + '</div></div>' +
      '<div class="stat-card"><div class="k" style="color:var(--muted)">Stories</div><div class="v">' + esc(ev.site.stories || '—') + '</div></div>' +
      '<div class="stat-card"><div class="k" style="color:var(--muted)">Target MBA</div><div class="v">' + (a ? a.target.toFixed(0) : '—') + '<small>CFM</small></div></div>' +
      '</div></div>' +

      '<div class="card">' + UI.sectionHeading('Customer Profile', 'user') +
      '<div class="kv-list">' +
      '<div class="kv-row"><span class="k">Contact</span><span class="v">' + esc(ev.customer.phone || ev.customer.email || '—') + '</span></div>' +
      '<div class="kv-row"><span class="k">Site Address</span><span class="v">' + esc(ev.customer.address || '—') + '</span></div>' +
      '<div class="kv-row"><span class="k">Motivation</span><span class="v">' + esc(ev.intake.motivation || '—') + '</span></div>' +
      '</div></div>' +

      '<div class="card">' + UI.sectionHeading('Diagnostics', 'shield') +
      '<div class="kv-list">' +
      '<div class="kv-row"><span class="k">Blower Door CFM50</span><span class="v ' + (ms.blower === 'complete' ? 'good' : '') + '">' + esc(ev.tests.blower.cfm50 || 'Pending') + '</span></div>' +
      DATA.IAQ_METRICS.map(function (m) {
        var v = ev.tests.iaq[m.id];
        if ((v === '' || v == null) && !m.required) return '';
        return '<div class="kv-row"><span class="k">' + esc(m.name) + '</span><span class="v">' +
          esc(v !== '' && v != null ? v + ' ' + m.unit : 'Pending') + '</span></div>';
      }).join('') +
      '<div class="kv-row"><span class="k">Combustion Safety</span><span class="v ' + (ms.caz === 'complete' ? 'good' : '') + '">' +
      (ms.caz === 'complete' ? 'All hard-stops passed' : ms.caz === 'action' ? 'FAILURES RECORDED' : 'Pending') + '</span></div>' +
      '</div></div>' +

      (sysRows ? '<div class="card">' + UI.sectionHeading('Appliance Inventory', 'boiler') + '<div class="kv-list">' + sysRows + '</div></div>' : '') +

      (function () {
        var mech = ev.zones.mechanicals;
        if (!mech || !Object.keys(mech.systems || {}).length) return '';
        var rows = DATA.MECHANICALS.filter(function (s) { return mech.systems[s.id]; }).map(function (s) {
          var d = mech.systems[s.id] || {};
          var summary = [d.type || d.amperage, d.age ? d.age + ' yrs' : '', d.condition || d.space].filter(Boolean).join(' · ');
          return '<div class="kv-row"><span class="k">' + esc(s.name) + '</span><span class="v">' + esc(summary || 'Recorded') + '</span></div>';
        }).join('');
        return '<div class="card">' + UI.sectionHeading('Mechanicals', 'flame') + '<div class="kv-list">' + rows + '</div></div>';
      })() +

      (windows.length ? '<div class="card">' + UI.sectionHeading('Fenestration', 'window') +
        '<div class="kv-list">' +
        '<div class="kv-row"><span class="k">Window Count</span><span class="v">' + windows.length + ' Units</span></div>' +
        '<div class="kv-row"><span class="k">Frame Types</span><span class="v">' +
        esc(Array.from(new Set(windows.map(function (w) { return w.type; }).filter(Boolean))).join(', ') || '—') + '</span></div>' +
        '</div></div>' : '') +

      (fin.items.length ? '<div class="card">' + UI.sectionHeading('Proposed Plan', 'dollar') +
        '<div class="kv-list">' +
        '<div class="kv-row"><span class="k">Measures</span><span class="v">' + fin.items.length + '</span></div>' +
        '<div class="kv-row"><span class="k">Total Investment</span><span class="v good">' + UI.money(fin.cost) + '</span></div>' +
        '<div class="kv-row"><span class="k">Simple Payback</span><span class="v">' + (fin.payback != null ? fin.payback + ' yrs' : '—') + '</span></div>' +
        '</div></div>' : '') +

      (ev.photos.length ? UI.sectionHeading('Assessment Media', 'photo',
        '<span class="aux">' + ev.photos.length + ' items</span>') + mediaWall : '') +
      '<div style="height:14px"></div>' +
      '</div>';
  };
})();
