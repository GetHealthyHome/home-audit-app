/* Admin Portal screens: hub, improvement catalog manager, pricing rules,
   audit prompts, and config export/import. All edits write straight into
   Store.state.admin via data-bind (auto-saved to this device). */
(function () {
  var esc = UI.esc;

  /* ---------------- Admin hub ---------------- */
  window.ScreenAdmin = function () {
    var a = Admin.ensure();
    var catalogN = Store.catalog().length;
    var customCatalog = !!a.catalog;
    var rulesN = Store.pricingRules().length;
    var customPrompts = !!a.prompts;

    function navCard(route, iconName, title, sub, pill) {
      return '<button class="module-row" data-action="nav" data-route="' + route + '">' +
        '<span class="mic">' + icon(iconName) + '</span>' +
        '<span class="mbody"><b>' + esc(title) + '</b>' + pill +
        '<span style="display:block;font:600 11px var(--font-body);color:var(--faint);margin-top:4px">' + esc(sub) + '</span></span>' +
        '<span class="chev">' + icon('chevR') + '</span></button>';
    }

    return UI.subbar('Admin Portal', '#/settings') +
      '<div class="screen">' +
      '<span class="eyebrow magenta">' + icon('shield') + ' Company Configuration</span>' +
      '<h1 class="screen-title">Admin Portal</h1>' +
      '<p class="screen-sub">Configure what your auditors see and sell: the improvement catalog, audit-driven pricing, audit prompts, and the proposal design.</p>' +

      (Backend.ready() ?
        navCard('#/admin/crew', 'user', 'Crew Accounts',
          'Create sign-ins, assign admin/auditor roles, reset passwords',
          UI.pill('magenta', 'Cloud')) : '') +
      navCard('#/admin/catalog', 'layers', 'Improvement Catalog',
        catalogN + ' measures — names, costs, savings, science copy',
        UI.pill(customCatalog ? 'progress' : 'complete', customCatalog ? 'Customized' : 'Default')) +
      navCard('#/admin/materials', 'box', 'Materials Catalog',
        'Unit costs (per sqft / per piece / flat) that build measure prices from assessment quantities',
        UI.pill(a.materials ? 'progress' : 'complete', a.materials ? 'Customized' : 'Default')) +
      navCard('#/admin/pricing', 'calc', 'Pricing Rules',
        'Adjust measure costs from audit answers (sqft, selects, tests)',
        UI.pill(rulesN ? 'progress' : 'pending', rulesN ? rulesN + ' active' : 'None yet')) +
      navCard('#/admin/prompts', 'clipboard', 'Audit Prompts',
        'Motivations, heat types, blower checklist, CAZ wording',
        UI.pill(customPrompts ? 'progress' : 'complete', customPrompts ? 'Customized' : 'Default')) +
      navCard('#/template', 'edit', 'Proposal Template',
        'The HTML design customer proposals are generated from',
        UI.pill(Store.state.proposalTemplate ? 'progress' : 'complete', Store.state.proposalTemplate ? 'Customized' : 'Default')) +

      '<div class="card" style="margin-top:16px">' + UI.sectionHeading('Config Transfer', 'export') +
      '<p class="hint">Configuration is stored on this device. Export it as a file and import it on each crew device to keep everyone selling from the same catalog and pricing.</p>' +
      '<div class="btn-row" style="margin:10px 0 0">' +
      '<button class="btn small secondary" data-action="admin-export">' + icon('export') + ' Export Config</button>' +
      '<button class="btn small secondary" data-action="admin-import">Import Config</button>' +
      '</div>' +
      '<input type="file" id="admin-import-file" accept="application/json,.json" style="display:none">' +
      '</div>' +
      '</div>';
  };

  /* ---------------- Access gate ---------------- */
  window.ScreenAdminLocked = function () {
    var sess = Auth.session();
    return UI.subbar('Admin', '#/settings') +
      '<div class="screen"><div class="empty" style="padding-top:70px">' + icon('lock') +
      '<b>Admin access required</b>' +
      (sess
        ? '<p>Signed in as ' + esc(sess.user.email) + ' (' + esc(Auth.role() || 'auditor') + ').<br>Ask a company admin to grant you the admin role in Crew Accounts.</p>'
        : '<p>Sign in with an admin account to configure the catalog, pricing, prompts and proposal template.</p>' +
          '<button class="btn primary" style="max-width:280px;margin:16px auto 0" data-action="nav" data-route="#/login">Sign In</button>') +
      '</div></div>';
  };

  /* ---------------- Crew accounts (cloud) ---------------- */
  window.CrewCache = { list: null, loading: false, error: null };
  window.ScreenAdminCrew = function () {
    if (!Backend.ready()) {
      return UI.subbar('Crew Accounts', '#/admin') +
        '<div class="screen"><div class="empty">' + icon('user') + '<b>No backend configured</b><p>Crew accounts need the Supabase backend (js/config.js).</p></div></div>';
    }
    if (!CrewCache.list && !CrewCache.loading && !CrewCache.error) {
      CrewCache.loading = true;
      Backend.profiles().then(function (rows) {
        CrewCache.list = rows || [];
        CrewCache.loading = false;
        window.rerender();
      }).catch(function (e) {
        CrewCache.loading = false;
        CrewCache.error = e.message === 'SIGN_IN_REQUIRED' ? 'Sign in to load crew accounts.' : e.message;
        window.rerender();
      });
    }

    var me = Auth.session() && Auth.session().user.id;
    var rows = (CrewCache.list || []).map(function (p) {
      var self = p.id === me;
      return '<div class="card" style="padding:14px">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
        '<div style="min-width:0"><b>' + esc(p.name || p.email.split('@')[0]) + (self ? ' <span style="color:var(--muted);font-weight:600">(you)</span>' : '') + '</b>' +
        '<div style="font:600 12px var(--font-body);color:var(--muted);overflow-wrap:anywhere">' + esc(p.email) + '</div></div>' +
        UI.pill(p.role === 'admin' ? 'magenta' : 'progress', p.role) + '</div>' +
        '<div class="btn-row" style="margin:12px 0 0">' +
        '<button class="btn small secondary" data-action="crew-role" data-uid="' + esc(p.id) + '" data-role="' + (p.role === 'admin' ? 'auditor' : 'admin') + '"' + (self && p.role === 'admin' ? ' disabled' : '') + '>' +
        (p.role === 'admin' ? 'Make Auditor' : 'Make Admin') + '</button>' +
        '<button class="btn small secondary" data-action="crew-passwd" data-uid="' + esc(p.id) + '">Reset Password</button>' +
        '<button class="btn small danger-ghost" data-action="crew-remove" data-uid="' + esc(p.id) + '"' + (self ? ' disabled' : '') + '>Remove</button>' +
        '</div></div>';
    }).join('');

    return UI.subbar('Crew Accounts', '#/admin',
        '<button class="iconbtn" data-action="crew-refresh" aria-label="Refresh">' + icon('sync') + '</button>') +
      '<div class="screen">' +
      '<h1 class="screen-title">Crew Accounts</h1>' +
      '<p class="screen-sub">Everyone who can sign in and sync audits. Admins can open this portal; auditors run assessments and proposals in the field.</p>' +

      '<div class="card">' + UI.sectionHeading('Add Crew Member', 'plus') +
      UI.field({ label: 'Email', bind: 'crew.email', type: 'email', placeholder: 'crew@gethealthyhome.com', value: CrewDraft.email }) +
      UI.field({ label: 'Full Name', bind: 'crew.name', placeholder: 'Their name', value: CrewDraft.name }) +
      UI.field({ label: 'Temporary Password', bind: 'crew.password', type: 'password', placeholder: 'They can change it in Settings', value: CrewDraft.password }) +
      '<div class="field"><label>Role</label>' + UI.segmented('crew.role', ['auditor', 'admin'], CrewDraft.role || 'auditor') + '</div>' +
      '<button class="btn primary" data-action="crew-create" id="crew-create-btn">Create Account</button>' +
      '</div>' +

      UI.sectionHeading('Roster', 'user', CrewCache.list ? '<span class="aux">' + CrewCache.list.length + ' accounts</span>' : '') +
      (CrewCache.loading ? '<div class="empty"><p>Loading crew…</p></div>' :
        CrewCache.error ? '<div class="empty">' + icon('alert') + '<b>Could not load crew</b><p>' + esc(CrewCache.error) + '</p></div>' :
        rows || '<div class="empty"><p>No accounts yet.</p></div>') +
      '</div>';
  };
  window.CrewDraft = {};

  /* ---------------- Materials catalog ---------------- */
  window.ScreenAdminMaterials = function () {
    var mats = Admin.ensureMaterials();
    var rows = mats.map(function (mat) {
      var sub = mat.unit === 'flat'
        ? 'flat ' + UI.money2(mat.cost)
        : UI.money2(mat.cost) + ' / ' + (mat.unit === 'each' ? 'piece' : 'sqft') + ' × ' + esc(Admin.qtyLabel(mat.qty));
      var usedBy = Store.catalog().filter(function (c) { return (c.materials || []).indexOf(mat.id) >= 0; }).length;
      return '<button class="module-row" data-action="nav" data-route="#/admin/material/' + esc(mat.id) + '">' +
        '<span class="mic">' + icon('box') + '</span>' +
        '<span class="mbody"><b>' + esc(mat.name || 'Unnamed material') + '</b>' +
        '<span style="display:block;font:600 11px var(--font-body);color:var(--faint);margin-top:4px">' + sub +
        (usedBy ? ' · used by ' + usedBy + ' measure' + (usedBy > 1 ? 's' : '') : '') + '</span></span>' +
        '<span class="chev">' + icon('chevR') + '</span></button>';
    }).join('');

    return UI.subbar('Materials', '#/admin') +
      '<div class="screen">' +
      '<h1 class="screen-title">Materials Catalog</h1>' +
      '<p class="screen-sub">Unit costs that build improvement prices. Attach materials to a measure in its editor — its base cost is then computed per audit from the assessment quantity each material reads (attic square footage, home square footage, piece counts).</p>' +
      '<button class="btn primary" data-action="admin-material-add">' + icon('plus') + ' Add Material</button>' +
      rows +
      '<div style="height:16px"></div>' +
      '<button class="btn danger-ghost" data-action="admin-materials-reset">Reset materials to defaults</button>' +
      '</div>';
  };

  /* ---------------- Material editor ---------------- */
  window.ScreenAdminMaterial = function (id) {
    var mats = Admin.ensureMaterials();
    var i = -1;
    mats.forEach(function (mat, idx) { if (mat.id === id) i = idx; });
    if (i < 0) {
      return UI.subbar('Material', '#/admin/materials') +
        '<div class="screen"><div class="empty">' + icon('box') + '<b>Material not found</b></div></div>';
    }
    var mat = mats[i];
    var b = 'admin.materials.' + i;
    var unitOpts = Admin.MATERIAL_UNITS.map(function (u) {
      return '<option value="' + u.id + '"' + (mat.unit === u.id ? ' selected' : '') + '>' + esc(u.label) + '</option>';
    }).join('');
    var qtyOpts = Admin.QTY_FIELDS.map(function (q) {
      return '<option value="' + esc(q.id) + '"' + (mat.qty === q.id ? ' selected' : '') + '>' + esc(q.label) + '</option>';
    }).join('') + (Admin.QTY_FIELDS.some(function (q) { return q.id === mat.qty; }) ? '' :
      '<option value="' + esc(mat.qty || '') + '" selected>Custom: ' + esc(mat.qty || '—') + '</option>');

    var active = Store.activeEval();
    var preview = '';
    if (active && mat.unit !== 'flat') {
      var q = Store.quantity(active, mat.qty);
      var line = q ? q + ' × ' + UI.money2(mat.cost) + ' = <b>' + UI.money(Math.round(q * (parseFloat(mat.cost) || 0))) + '</b>'
        : '<span style="color:var(--red)">no ' + esc(Admin.qtyLabel(mat.qty)) + ' recorded yet</span>';
      preview = '<div class="insight"><b>' + icon('info') + ' Against ' + esc(active.customer.name || 'the open audit') + ':</b> ' + line + '</div>';
    }

    return UI.subbar('Edit Material', '#/admin/materials') +
      '<div class="screen">' +
      '<h1 class="screen-title">' + esc(mat.name || 'New Material') + '</h1>' +
      '<p class="screen-sub">Changes save automatically and apply to every measure using this material.</p>' +
      '<div class="card">' +
      UI.field({ label: 'Name', bind: b + '.name', value: mat.name, placeholder: 'e.g. Old Insulation Removal' }) +
      '<div class="field"><label>Priced</label><select class="input" data-bind="' + b + '.unit">' + unitOpts + '</select></div>' +
      UI.field({ label: mat.unit === 'flat' ? 'Amount ($)' : 'Cost per ' + (mat.unit === 'each' ? 'piece' : 'sq. ft.') + ' ($)', bind: b + '.cost', type: 'number', inputmode: 'decimal', value: mat.cost, placeholder: mat.unit === 'each' ? '850' : '1.50' }) +
      (mat.unit === 'flat' ? '' :
        '<div class="field"><label>Quantity comes from</label><select class="input" data-bind="' + b + '.qty">' + qtyOpts + '</select></div>') +
      '</div>' +
      preview +
      '<div class="cta-dock">' +
      '<button class="btn primary" data-action="nav" data-route="#/admin/materials">Done</button>' +
      '<div style="height:8px"></div>' +
      '<button class="btn danger-ghost" data-action="admin-material-delete" data-matid="' + esc(mat.id) + '">Delete this material</button>' +
      '</div></div>';
  };

  /* ---------------- Catalog manager ---------------- */
  window.ScreenAdminCatalog = function () {
    var cat = Admin.ensureCatalog();
    var groups = {};
    cat.forEach(function (m, i) { (groups[m.cat || 'Uncategorized'] = groups[m.cat || 'Uncategorized'] || []).push({ m: m, i: i }); });

    var body = Object.keys(groups).map(function (g) {
      return '<h2 style="font:800 16px var(--font-display);color:var(--green);margin:18px 0 8px">' + esc(g) + '</h2>' +
        groups[g].map(function (x) {
          return '<button class="module-row" data-action="nav" data-route="#/admin/measure/' + esc(x.m.id) + '">' +
            '<span class="mic">' + icon(x.m.icon || 'bolt') + '</span>' +
            '<span class="mbody"><b>' + esc(x.m.name || 'Unnamed measure') + '</b>' +
            '<span style="display:block;font:600 11px var(--font-body);color:var(--faint);margin-top:4px">' +
            UI.money(parseFloat(x.m.cost) || 0) + ' · saves ' + UI.money(parseFloat(x.m.savings) || 0) + '/yr · ' + esc(x.m.impact || '—') +
            ((x.m.suggest || []).length ? ' · ' + x.m.suggest.length + ' auto-suggest rule' + (x.m.suggest.length > 1 ? 's' : '') : '') + '</span></span>' +
            '<span class="chev">' + icon('chevR') + '</span></button>';
        }).join('');
    }).join('');

    return UI.subbar('Catalog', '#/admin') +
      '<div class="screen">' +
      '<h1 class="screen-title">Improvement Catalog</h1>' +
      '<p class="screen-sub">The measures auditors can add to a plan. Changes apply to new selections immediately; audits that already priced a measure keep their manual overrides.</p>' +
      '<button class="btn primary" data-action="admin-measure-add">' + icon('plus') + ' Add Measure</button>' +
      body +
      '<div style="height:16px"></div>' +
      '<button class="btn danger-ghost" data-action="admin-catalog-reset">Reset catalog to defaults</button>' +
      '</div>';
  };

  /* ---------------- Measure editor ---------------- */
  window.ScreenAdminMeasure = function (id) {
    var cat = Admin.ensureCatalog();
    var i = -1;
    cat.forEach(function (m, idx) { if (m.id === id) i = idx; });
    if (i < 0) {
      return UI.subbar('Measure', '#/admin/catalog') +
        '<div class="screen"><div class="empty">' + icon('layers') + '<b>Measure not found</b></div></div>';
    }
    var m = cat[i];
    var b = 'admin.catalog.' + i;
    var benefitsVal = Array.isArray(m.benefits) ? m.benefits.join('\n') : (m.benefits || '');

    return UI.subbar('Edit Measure', '#/admin/catalog') +
      '<div class="screen">' +
      '<h1 class="screen-title">' + esc(m.name || 'New Measure') + '</h1>' +
      '<p class="screen-sub">Changes save automatically to this device.</p>' +

      '<div class="card">' + UI.sectionHeading('Identity', 'edit') +
      UI.field({ label: 'Name', bind: b + '.name', value: m.name, placeholder: 'e.g. Duct Sealing' }) +
      UI.field({ label: 'Category', bind: b + '.cat', value: m.cat, placeholder: 'e.g. HVAC Systems' }) +
      UI.field({ label: 'Impact Tag', bind: b + '.impact', options: Admin.IMPACTS, value: m.impact }) +
      UI.field({ label: 'Icon', bind: b + '.icon', options: Admin.ICONS, value: m.icon }) +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Cost Build-Up', 'calc') +
      '<p class="hint">Attach materials from the Materials Catalog — the measure’s base cost is computed per audit from assessment quantities (area square footage, piece counts). With no materials attached, the flat cost below is used.</p>' +
      Admin.ensureMaterials().map(function (mat) {
        var on = (m.materials || []).indexOf(mat.id) >= 0;
        var sub = mat.unit === 'flat'
          ? 'flat ' + UI.money2(mat.cost)
          : UI.money2(mat.cost) + ' / ' + (mat.unit === 'each' ? 'piece' : 'sqft') + ' × ' + esc(Admin.qtyLabel(mat.qty));
        return '<button class="check-row" data-action="admin-mat-toggle" data-mid="' + esc(m.id) + '" data-matid="' + esc(mat.id) + '">' +
          '<span class="cbox ' + (on ? 'on' : '') + '">' + (on ? icon('check') : '') + '</span>' +
          '<span class="cbody"><b>' + esc(mat.name) + '</b><span>' + sub + '</span></span>' +
          '</button>';
      }).join('') +
      (function () {
        var active = Store.activeEval();
        if (!active || !(m.materials || []).length) return '';
        var lines = Store.materialLines(active, m);
        var total = lines.reduce(function (s, l) { return s + l.cost; }, 0);
        return '<div class="insight" style="margin-top:12px"><b>' + icon('calc') + ' Priced against ' + esc(active.customer.name || 'the open audit') + ':</b><br>' +
          lines.map(function (l) {
            if (l.unit === 'flat') return esc(l.name) + ': ' + UI.money(l.cost);
            return esc(l.name) + ': ' + (l.missing
              ? '<span style="color:var(--red)">enter ' + esc(l.qtyLabel) + ' in the assessment</span>'
              : l.qty + ' × ' + UI.money2(l.unitCost) + ' = ' + UI.money(l.cost));
          }).join('<br>') +
          '<br><b>Base cost: ' + UI.money(total) + '</b></div>';
      })() +
      '<div style="height:10px"></div>' +
      UI.field({ label: 'Flat Base Cost ($) — used only when no materials are attached', bind: b + '.cost', type: 'number', inputmode: 'decimal', value: m.cost, placeholder: '2200' }) +
      '<button class="btn small secondary" data-action="nav" data-route="#/admin/materials">' + icon('layers') + ' Manage Materials Catalog</button>' +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Customer Copy', 'doc') +
      UI.field({ label: 'Description', bind: b + '.desc', textarea: true, value: m.desc, placeholder: 'What the improvement is and where it applies…' }) +
      UI.field({ label: 'Building Science (use *asterisks* to emphasize)', bind: b + '.science', textarea: true, value: m.science, placeholder: 'Why it works — shows in the Builder and proposal…' }) +
      UI.field({ label: 'Benefits (one per line)', bind: b + '.benefits', textarea: true, value: benefitsVal, placeholder: 'Reduces HVAC load\nPrevents ice damming' }) +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Suggest When', 'sparkle') +
      '<p class="hint">Conditions on data captured during the assessment — square footage, dropdown selections, test readings. When <b>any</b> condition matches an audit, this measure is surfaced under “Suggested from this assessment” in the Catalog with the reason shown.</p>' +
      (m.suggest || []).map(function (c, ci) {
        var cb = b + '.suggest.' + ci;
        var fieldOpts = Admin.FIELDS.map(function (f) {
          return '<option value="' + esc(f.path) + '"' + (c.field === f.path ? ' selected' : '') + '>' + esc(f.label) + '</option>';
        }).join('') + (Admin.FIELDS.some(function (f) { return f.path === c.field; }) ? '' :
          '<option value="' + esc(c.field) + '" selected>Custom: ' + esc(c.field) + '</option>');
        var opOpts = Admin.OPS.map(function (o) {
          return '<option value="' + o.id + '"' + (c.op === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('');
        return '<div class="tag-editor" style="margin:8px 0">' +
          '<div class="field"><label>Audit Field</label><select class="input" data-bind="' + cb + '.field">' + fieldOpts + '</select></div>' +
          '<div class="field"><label>Condition</label><select class="input" data-bind="' + cb + '.op">' + opOpts + '</select></div>' +
          (c.op === 'set' ? '' : UI.field({ label: 'Value', bind: cb + '.value', value: c.value, placeholder: 'e.g. 2000 or Missing' })) +
          '<button class="btn small danger-ghost" data-action="admin-suggest-remove" data-mid="' + esc(m.id) + '" data-i="' + ci + '">Remove condition</button>' +
          '</div>';
      }).join('') +
      '<button class="btn small secondary" data-action="admin-suggest-add" data-mid="' + esc(m.id) + '">' + icon('plus') + ' Add suggestion condition</button>' +
      '</div>' +

      '<div class="cta-dock">' +
      '<button class="btn primary" data-action="nav" data-route="#/admin/catalog">Done</button>' +
      '<div style="height:8px"></div>' +
      '<button class="btn danger-ghost" data-action="admin-measure-delete" data-mid="' + esc(m.id) + '">Delete this measure</button>' +
      '</div></div>';
  };

  /* ---------------- Pricing rules ---------------- */
  window.ScreenAdminPricing = function () {
    Admin.ensureCatalog();
    var rules = Store.pricingRules();
    var rows = rules.map(function (r) {
      return '<button class="module-row" data-action="nav" data-route="#/admin/rule/' + esc(r.id) + '">' +
        '<span class="mic">' + icon('calc') + '</span>' +
        '<span class="mbody"><b>' + esc(r.label || 'Pricing rule') + '</b>' +
        '<span style="display:block;font:600 11px var(--font-body);color:var(--faint);margin-top:4px">' + esc(Admin.describeRule(r)) + '</span></span>' +
        '<span class="chev">' + icon('chevR') + '</span></button>';
    }).join('');

    return UI.subbar('Pricing Rules', '#/admin') +
      '<div class="screen">' +
      '<h1 class="screen-title">Pricing Rules</h1>' +
      '<p class="screen-sub">Automatically adjust a measure’s cost from answers captured during the audit — square footage, dropdown selections, test readings. Adjustments appear in the Builder and in every proposal, and a manual cost in the Builder always wins.</p>' +
      '<button class="btn primary" data-action="admin-rule-add">' + icon('plus') + ' Add Pricing Rule</button>' +
      (rows || '<div class="empty">' + icon('calc') + '<b>No rules yet</b><p>Example: when crawlspace clearance is less than 36&quot;, add $150 to any measure.</p></div>') +
      '</div>';
  };

  /* ---------------- Rule editor ---------------- */
  window.ScreenAdminRule = function (id) {
    var a = Admin.ensure();
    var i = -1;
    a.pricingRules.forEach(function (r, idx) { if (r.id === id) i = idx; });
    if (i < 0) {
      return UI.subbar('Rule', '#/admin/pricing') +
        '<div class="screen"><div class="empty">' + icon('calc') + '<b>Rule not found</b></div></div>';
    }
    var r = a.pricingRules[i];
    var b = 'admin.pricingRules.' + i;

    var measureOpts = '<option value="*"' + (r.measureId === '*' ? ' selected' : '') + '>Any measure in the plan</option>' +
      Store.catalog().map(function (m) {
        return '<option value="' + esc(m.id) + '"' + (r.measureId === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>';
      }).join('');
    var fieldOpts = Admin.FIELDS.map(function (f) {
      return '<option value="' + esc(f.path) + '"' + (r.field === f.path ? ' selected' : '') + '>' + esc(f.label) + '</option>';
    }).join('') + (Admin.FIELDS.some(function (f) { return f.path === r.field; }) ? '' :
      '<option value="' + esc(r.field) + '" selected>Custom: ' + esc(r.field) + '</option>');
    var opOpts = Admin.OPS.map(function (o) {
      return '<option value="' + o.id + '"' + (r.op === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
    var adjOpts = Admin.ADJUSTS.map(function (o) {
      return '<option value="' + o.id + '"' + (r.adjustType === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');

    /* Live check against the active audit, so rules can be sanity-tested. */
    var active = Store.activeEval();
    var testNote = '';
    if (active) {
      var target = r.measureId === '*' ? (active.selections[0] || null) : r.measureId;
      var inPlan = r.measureId === '*' ? active.selections.length > 0 : active.selections.indexOf(r.measureId) >= 0;
      var matches = target != null && Admin.ruleMatches(r, active, target);
      var mm = target && Store.measure(target);
      var amt = matches && mm ? Admin.ruleAmount(r, active, parseFloat(mm.cost) || 0) : 0;
      testNote = '<div class="insight"><b>' + icon('info') + ' Tested against ' + esc(active.customer.name || 'the open audit') + ':</b> ' +
        (!inPlan ? 'target measure is not in that plan.' :
          matches ? 'condition matches — adds <b>' + UI.money(amt) + '</b>' + (r.measureId === '*' ? ' per matching measure.' : '.') :
          'condition does not match that audit’s data.') + '</div>';
    }

    return UI.subbar('Edit Rule', '#/admin/pricing') +
      '<div class="screen">' +
      '<h1 class="screen-title">Pricing Rule</h1>' +
      '<div class="card" style="background:var(--green-soft);border:none"><b style="color:var(--green-deep)">' + esc(Admin.describeRule(r)) + '</b></div>' +

      '<div class="card">' + UI.sectionHeading('Applies To', 'layers') +
      '<div class="field"><label>Measure</label><select class="input" data-bind="' + b + '.measureId">' + measureOpts + '</select></div>' +
      UI.field({ label: 'Rule Label (shows on pricing breakdowns)', bind: b + '.label', value: r.label, placeholder: 'e.g. Restricted crawlspace access' }) +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('When (audit condition)', 'clipboard') +
      '<div class="field"><label>Audit Field</label><select class="input" data-bind="' + b + '.field">' + fieldOpts + '</select></div>' +
      UI.field({ label: 'Advanced: custom field path', bind: b + '.field', value: r.field, placeholder: 'zones.attic.fields.depth' }) +
      '<div class="field"><label>Condition</label><select class="input" data-bind="' + b + '.op">' + opOpts + '</select></div>' +
      (r.op === 'set' ? '' : UI.field({ label: 'Value', bind: b + '.value', value: r.value, placeholder: 'e.g. 2000 or Poor' })) +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Then (cost adjustment)', 'calc') +
      '<div class="field"><label>Adjustment</label><select class="input" data-bind="' + b + '.adjustType">' + adjOpts + '</select></div>' +
      UI.field({ label: 'Amount (negative = discount)', bind: b + '.amount', type: 'number', inputmode: 'decimal', value: r.amount, placeholder: r.adjustType === 'persqft' ? '0.50' : r.adjustType === 'pct' ? '15' : '150' }) +
      '</div>' +

      testNote +

      '<div class="cta-dock">' +
      '<button class="btn primary" data-action="nav" data-route="#/admin/pricing">Done</button>' +
      '<div style="height:8px"></div>' +
      '<button class="btn danger-ghost" data-action="admin-rule-delete" data-rid="' + esc(r.id) + '">Delete this rule</button>' +
      '</div></div>';
  };

  /* ---------------- Audit prompts ---------------- */
  window.ScreenAdminPrompts = function () {
    var p = Admin.ensurePrompts();

    var blowerRows = p.blowerChecklist.map(function (c, i) {
      return '<div class="tag-editor" style="margin:8px 0">' +
        UI.field({ label: 'Item', bind: 'admin.prompts.blowerChecklist.' + i + '.name', value: c.name }) +
        UI.field({ label: 'Helper text', bind: 'admin.prompts.blowerChecklist.' + i + '.desc', value: c.desc }) +
        '<button class="btn small danger-ghost" data-action="admin-check-remove" data-idx="' + i + '">Remove</button>' +
        '</div>';
    }).join('');

    var cazRows = p.cazTests.map(function (c, i) {
      return '<div class="tag-editor" style="margin:8px 0">' +
        UI.field({ label: 'Test name', bind: 'admin.prompts.cazTests.' + i + '.name', value: c.name }) +
        UI.field({ label: 'Description', bind: 'admin.prompts.cazTests.' + i + '.desc', value: c.desc }) +
        '</div>';
    }).join('');

    return UI.subbar('Audit Prompts', '#/admin') +
      '<div class="screen">' +
      '<h1 class="screen-title">Audit Prompts</h1>' +
      '<p class="screen-sub">The wording and options auditors see in the field. Changes save automatically.</p>' +

      '<div class="card">' + UI.sectionHeading('Primary Motivations', 'user',
        '<button class="btn small ghost" style="width:auto" data-action="admin-prompts-reset" data-key="motivations">Reset</button>') +
      '<p class="hint">Shown on New Evaluation. One option per line.</p>' +
      UI.field({ label: '', bind: 'admin.prompts.motivations', textarea: true, value: p.motivations }) +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Heating System Types', 'flame',
        '<button class="btn small ghost" style="width:auto" data-action="admin-prompts-reset" data-key="heatTypes">Reset</button>') +
      '<p class="hint">One option per line.</p>' +
      UI.field({ label: '', bind: 'admin.prompts.heatTypes', textarea: true, value: p.heatTypes }) +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Blower Door Setup Checklist', 'wind',
        '<button class="btn small ghost" style="width:auto" data-action="admin-prompts-reset" data-key="blowerChecklist">Reset</button>') +
      '<p class="hint">Every item must be checked before the CFM50 measurement unlocks. Adding an item re-locks in-progress audits until it is checked.</p>' +
      blowerRows +
      '<button class="btn small secondary" data-action="admin-check-add">' + icon('plus') + ' Add checklist item</button>' +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Combustion Safety Hard-Stops', 'shield',
        '<button class="btn small ghost" style="width:auto" data-action="admin-prompts-reset" data-key="cazTests">Reset</button>') +
      '<p class="hint">Wording only — the four hard-stops are a fixed safety protocol and cannot be added or removed.</p>' +
      cazRows +
      '</div>' +
      '</div>';
  };
})();
