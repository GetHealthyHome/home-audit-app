/* Admin portal support: company-configurable content that overlays the
   shipped defaults in DATA. Everything lives in Store.state.admin:
     catalog      — full improvement-measure list (null = use DATA.CATALOG)
     pricingRules — cost adjustments driven by audit answers
     prompts      — editable audit prompts (null = use DATA defaults)
   Config is device-local; Export/Import moves it between crew devices. */
(function () {

  function ensureAdmin() {
    var s = Store.state;
    if (!s.admin) s.admin = {};
    if (!s.admin.pricingRules) s.admin.pricingRules = [];
    return s.admin;
  }

  window.Admin = {
    ensure: ensureAdmin,

    /* Seed the editable catalog from defaults on first entry. */
    ensureCatalog: function () {
      var a = ensureAdmin();
      if (!a.catalog) {
        a.catalog = JSON.parse(JSON.stringify(DATA.CATALOG));
        Store.save();
      }
      return a.catalog;
    },

    /* Seed the editable materials catalog from defaults on first entry. */
    ensureMaterials: function () {
      var a = ensureAdmin();
      if (!a.materials) {
        a.materials = JSON.parse(JSON.stringify(DATA.MATERIALS));
        Store.save();
      }
      return a.materials;
    },

    addMaterial: function () {
      var mats = Admin.ensureMaterials();
      var m = { id: Store.uid('mat'), name: 'New Material', unit: 'sqft', cost: '', qty: 'site.sqft' };
      mats.push(m);
      Store.save();
      return m;
    },

    /* Assessment quantities a material can price against: numeric audit
       fields plus computed counts (calc:*). */
    QTY_FIELDS: [
      { id: 'site.sqft', label: 'Home: Conditioned SqFt' },
      { id: 'zones.attic.fields.sqft', label: 'Attic: Area (sqft)' },
      { id: 'zones.crawlspace.fields.sqft', label: 'Crawlspace: Area (sqft)' },
      { id: 'zones.crawlspace.fields.ventQty', label: 'Crawlspace: Vent Count' },
      { id: 'site.bedrooms', label: 'Bedroom Count' },
      { id: 'calc:windows', label: 'Window Count (all floors)' },
      { id: 'calc:mechanicals', label: 'Mechanical Systems Count' }
    ],
    MATERIAL_UNITS: [
      { id: 'sqft', label: 'Per square foot' },
      { id: 'each', label: 'Per piece / each' },
      { id: 'flat', label: 'Flat amount' }
    ],
    qtyLabel: function (ref) {
      var q = Admin.QTY_FIELDS.filter(function (x) { return x.id === ref; })[0];
      return q ? q.label : ref;
    },

    /* Media settings: photo stamping + the tag list offered after capture.
       tags is a one-per-line string (same pattern as prompts.motivations). */
    ensureMedia: function () {
      var a = ensureAdmin();
      if (!a.media) {
        a.media = { stamp: false, tags: DATA.MEDIA_TAGS.join('\n') };
        Store.save();
      }
      return a.media;
    },

    /* Seed the editable diagnostics guides from defaults on first entry. */
    ensureGuides: function () {
      var a = ensureAdmin();
      if (!a.guides) {
        a.guides = JSON.parse(JSON.stringify(DATA.TEST_GUIDES));
        Store.save();
      }
      return a.guides;
    },

    resetGuide: function (id) {
      var guides = Admin.ensureGuides();
      var def = DATA.TEST_GUIDES.filter(function (g) { return g.id === id; })[0];
      if (!def) return;
      for (var i = 0; i < guides.length; i++) {
        if (guides[i].id === id) guides[i] = JSON.parse(JSON.stringify(def));
      }
      Store.save();
    },

    ensurePrompts: function () {
      var a = ensureAdmin();
      if (!a.prompts) {
        a.prompts = {
          motivations: DATA.MOTIVATIONS.join('\n'),
          heatTypes: DATA.HEAT_TYPES.join('\n'),
          blowerChecklist: JSON.parse(JSON.stringify(DATA.BLOWER_CHECKLIST)),
          cazTests: JSON.parse(JSON.stringify(DATA.CAZ_TESTS))
        };
        Store.save();
      }
      return a.prompts;
    },

    resetPrompts: function (key) {
      var a = ensureAdmin();
      if (!a.prompts) return;
      if (!key) { a.prompts = null; }
      else if (key === 'motivations') a.prompts.motivations = DATA.MOTIVATIONS.join('\n');
      else if (key === 'heatTypes') a.prompts.heatTypes = DATA.HEAT_TYPES.join('\n');
      else if (key === 'blowerChecklist') a.prompts.blowerChecklist = JSON.parse(JSON.stringify(DATA.BLOWER_CHECKLIST));
      else if (key === 'cazTests') a.prompts.cazTests = JSON.parse(JSON.stringify(DATA.CAZ_TESTS));
      Store.save();
    },

    addMeasure: function () {
      var cat = Admin.ensureCatalog();
      var m = {
        id: Store.uid('m'), cat: 'Attic & Insulation', name: 'New Measure', icon: 'bolt',
        impact: 'Quick Win', roi: '', cost: '', savings: '', rebate: '',
        desc: '', science: '', benefits: []
      };
      cat.push(m);
      Store.save();
      return m;
    },

    addRule: function () {
      var a = ensureAdmin();
      var r = {
        id: Store.uid('rule'), measureId: '*', label: '',
        field: 'site.sqft', op: 'gt', value: '',
        adjustType: 'flat', amount: ''
      };
      a.pricingRules.push(r);
      Store.save();
      return r;
    },

    /* Audit fields offered as pricing-rule conditions. Any Store.get path
       against the evaluation works; these are the curated common ones. */
    FIELDS: [
      { path: 'site.sqft', label: 'Site: Square Footage', num: true },
      { path: 'site.yearBuilt', label: 'Site: Year Built', num: true },
      { path: 'site.stories', label: 'Site: Stories' },
      { path: 'site.bedrooms', label: 'Site: Bedrooms', num: true },
      { path: 'intake.heatType', label: 'Intake: Heating System Type' },
      { path: 'intake.motivation', label: 'Intake: Primary Motivation' },
      { path: 'tests.blower.cfm50', label: 'Blower Door: CFM50', num: true },
      { path: 'tests.iaq.co2', label: 'IAQ: CO2 (ppm)', num: true },
      { path: 'tests.iaq.rh', label: 'IAQ: Relative Humidity', num: true },
      { path: 'zones.attic.fields.insulationType', label: 'Attic: Insulation Type' },
      { path: 'zones.attic.fields.depth', label: 'Attic: Insulation Depth (in)', num: true },
      { path: 'zones.attic.fields.noVent', label: 'Attic: No Ventilation (checked)' },
      { path: 'zones.crawlspace.fields.clearance', label: 'Crawlspace: Clearance (in)', num: true },
      { path: 'zones.crawlspace.fields.sqft', label: 'Crawlspace: Area (sqft)', num: true },
      { path: 'zones.crawlspace.fields.vapor', label: 'Crawlspace: Vapor Barrier' },
      { path: 'zones.crawlspace.fields.insulation', label: 'Crawlspace: Insulation Condition' },
      { path: 'zones.basement.fields.ceiling', label: 'Basement: Ceiling Insulation' },
      { path: 'zones.exterior.fields.sidingType', label: 'Exterior: Siding Type' },
      { path: 'zones.exterior.fields.siding', label: 'Exterior: Siding Condition' },
      { path: 'zones.exterior.fields.walls', label: 'Exterior: Wall Construction' },
      { path: 'zones.mechanicals.systems.heating.type', label: 'Mechanicals: Heating Type' },
      { path: 'zones.mechanicals.systems.heating.condition', label: 'Mechanicals: Heating Condition' },
      { path: 'zones.mechanicals.systems.electrical.amperage', label: 'Mechanicals: Panel Amperage' }
    ],

    OPS: [
      { id: 'eq', label: 'equals' },
      { id: 'neq', label: 'does not equal' },
      { id: 'lt', label: 'is less than' },
      { id: 'gt', label: 'is greater than' },
      { id: 'set', label: 'has any value' }
    ],

    ADJUSTS: [
      { id: 'flat', label: 'Add flat amount ($)' },
      { id: 'persqft', label: 'Add $ per conditioned sqft' },
      { id: 'pct', label: 'Add % of base cost' }
    ],

    IMPACTS: ['Critical', 'High Impact', 'Elite', 'Quick Win', 'Comfort', 'Health'],
    ICONS: ['home', 'wind', 'air', 'box', 'layers', 'droplet', 'window', 'thermo', 'bolt', 'flame', 'fan', 'heater', 'shield', 'sparkle'],

    fieldLabel: function (path) {
      var f = Admin.FIELDS.filter(function (x) { return x.path === path; })[0];
      return f ? f.label : path;
    },

    opLabel: function (op) {
      var o = Admin.OPS.filter(function (x) { return x.id === op; })[0];
      return o ? o.label : op;
    },

    /* Does this rule's condition hold for the evaluation? */
    ruleMatches: function (rule, ev, measureId) {
      if (rule.measureId !== '*' && rule.measureId !== measureId) return false;
      return Admin.condMatches(rule, ev);
    },

    /* A bare condition ({field, op, value}) against the evaluation — shared
       by pricing rules and per-measure suggestion rules. */
    condMatches: function (cond, ev) {
      if (!cond.field) return false;
      var v = Store.get(ev, cond.field);
      var isSet = v != null && v !== '' && v !== false;
      switch (cond.op) {
        case 'set': return isSet;
        case 'eq': return isSet && String(v).trim().toLowerCase() === String(cond.value).trim().toLowerCase();
        case 'neq': return isSet && String(v).trim().toLowerCase() !== String(cond.value).trim().toLowerCase();
        case 'lt': return isSet && !isNaN(parseFloat(v)) && parseFloat(v) < parseFloat(cond.value);
        case 'gt': return isSet && !isNaN(parseFloat(v)) && parseFloat(v) > parseFloat(cond.value);
        default: return false;
      }
    },

    condDescribe: function (cond) {
      return Admin.fieldLabel(cond.field) + ' ' + Admin.opLabel(cond.op) +
        (cond.op === 'set' ? '' : ' “' + (cond.value || '—') + '”');
    },

    /* Dollar amount this rule adds for a measure with the given base cost. */
    ruleAmount: function (rule, ev, baseCost) {
      var amt = parseFloat(rule.amount) || 0;
      if (rule.adjustType === 'persqft') return Math.round(amt * (parseFloat(ev.site.sqft) || 0));
      if (rule.adjustType === 'pct') return Math.round(baseCost * amt / 100);
      return Math.round(amt);
    },

    ruleTargetName: function (rule) {
      if (rule.measureId === '*') return 'any measure';
      var m = Store.measure(rule.measureId);
      return m ? m.name : 'a deleted measure';
    },

    describeRule: function (rule) {
      var adj = rule.adjustType === 'persqft' ? '$' + (rule.amount || '0') + ' / sqft'
        : rule.adjustType === 'pct' ? (rule.amount || '0') + '% of base cost'
        : '$' + (rule.amount || '0');
      var cond = Admin.fieldLabel(rule.field) + ' ' + Admin.opLabel(rule.op) +
        (rule.op === 'set' ? '' : ' “' + (rule.value || '—') + '”');
      return 'When ' + cond + ' → add ' + adj + ' to ' + Admin.ruleTargetName(rule);
    },

    /* ---------- Config export / import (move setup between devices) ---------- */
    exportPayload: function () {
      return {
        homsci_config: 1,
        exportedAt: new Date().toISOString(),
        admin: Store.state.admin || null,
        proposalTemplate: Store.state.proposalTemplate || null
      };
    },

    importConfig: function (text) {
      var data = JSON.parse(text);
      if (!data || data.homsci_config !== 1) throw new Error('Not a HomSci config export.');
      if (data.admin !== undefined) Store.state.admin = data.admin || undefined;
      if (data.proposalTemplate) Store.state.proposalTemplate = data.proposalTemplate;
      else delete Store.state.proposalTemplate;
      ensureAdmin();
      Store.save();
    },

    /* ---------- Bulk CSV templates ----------
       Each admin section round-trips through a spreadsheet: Download
       Template gives the current data as CSV with the right headers, the
       admin edits it in Excel/Sheets, and Upload replaces the section.
       Lists inside a cell use "; " (benefits, materials); suggest-when
       conditions are "field|op|value" triples separated by "; ". */
    CSV_HEADERS: {
      crew: ['email', 'name', 'role', 'temp_password'],
      catalog: ['id', 'category', 'name', 'icon', 'impact', 'flat_cost', 'materials', 'description', 'science', 'benefits', 'suggest_when'],
      materials: ['id', 'name', 'unit', 'cost_per_unit', 'quantity_from'],
      prompts: ['section', 'id', 'name', 'description'],
      pricing: ['id', 'rule_name', 'measure', 'field', 'op', 'value', 'adjust_type', 'amount'],
      guides: ['guide', 'entry', 'order', 'text', 'photo_or_pdf_url']
    },

    csvTemplate: function (section) {
      var H = Admin.CSV_HEADERS[section];
      var rows = [H.slice()];
      if (section === 'crew') {
        var roster = (window.CrewCache && CrewCache.list) || [];
        if (roster.length) {
          roster.forEach(function (u) { rows.push([u.email || '', u.name || '', u.role || 'auditor', '']); });
        }
        rows.push(['new.tech@example.com', 'Alex Example', 'auditor', 'TempPass-123']);
      } else if (section === 'catalog') {
        Store.catalog().forEach(function (m) {
          rows.push([m.id, m.cat || '', m.name || '', m.icon || 'bolt', m.impact || '',
            m.cost == null ? '' : m.cost,
            (m.materials || []).join('; '),
            m.desc || '', m.science || '',
            Store.measureBenefits(m).join('; '),
            (m.suggest || []).map(function (c) { return c.field + '|' + c.op + '|' + (c.value == null ? '' : c.value); }).join('; ')]);
        });
      } else if (section === 'materials') {
        Store.materials().forEach(function (m) {
          rows.push([m.id, m.name || '', m.unit || 'sqft', m.cost == null ? '' : m.cost, m.qty || '']);
        });
      } else if (section === 'prompts') {
        Store.prompts('motivations').forEach(function (s) { rows.push(['motivation', '', s, '']); });
        Store.prompts('heatTypes').forEach(function (s) { rows.push(['heat_type', '', s, '']); });
        Store.prompts('blowerChecklist').forEach(function (c) { rows.push(['blower_check', c.id, c.name, c.desc || '']); });
        Store.prompts('cazTests').forEach(function (t) { rows.push(['caz_test', t.id, t.name, t.desc || '']); });
      } else if (section === 'pricing') {
        Store.pricingRules().forEach(function (r) {
          rows.push([r.id, r.name || '', r.measureId || '*', r.field || '', r.op || 'set',
            r.value == null ? '' : r.value, r.adjustType || 'flat', r.amount == null ? '' : r.amount]);
        });
        if (Store.pricingRules().length === 0) {
          rows.push(['', 'Example: big-home labor', '*', 'site.sqft', 'gt', '3000', 'flat', '250']);
        }
      } else if (section === 'guides') {
        Store.guides().forEach(function (g) {
          rows.push([g.id, 'intro', '', g.intro || '', '']);
          rows.push([g.id, 'pdf', '', '', g.pdf || '']);
          (g.steps || []).forEach(function (s, i) {
            rows.push([g.id, 'step', i + 1, s.text || '', s.photo || '']);
          });
        });
      }
      return CSVX.stringify(rows);
    },

    /* Parse an uploaded CSV and replace the section. Throws with a
       row-numbered message on bad input; nothing is written on failure.
       Crew is handled by the caller (rows become async account calls). */
    csvImport: function (section, text) {
      var H = Admin.CSV_HEADERS[section];
      var rows = CSVX.parse(text);
      if (!rows.length) throw new Error('The file is empty.');
      var header = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
      for (var hi = 0; hi < H.length; hi++) {
        if (header[hi] !== H[hi]) {
          throw new Error('Wrong template — expected column ' + (hi + 1) + ' to be "' + H[hi] + '" (found "' + (header[hi] || 'nothing') + '"). Download the template for this section and edit that file.');
        }
      }
      var body = rows.slice(1);
      function cell(r, i) { return String(r[i] == null ? '' : r[i]).trim(); }
      function splitList(s) {
        return s ? s.split(';').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      }
      function oneOf(val, list, row, what) {
        if (list.indexOf(val) < 0) throw new Error('Row ' + row + ': ' + what + ' must be one of ' + list.join(', ') + ' (found "' + val + '").');
        return val;
      }
      var opIds = Admin.OPS.map(function (o) { return o.id; });

      if (section === 'crew') {
        return body.map(function (r, i) {
          var email = cell(r, 0);
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Row ' + (i + 2) + ': "' + email + '" is not a valid email.');
          return {
            email: email, name: cell(r, 1),
            role: oneOf(cell(r, 2) || 'auditor', ['auditor', 'admin'], i + 2, 'role'),
            password: cell(r, 3)
          };
        });
      }

      var a = ensureAdmin();

      if (section === 'catalog') {
        var oldCat = Store.catalog();
        a.catalog = body.map(function (r, i) {
          var row = i + 2;
          if (!cell(r, 2)) throw new Error('Row ' + row + ': every measure needs a name.');
          var id = cell(r, 0) || Store.uid('m');
          var prev = oldCat.filter(function (m) { return m.id === id; })[0];
          var m = prev ? JSON.parse(JSON.stringify(prev)) : {};
          m.id = id;
          m.cat = cell(r, 1) || 'Uncategorized';
          m.name = cell(r, 2);
          m.icon = cell(r, 3) || 'bolt';
          m.impact = cell(r, 4);
          m.cost = cell(r, 5) === '' ? '' : parseFloat(cell(r, 5));
          if (cell(r, 5) !== '' && isNaN(m.cost)) throw new Error('Row ' + row + ': flat_cost must be a number.');
          m.materials = splitList(cell(r, 6));
          m.desc = cell(r, 7);
          m.science = cell(r, 8);
          m.benefits = splitList(cell(r, 9));
          m.suggest = splitList(cell(r, 10)).map(function (s) {
            var parts = s.split('|');
            if (parts.length < 2) throw new Error('Row ' + row + ': suggest_when entries look like field|op|value (found "' + s + '").');
            return { field: parts[0].trim(), op: oneOf(parts[1].trim(), opIds, row, 'suggest op'), value: (parts[2] || '').trim() };
          });
          return m;
        });
      } else if (section === 'materials') {
        var oldMats = Store.materials();
        a.materials = body.map(function (r, i) {
          var row = i + 2;
          if (!cell(r, 1)) throw new Error('Row ' + row + ': every material needs a name.');
          var id = cell(r, 0) || Store.uid('mat');
          var prev = oldMats.filter(function (m) { return m.id === id; })[0];
          var m = prev ? JSON.parse(JSON.stringify(prev)) : {};
          m.id = id;
          m.name = cell(r, 1);
          m.unit = oneOf(cell(r, 2) || 'sqft', ['sqft', 'each', 'flat'], row, 'unit');
          m.cost = cell(r, 3) === '' ? '' : parseFloat(cell(r, 3));
          if (cell(r, 3) !== '' && isNaN(m.cost)) throw new Error('Row ' + row + ': cost_per_unit must be a number.');
          if (m.unit === 'flat') delete m.qty; else m.qty = cell(r, 4) || 'site.sqft';
          return m;
        });
      } else if (section === 'prompts') {
        var p = { motivations: [], heatTypes: [], blowerChecklist: [], cazTests: [] };
        var oldCaz = Store.prompts('cazTests');
        body.forEach(function (r, i) {
          var row = i + 2;
          var sec = oneOf(cell(r, 0), ['motivation', 'heat_type', 'blower_check', 'caz_test'], row, 'section');
          var name = cell(r, 2);
          if (!name) throw new Error('Row ' + row + ': the name column is required.');
          if (sec === 'motivation') p.motivations.push(name);
          else if (sec === 'heat_type') p.heatTypes.push(name);
          else if (sec === 'blower_check') p.blowerChecklist.push({ id: cell(r, 1) || Store.uid('chk'), name: name, desc: cell(r, 3) });
          else {
            var prevT = oldCaz.filter(function (t) { return t.id === cell(r, 1); })[0];
            p.cazTests.push({ id: cell(r, 1) || Store.uid('caz'), name: name, icon: (prevT && prevT.icon) || 'shield', desc: cell(r, 3) });
          }
        });
        if (!p.motivations.length || !p.heatTypes.length) throw new Error('The file needs at least one motivation row and one heat_type row.');
        a.prompts = {
          motivations: p.motivations.join('\n'),
          heatTypes: p.heatTypes.join('\n'),
          blowerChecklist: p.blowerChecklist,
          cazTests: p.cazTests
        };
      } else if (section === 'pricing') {
        a.pricingRules = body.map(function (r, i) {
          var row = i + 2;
          if (!cell(r, 3)) throw new Error('Row ' + row + ': every rule needs a field path.');
          return {
            id: cell(r, 0) || Store.uid('rule'),
            name: cell(r, 1) || 'Imported rule',
            measureId: cell(r, 2) || '*',
            field: cell(r, 3),
            op: oneOf(cell(r, 4) || 'set', opIds, row, 'op'),
            value: cell(r, 5),
            adjustType: oneOf(cell(r, 6) || 'flat', ['flat', 'persqft', 'pct'], row, 'adjust_type'),
            amount: cell(r, 7)
          };
        });
      } else if (section === 'guides') {
        var guides = JSON.parse(JSON.stringify(Store.guides()));
        var ids = guides.map(function (g) { return g.id; });
        var touched = {};
        var steps = {};
        body.forEach(function (r, i) {
          var row = i + 2;
          var gid = oneOf(cell(r, 0), ids, row, 'guide');
          var g = guides.filter(function (x) { return x.id === gid; })[0];
          var entry = oneOf(cell(r, 1), ['intro', 'pdf', 'step'], row, 'entry');
          if (!touched[gid]) { touched[gid] = true; g.intro = ''; g.pdf = ''; steps[gid] = []; }
          if (entry === 'intro') g.intro = cell(r, 3);
          else if (entry === 'pdf') g.pdf = cell(r, 4);
          else steps[gid].push({ order: parseFloat(cell(r, 2)) || steps[gid].length + 1, text: cell(r, 3), photo: cell(r, 4) });
        });
        Object.keys(steps).forEach(function (gid) {
          var g = guides.filter(function (x) { return x.id === gid; })[0];
          g.steps = steps[gid].sort(function (x, y) { return x.order - y.order; })
            .map(function (s) { return { text: s.text, photo: s.photo }; });
        });
        a.guides = guides;
      }
      Store.save();
      return { count: body.length };
    }
  };
})();
