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
    }
  };
})();
