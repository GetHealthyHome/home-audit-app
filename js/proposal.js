/* Proposal generator: a small mustache-style template engine (Tpl) plus the
   data context and default HTML template for the customer proposal.

   The proposal document is rendered from an HTML template the assessor can
   edit in-app (#/template). Custom templates live in Store.state
   (proposalTemplate); when none is saved, DEFAULT_TEMPLATE is used.

   Template syntax:
     {{path}}            escaped value           {{customer.name}}
     {{{path}}}          raw HTML value          {{{m.scienceHtml}}}
     {{#if path}}…{{else}}…{{/if}}   conditional (else optional)
     {{#each path}}…{{/each}}        loop; inside, fields resolve on the item
     {{.}}               the current loop item (for arrays of strings)
     {{@num}}            1-based index inside a loop */
(function () {
  var esc = function (s) { return UI.esc(s == null ? '' : String(s)); };

  /* ---------------- Template engine ---------------- */
  var TOKEN = /\{\{\{\s*([\s\S]+?)\s*\}\}\}|\{\{\s*([\s\S]+?)\s*\}\}/g;

  function parse(tpl) {
    var root = { body: [] };
    var stack = [root];
    var last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(tpl))) {
      var top = stack[stack.length - 1];
      var target = top.inElse ? top.els : top.body;
      if (m.index > last) target.push({ t: 'text', s: tpl.slice(last, m.index) });
      last = TOKEN.lastIndex;
      if (m[1] != null) { target.push({ t: 'var', path: m[1], raw: true }); continue; }
      var tag = m[2];
      if (tag.indexOf('#if ') === 0) {
        var node = { t: 'if', path: tag.slice(4).trim(), body: [], els: [] };
        target.push(node); stack.push(node);
      } else if (tag.indexOf('#each ') === 0) {
        var loop = { t: 'each', path: tag.slice(6).trim(), body: [] };
        target.push(loop); stack.push(loop);
      } else if (tag === 'else') {
        if (top.t === 'if') top.inElse = true;
      } else if (tag === '/if' || tag === '/each') {
        if (stack.length > 1) stack.pop();
      } else {
        target.push({ t: 'var', path: tag });
      }
    }
    var tail = stack[stack.length - 1];
    (tail.inElse ? tail.els : tail.body).push({ t: 'text', s: tpl.slice(last) });
    return root.body;
  }

  function lookup(path, scopes) {
    if (path === '.') return scopes[scopes.length - 1];
    var parts = path.split('.');
    for (var s = scopes.length - 1; s >= 0; s--) {
      var v = scopes[s];
      if (v == null || typeof v !== 'object') continue;
      if (!(parts[0] in v)) continue;
      for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
      return v;
    }
    return undefined;
  }

  function truthy(v) {
    if (Array.isArray(v)) return v.length > 0;
    return !!v;
  }

  function evalNodes(nodes, scopes) {
    return nodes.map(function (n) {
      if (n.t === 'text') return n.s;
      if (n.t === 'var') {
        var v = lookup(n.path, scopes);
        if (v == null) return '';
        return n.raw ? String(v) : esc(v);
      }
      if (n.t === 'if') {
        return evalNodes(truthy(lookup(n.path, scopes)) ? n.body : n.els, scopes);
      }
      if (n.t === 'each') {
        var arr = lookup(n.path, scopes);
        if (!Array.isArray(arr)) return '';
        return arr.map(function (item, i) {
          var scope = (item != null && typeof item === 'object') ? Object.assign({}, item) : item;
          if (scope != null && typeof scope === 'object') scope['@num'] = i + 1;
          return evalNodes(n.body, scopes.concat([scope]));
        }).join('');
      }
      return '';
    }).join('');
  }

  /* Strip active content — the template is user-authored, but pasted HTML
     shouldn't be able to run script inside the app. */
  function sanitize(html) {
    return html
      .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, '$1=$2#$2');
  }

  window.Tpl = {
    render: function (tpl, ctx) {
      return sanitize(evalNodes(parse(tpl), [ctx]));
    }
  };

  /* ---------------- Proposal data context ---------------- */
  function money(n) { return UI.money(n); }
  function firstSentence(s) { return (s || '').split('.')[0] + '.'; }
  function scienceHtml(text) {
    return esc(text).split('*').map(function (p, i) { return i % 2 ? '<em>' + p + '</em>' : p; }).join('');
  }

  window.Proposal = {
    /* Measures currently checked into the proposal (assessor can uncheck
       selected measures without removing them from the working plan). */
    includedIds: function (ev) {
      var omit = ev.proposalOmit || [];
      return ev.selections.filter(function (id) { return omit.indexOf(id) < 0; });
    },

    template: function () {
      return Store.state.proposalTemplate || Proposal.DEFAULT_TEMPLATE;
    },

    context: function (ev) {
      var fin = Store.financials(ev, Proposal.includedIds(ev));
      var em = ev.energyModel && ev.energyModel.climate ? EnergyModel.compute(ev) : null;
      var breakeven = fin.payback != null ? Math.ceil(fin.payback) : null;

      var measures = fin.items.map(function (i) {
        var benefits = Store.measureBenefits(i.measure);
        return {
          name: i.measure.name,
          desc: i.measure.desc,
          descShort: firstSentence(i.measure.desc),
          notes: i.notes,
          cost: i.cost, costFmt: money(i.cost),
          base: i.base, baseFmt: money(i.base),
          adjustments: i.adjustments.map(function (a) {
            return { label: a.label, amount: a.amount, amountFmt: money(a.amount) };
          }),
          savings: i.savings, savingsFmt: money(i.savings),
          roi: i.measure.roi,
          rebate: i.measure.rebate || '',
          scienceHtml: scienceHtml(i.measure.science),
          benefits: benefits,
          benefitsJoined: benefits.join(' · ')
        };
      });

      var iaq = DATA.IAQ_METRICS.map(function (m) {
        var v = ev.tests.iaq[m.id];
        if (v === '' || v == null) return null;
        var band = Store.iaqBand(m, v);
        return { name: m.name, value: v, unit: m.unit, band: band ? band.label : '' };
      }).filter(Boolean);

      var photos = (ev.proposalMedia || []).map(function (id) {
        var p = ev.photos.filter(function (x) { return x.id === id; })[0];
        var url = p && Store.photoUrl(p.id);
        return url ? {
          url: url, label: p.label || 'Site photo', zone: p.zone || '',
          ref: Store.photoRef(p) || '', tags: (p.tags || []).join(' · ')
        } : null;
      }).filter(Boolean);

      var rebates = fin.items.filter(function (i) { return i.measure.rebate; })
        .map(function (i) { return i.measure.name + ' (' + i.measure.rebate + ')'; }).join(', ');

      var ahead = fin.payback != null && fin.payback < DATA.MARKET_AVG_PAYBACK_YEARS
        ? Math.round((DATA.MARKET_AVG_PAYBACK_YEARS - fin.payback) * 10) / 10 : null;

      return {
        company: Store.state.auditor.company || 'HomSci Pro',
        brandIcon: icon('bolt'),
        today: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
        assessmentDate: ((ev.photos[0] && ev.photos[0].ts) || ev.createdAt || '').slice(0, 10),
        auditor: Store.state.auditor,
        customer: ev.customer,
        site: ev.site,
        ashrae: Store.ashrae(ev),
        tests: {
          cfm50: ev.tests.blower.cfm50,
          co2: ev.tests.iaq.co2,
          iaq: iaq
        },
        measures: measures,
        fin: {
          cost: fin.cost, costFmt: money(fin.cost),
          savings: fin.savings, savingsFmt: money(fin.savings),
          payback: fin.payback,
          paybackFmt: fin.payback != null ? fin.payback + ' yrs' : '—',
          breakeven: breakeven,
          netGain20Fmt: money(fin.savings * 20 - fin.cost),
          upcharge: fin.upcharge, upchargeFmt: fin.upcharge ? money(fin.upcharge) : '',
          crawlMinClearance: DATA.CRAWL_MIN_CLEARANCE_IN,
          rebateList: rebates,
          marketPayback: DATA.MARKET_AVG_PAYBACK_YEARS,
          aheadYears: ahead
        },
        energy: em && em.totalCost ? {
          location: ev.energyModel.resolved
            ? ev.energyModel.resolved.name + (ev.energyModel.resolved.admin1 ? ', ' + ev.energyModel.resolved.admin1 : '')
            : ev.energyModel.location,
          hdd: ev.energyModel.climate.hdd.toLocaleString(),
          totalCostFmt: money(em.totalCost),
          pctOfSpend: fin.savings ? Math.round(fin.savings / em.totalCost * 100) : null
        } : null,
        photos: photos
      };
    },

    /* Realistic stand-in data so the visual template editor can render a
       preview even when no evaluation is open. Mirrors context()'s shape. */
    sampleContext: function () {
      return {
        company: Store.state.auditor.company || 'HomSci Pro',
        brandIcon: icon('bolt'),
        today: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
        assessmentDate: new Date().toISOString().slice(0, 10),
        auditor: Store.state.auditor,
        customer: { name: 'Sample Customer', address: '123 Maple Street, Springfield', phone: '(555) 010-0199', email: 'sample@example.com' },
        site: { sqft: 2450, yearBuilt: 1962, stories: 2, bedrooms: 4 },
        ashrae: { target: 68 },
        tests: {
          cfm50: 2340, co2: 1180,
          iaq: [
            { name: 'Carbon Dioxide', value: 1180, unit: 'ppm', band: 'Elevated' },
            { name: 'Relative Humidity', value: 52, unit: '%RH', band: 'Optimal' },
            { name: 'Chemicals (VOC)', value: 310, unit: 'µg/m³', band: 'Moderate' }
          ]
        },
        measures: [
          {
            name: 'Attic Insulation Top-Up', desc: 'Bring the attic from R-13 to R-49 with loose-fill cellulose after air sealing the attic floor.',
            descShort: 'Bring the attic from R-13 to R-49 with loose-fill cellulose after air sealing the attic floor.',
            notes: '', cost: 2940, costFmt: money(2940), base: 2940, baseFmt: money(2940), adjustments: [],
            savings: 420, savingsFmt: money(420), roi: 14, rebate: '',
            scienceHtml: scienceHtml('Heat rises and escapes through an under-insulated attic all winter — *conditioned air you already paid for*.'),
            benefits: ['Even room temperatures', 'Lower heating bills'],
            benefitsJoined: 'Even room temperatures · Lower heating bills'
          },
          {
            name: 'Whole-Home Air Sealing', desc: 'Seal the leaks the blower door found — top plates, penetrations, and the attic hatch.',
            descShort: 'Seal the leaks the blower door found — top plates, penetrations, and the attic hatch.',
            notes: '', cost: 1100, costFmt: money(1100), base: 1100, baseFmt: money(1100), adjustments: [],
            savings: 260, savingsFmt: money(260), roi: 24, rebate: '',
            scienceHtml: scienceHtml('Your blower-door number puts real leakage at about *a window left open year-round*.'),
            benefits: ['Fewer drafts', 'Quieter home'],
            benefitsJoined: 'Fewer drafts · Quieter home'
          }
        ],
        fin: {
          cost: 4040, costFmt: money(4040),
          savings: 680, savingsFmt: money(680),
          payback: 5.9, paybackFmt: '5.9 yrs',
          breakeven: 6,
          netGain20Fmt: money(680 * 20 - 4040),
          upcharge: 0, upchargeFmt: '',
          crawlMinClearance: DATA.CRAWL_MIN_CLEARANCE_IN,
          rebateList: '',
          marketPayback: DATA.MARKET_AVG_PAYBACK_YEARS,
          aheadYears: Math.round((DATA.MARKET_AVG_PAYBACK_YEARS - 5.9) * 10) / 10
        },
        energy: null,
        photos: []
      };
    },

    /* Token reference shown in the template editor. */
    TOKENS: [
      ['{{company}} · {{today}} · {{assessmentDate}}', 'Brand name, today’s date, field-visit date'],
      ['{{customer.name}} · {{customer.address}} · {{customer.phone}} · {{customer.email}}', 'Customer details'],
      ['{{auditor.name}}', 'Field auditor name (Settings)'],
      ['{{site.sqft}} · {{site.yearBuilt}} · {{site.stories}} · {{site.bedrooms}}', 'Site parameters'],
      ['{{ashrae.target}}', 'ASHRAE 62.2 target CFM (if computed)'],
      ['{{tests.cfm50}} · {{tests.co2}}', 'Blower-door CFM50 and CO₂ baseline'],
      ['{{#each tests.iaq}} {{name}} {{value}} {{unit}} {{band}} {{/each}}', 'All entered IAQ metrics'],
      ['{{fin.costFmt}} · {{fin.savingsFmt}} · {{fin.paybackFmt}}', 'Totals for the checked measures'],
      ['{{fin.breakeven}} · {{fin.netGain20Fmt}} · {{fin.rebateList}}', 'Breakeven year, 20-yr gain, rebate list'],
      ['{{fin.upchargeFmt}} · {{fin.marketPayback}} · {{fin.aheadYears}}', 'Upcharge, market payback, years ahead'],
      ['{{#each measures}} … {{/each}}', 'One block per checked improvement'],
      [' {{name}} {{desc}} {{descShort}} {{notes}}', 'Measure name, description, scope notes'],
      [' {{costFmt}} {{savingsFmt}} {{roi}} {{rebate}}', 'Measure financials'],
      [' {{baseFmt}} · {{#each adjustments}} {{label}} {{amountFmt}} {{/each}}', 'Base cost and audit-driven pricing adjustments'],
      [' {{{scienceHtml}}} · {{benefitsJoined}}', 'Science paragraph (HTML) and benefits'],
      ['{{#each photos}} {{url}} {{label}} {{ref}} {{tags}} {{@num}} {{/each}}', 'Selected site photos (ref = required-slot ID, tags = media tags)'],
      ['{{#if energy}} {{energy.location}} {{energy.hdd}} {{energy.totalCostFmt}} {{energy.pctOfSpend}} {{/if}}', 'Energy model (when run)'],
      ['{{#if x}} … {{else}} … {{/if}}', 'Show content only when a value exists']
    ]
  };

  /* ---------------- Default proposal template ---------------- */
  Proposal.DEFAULT_TEMPLATE = [
'<section class="pd-page">',
'  <div class="pd-brand"><span class="logo">{{{brandIcon}}}</span> {{company}}</div>',
'  <div class="pd-kicker">Home Performance Proposal</div>',
'  <h1>A healthier, more efficient home.</h1>',
'  <div class="pd-meta">Prepared for <b>{{customer.name}}</b><br>',
'    {{customer.address}}<br>{{today}}',
'    {{#if auditor.name}}<br>Field auditor: {{auditor.name}}{{/if}}</div>',
'  <div class="pd-hero">',
'    <div><div class="hv">{{fin.costFmt}}</div><div class="hk">Total Investment</div></div>',
'    <div><div class="hv">{{fin.savingsFmt}}</div><div class="hk">Savings / Year</div></div>',
'    <div><div class="hv">{{fin.paybackFmt}}</div><div class="hk">Simple Payback</div></div>',
'  </div>',
'  <p style="font-size:13.5px;color:var(--muted)">This proposal is based on a whole-home diagnostic assessment of your property{{#if tests.cfm50}}, including a calibrated blower-door test ({{tests.cfm50}} CFM50){{/if}}{{#if tests.co2}} and an indoor air quality baseline ({{tests.co2}} ppm CO₂){{/if}}. Each recommended improvement below includes what it costs, what it saves, and why it matters for your home.</p>',
'  {{#if fin.aheadYears}}<p style="font-size:13.5px;color:var(--green);font-weight:700">Your plan pays for itself {{fin.aheadYears}} years ahead of the market average ({{fin.marketPayback}} years).</p>{{/if}}',
'  {{#if energy}}<p style="font-size:13.5px;color:var(--muted)">Using a full year of local weather data for <b>{{energy.location}}</b> ({{energy.hdd}} heating degree days), we model your current energy spend at <b>{{energy.totalCostFmt}} per year</b>{{#if energy.pctOfSpend}} — this plan addresses about <b style="color:var(--green)">{{energy.pctOfSpend}}%</b> of it{{/if}}.</p>{{/if}}',
'</section>',
'',
'<section class="pd-page">',
'  <div class="pd-brand"><span class="logo">{{{brandIcon}}}</span> {{company}}</div>',
'  <h2>Your Investment</h2>',
'  <table class="pd-table"><thead><tr><th>Improvement</th><th style="text-align:right">Cost</th><th style="text-align:right">Saves</th></tr></thead><tbody>',
'  {{#each measures}}<tr><td><b>{{name}}</b><br><span style="color:var(--muted)">{{descShort}}</span>{{#if notes}}<br><span style="color:var(--muted);font-style:italic">Scope: {{notes}}</span>{{/if}}</td><td class="num">{{costFmt}}</td><td class="num" style="color:var(--green)">{{savingsFmt}}/yr</td></tr>{{/each}}',
'  {{#if fin.upchargeFmt}}<tr><td><b>Restricted-access labor</b><br><span style="color:var(--muted)">Crawlspace clearance below {{fin.crawlMinClearance}}&quot; requires premium labor rates.</span></td><td class="num">{{fin.upchargeFmt}}</td><td class="num">—</td></tr>{{/if}}',
'  <tr class="total"><td>Total</td><td class="num">{{fin.costFmt}}</td><td class="num">{{fin.savingsFmt}}/yr</td></tr>',
'  </tbody></table>',
'  {{#if fin.breakeven}}<p style="font-size:13px;color:var(--muted)">Cumulative savings overtake the investment in <b>Year {{fin.breakeven}}</b>. Projected 20-year net gain: <b style="color:var(--green)">{{fin.netGain20Fmt}}</b> (at current utility rates, before rebates).</p>{{/if}}',
'  {{#if fin.rebateList}}<p style="font-size:13px;color:var(--muted)">Rebate-eligible measures: {{fin.rebateList}}. We will handle the paperwork.</p>{{/if}}',
'</section>',
'',
'<section class="pd-page">',
'  <div class="pd-brand"><span class="logo">{{{brandIcon}}}</span> {{company}}</div>',
'  <h2>Why Each Improvement Matters</h2>',
'  {{#each measures}}',
'  <div class="pd-measure"><h3>{{name}}<span class="cost">{{costFmt}}</span></h3>',
'    <p>{{desc}}</p>',
'    <div class="why"><b>The building science:</b> {{{scienceHtml}}}</div>',
'    <div class="why" style="background:var(--surface-2)"><b style="color:var(--ink)">You will notice:</b> {{benefitsJoined}}</div>',
'  </div>',
'  {{/each}}',
'</section>',
'',
'{{#if photos}}<section class="pd-page">',
'  <div class="pd-brand"><span class="logo">{{{brandIcon}}}</span> {{company}}</div>',
'  <h2>What We Found In Your Home</h2>',
'  <p style="font-size:13px;color:var(--muted)">Photos captured during your assessment on {{assessmentDate}}.</p>',
'  <div class="pd-gallery">{{#each photos}}<figure><img src="{{url}}" alt="{{label}}"><figcaption>Fig {{@num}}: {{label}}{{#if ref}} <span class="pd-ref">{{ref}}</span>{{/if}}</figcaption></figure>{{/each}}</div>',
'</section>{{/if}}',
'',
'<section class="pd-page">',
'  <div class="pd-brand"><span class="logo">{{{brandIcon}}}</span> {{company}}</div>',
'  <h2>Next Steps</h2>',
'  <p style="font-size:13.5px;color:var(--muted)">Accepting this proposal reserves your place on our installation calendar. Savings estimates are based on your home’s measured performance and current utility rates; actual results vary with weather and occupancy. Pricing is valid for 30 days from the date above. Rebate values depend on program availability at the time of installation.</p>',
'  <div class="pd-sign"><div>Homeowner signature / date</div><div>{{company}} representative / date</div></div>',
'  <p class="pd-fineprint">Prepared with {{company}} field diagnostics. Assessment data — including blower-door depressurization, combustion safety hard-stops, and indoor air quality baselines — is retained in your audit record and available on request.</p>',
'</section>'
  ].join('\n');
})();
