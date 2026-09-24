/* Router + event wiring. Screens are pure render functions; interactions run
   through delegated data-action handlers, then re-render. Text inputs bind
   via data-bind without re-rendering (keeps focus while typing). */
(function () {
  var app = document.getElementById('app');
  var tabbar = document.getElementById('tabbar');
  var uiState = {
    catalogFilter: 'All Measures', mediaFilter: 'all', builderPick: null, historyQuery: '',
    dashView: 'list', calMonth: null, calSelected: null, mediaEditing: null, tplView: 'visual'
  };
  var iaqTimer = null;
  var guideUploadPending = null;
  var csvUploadSection = null;

  var CSV_LABELS = {
    crew: 'Crew Accounts', catalog: 'Improvement Catalog', materials: 'Materials Catalog',
    prompts: 'Audit Prompts', pricing: 'Pricing Rules', guides: 'Diagnostics Guides'
  };

  /* Crew CSV rows become sequential account-service calls; every other
     section applies locally in one shot. */
  function importCrewCsv(rows) {
    if (!Backend.ready()) { UI.toast('No backend configured — crew accounts need the cloud.'); return; }
    if (!Auth.signedIn()) { UI.toast('Sign in as an admin first.'); return; }
    var todo = rows.filter(function (r) { return r.password; });
    var skipped = rows.length - todo.length;
    if (!todo.length) { UI.toast('No rows to create — add a temp_password to each new account row.'); return; }
    if (!confirm('Create ' + todo.length + ' crew account' + (todo.length > 1 ? 's' : '') +
      (skipped ? ' (' + skipped + ' row' + (skipped > 1 ? 's' : '') + ' without a temp_password skipped)' : '') + '?')) return;
    UI.toast('Creating accounts…');
    var ok = 0;
    var failed = [];
    var chain = Promise.resolve();
    todo.forEach(function (r) {
      chain = chain.then(function () {
        return Auth.crewAdmin({ action: 'create', email: r.email, password: r.password, name: r.name, role: r.role })
          .then(function () { ok++; })
          .catch(function (e) { failed.push(r.email + ' (' + e.message + ')'); });
      });
    });
    chain.then(function () {
      CrewCache.list = null; CrewCache.error = null;
      rerender();
      UI.toast(ok + ' account' + (ok !== 1 ? 's' : '') + ' created' + (failed.length ? ' — ' + failed.length + ' failed' : '') + '.');
      if (failed.length) alert('These rows failed:\n\n' + failed.join('\n'));
    });
  }

  function route() {
    var h = location.hash || '#/dashboard';
    return h.replace(/^#\//, '').split('/');
  }

  function evalFromRoute(parts) {
    // ['eval', id, screen, ...]
    var ev = Store.getEval(parts[1]);
    if (ev && !Store.canSee(ev)) {
      UI.toast('That evaluation is assigned to another auditor.');
      return null;
    }
    if (ev) Store.setActive(ev.id);
    return ev;
  }

  function render(preserveScroll) {
    var scrollY = window.scrollY;
    var parts = route();
    var html = '';
    clearInterval(iaqTimer);

    if (parts[0] === 'eval') {
      var ev = evalFromRoute(parts);
      if (!ev) { location.hash = '#/dashboard'; return; }
      var screen = parts[2] || 'hub';
      if (ev.status === 'scheduled' && screen !== 'hub') ev.status = 'in-progress';
      switch (screen) {
        case 'hub': html = ScreenHub(ev); break;
        case 'details': html = ScreenEvalDetails(ev); break;
        case 'site': html = ScreenSite(ev); break;
        case 'zone': html = ScreenZone(ev, parts[3]); break;
        case 'mechanicals': html = ScreenMechanicals(ev); break;
        case 'blower': html = ScreenBlower(ev); break;
        case 'caz': html = ScreenCaz(ev); break;
        case 'iaq': html = ScreenIaq(ev); startIaqTick(ev); break;
        case 'catalog': html = ScreenCatalog(ev, uiState.catalogFilter); break;
        case 'builder': html = ScreenBuilder(ev, uiState.builderPick); break;
        case 'summary': html = ScreenSummary(ev); break;
        case 'media': html = ScreenMedia(ev, uiState.mediaFilter, uiState.mediaEditing); break;
        case 'proposal-media': html = ScreenProposalMedia(ev); break;
        case 'proposal-doc': html = ScreenProposalDoc(ev); break;
        case 'energy': html = ScreenEnergy(ev); break;
        case 'record': html = ScreenRecord(ev); break;
        default: html = ScreenHub(ev);
      }
    } else {
      switch (parts[0]) {
        case 'dashboard': html = ScreenDashboard(uiState.dashView, uiState.calMonth, uiState.calSelected); break;
        case 'new': html = ScreenNewEval(); break;
        case 'history': html = ScreenHistory(uiState.historyQuery); break;
        case 'settings': html = ScreenSettings(); break;
        case 'template': html = Auth.isAdmin() ? ScreenTemplate(uiState.tplView) : ScreenAdminLocked(); break;
        case 'guide': html = ScreenGuide(parts[1]); break;
        case 'admin':
          if (!Auth.isAdmin()) { html = ScreenAdminLocked(); break; }
          switch (parts[1]) {
            case 'crew': html = ScreenAdminCrew(); break;
            case 'catalog': html = ScreenAdminCatalog(); break;
            case 'materials': html = ScreenAdminMaterials(); break;
            case 'material': html = ScreenAdminMaterial(parts[2]); break;
            case 'measure': html = ScreenAdminMeasure(parts[2]); break;
            case 'pricing': html = ScreenAdminPricing(); break;
            case 'rule': html = ScreenAdminRule(parts[2]); break;
            case 'prompts': html = ScreenAdminPrompts(); break;
            case 'guides': html = ScreenAdminGuides(); break;
            case 'guide': html = ScreenAdminGuide(parts[2]); break;
            case 'media': html = ScreenAdminMedia(); break;
            default: html = ScreenAdmin();
          }
          break;
        case 'login': html = ScreenLogin(); break;
        case 'assess': {
          var active = Store.activeEval();
          if (active) { location.hash = '#/eval/' + active.id + '/hub'; return; }
          location.hash = '#/dashboard'; return;
        }
        case 'proposal': {
          var ae = Store.activeEval();
          if (ae) { location.hash = '#/eval/' + ae.id + '/summary'; return; }
          location.hash = '#/dashboard'; return;
        }
        default: html = ScreenDashboard();
      }
    }
    app.innerHTML = html;
    renderTabbar(parts);
    window.scrollTo(0, preserveScroll ? scrollY : 0);
  }

  /* Re-render without losing the user's place (used for in-screen updates). */
  function rerender() { render(true); }

  /* Number fields feed derived values (R-value, ASHRAE calc, upcharges).
     Debounce a re-render and restore focus/caret so typing isn't disrupted. */
  var derivedTimer = null;
  function scheduleDerivedRender(target) {
    clearTimeout(derivedTimer);
    var bind = target.getAttribute('data-bind');
    var caret = target.selectionStart;
    derivedTimer = setTimeout(function () {
      var active = document.activeElement;
      var stillTyping = active && active.getAttribute && active.getAttribute('data-bind') === bind;
      rerender();
      if (stillTyping) {
        var el = document.querySelector('[data-bind="' + bind + '"]');
        if (el) {
          el.focus();
          try { if (caret != null) el.setSelectionRange(el.value.length, el.value.length); } catch (err) { /* number inputs */ }
        }
      }
    }, 500);
  }

  function renderTabbar(parts) {
    var current = parts[0] === 'eval'
      ? (['catalog', 'builder', 'summary', 'proposal-media', 'proposal-doc'].indexOf(parts[2]) >= 0 ? 'proposal' : 'assess')
      : (parts[0] === 'admin' || parts[0] === 'template' ? 'admin' : parts[0]);
    tabbar.innerHTML = DATA.TABS.map(function (t) {
      if (t.id === 'fab') {
        return '<a href="' + t.route + '" class="fab-slot" aria-label="New evaluation"><span class="fab">' + icon('plus') + '</span></a>';
      }
      return '<a href="' + t.route + '" class="' + (t.id === current ? 'on' : '') + '">' +
        '<span class="tic">' + icon(t.icon) + '</span>' + t.label + '</a>';
    }).join('') +
    /* Admin entry: desktop rail only (CSS), shown to signed-in admins. */
    (Auth.isAdmin() ? '<a href="#/admin" class="admin-desktop ' + (current === 'admin' ? 'on' : '') + '">' +
      '<span class="tic">' + icon('shield') + '</span>Admin</a>' : '');
  }

  function startIaqTick(ev) {
    var t = ev.tests.iaq;
    if (!t.startedAt || t.finishedAt) return;
    /* Window already elapsed: the screen is in results entry — do NOT start
       the countdown interval, whose first tick re-renders and would fling
       the scroll position back to the top every second while typing. */
    if (DATA.IAQ_MINUTES * 60 * 1000 - (Date.now() - t.startedAt) <= 0) return;
    iaqTimer = setInterval(function () {
      var el = document.getElementById('iaq-countdown');
      var total = DATA.IAQ_MINUTES * 60 * 1000;
      var remain = total - (Date.now() - t.startedAt);
      if (remain <= 0) { clearInterval(iaqTimer); render(); return; }
      if (el) {
        var mm = Math.floor(remain / 60000), ss = Math.floor((remain % 60000) / 1000);
        el.textContent = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
      }
    }, 1000);
  }

  /* ---------- data-bind: write-through without re-render ---------- */
  function bindTarget(path) {
    // 'new.*'/'login.*' → transient drafts; 'auditor.*' → Store.state; else active evaluation
    if (path.indexOf('new.') === 0) return { obj: NewEvalDraft, path: path.slice(4), transient: true };
    if (path.indexOf('login.') === 0) return { obj: LoginDraft, path: path.slice(6), transient: true };
    if (path.indexOf('tpl.') === 0) return { obj: TemplateDraft, path: path.slice(4), transient: true };
    if (path.indexOf('crew.') === 0) return { obj: CrewDraft, path: path.slice(5), transient: true };
    if (path.indexOf('auditor.') === 0 || path.indexOf('admin.') === 0) return { obj: Store.state, path: path };
    return { obj: Store.activeEval(), path: path };
  }

  document.addEventListener('input', function (e) {
    var bind = e.target.getAttribute && e.target.getAttribute('data-bind');
    if (bind) {
      var t = bindTarget(bind);
      if (!t.obj) return;
      if (t.transient) {
        var parts = t.path.split('.');
        var o = t.obj;
        for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
        o[parts[parts.length - 1]] = e.target.value;
      } else {
        Store.set(t.obj, t.path, e.target.value);
      }
      if (e.target.type === 'number') scheduleDerivedRender(e.target);
      return;
    }
    var ai = e.target.getAttribute && e.target.getAttribute('data-action-input');
    if (ai === 'dash-search') dashSearch(e.target.value);
    if (ai === 'history-search') {
      uiState.historyQuery = e.target.value;
      clearTimeout(window._hq);
      window._hq = setTimeout(function () {
        rerender();
        var inp = document.querySelector('[data-action-input="history-search"]');
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      }, 250);
    }
  });

  /* Selects need a re-render to refresh derived UI (they blur immediately,
     so focus restoration isn't needed — just keep the scroll position). */
  document.addEventListener('change', function (e) {
    if (e.target.id === 'admin-import-file') {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          Admin.importConfig(reader.result);
          UI.toast('Config imported — catalog, pricing, prompts and template applied.');
          rerender();
        } catch (err) {
          UI.toast('Import failed: ' + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
      return;
    }
    if (e.target.id === 'csv-upload-file') {
      var csvFile = e.target.files[0];
      var section = csvUploadSection;
      e.target.value = '';
      csvUploadSection = null;
      if (!csvFile || !section) return;
      var csvReader = new FileReader();
      csvReader.onload = function () {
        try {
          if (section === 'crew') {
            importCrewCsv(Admin.csvImport('crew', csvReader.result));
            return;
          }
          if (!confirm('Replace the entire ' + CSV_LABELS[section] + ' with this file’s contents?')) return;
          var res = Admin.csvImport(section, csvReader.result);
          UI.toast(CSV_LABELS[section] + ' updated from the template (' + res.count + ' rows).');
          rerender();
        } catch (err) {
          alert('Import failed — nothing was changed.\n\n' + err.message);
        }
      };
      csvReader.readAsText(csvFile);
      return;
    }
    if (e.target.id === 'guide-upload-file') {
      var gfile = e.target.files[0];
      var pending = guideUploadPending;
      e.target.value = '';
      guideUploadPending = null;
      if (!gfile || !pending) return;
      UI.toast('Uploading…');
      Backend.uploadAsset(gfile, 'guides').then(function (url) {
        var guides = Admin.ensureGuides();
        var g = guides[pending.gidx];
        if (!g) return;
        if (pending.kind === 'pdf') g.pdf = url;
        else if (g.steps && g.steps[pending.idx]) g.steps[pending.idx].photo = url;
        Store.save();
        UI.toast(pending.kind === 'pdf' ? 'PDF attached to the guide.' : 'Photo added to the step.');
        rerender();
      }).catch(function (err) {
        UI.toast('Upload failed: ' + err.message);
      });
      return;
    }
    if (e.target.id === 'assign-auditor-select') {
      var ev = Store.activeEval();
      if (!ev) return;
      var email = e.target.value;
      var prof = (RosterCache.list || []).filter(function (u) { return u.email === email; })[0];
      ev.assignedTo = email ? { email: email, name: (prof && prof.name) || email } : { email: '', name: '' };
      Store.save(); rerender();
      UI.toast(email ? 'Assigned to ' + ((prof && prof.name) || email) + '.' : 'Evaluation unassigned — visible to all crew.');
      return;
    }
    var bind = e.target.getAttribute && e.target.getAttribute('data-bind');
    if (!bind) return;
    if (e.target.tagName === 'SELECT') rerender();
  });

  /* ---------- delegated actions ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var ev = Store.activeEval();
    e.preventDefault();

    var actions = {
      'nav': function () { location.hash = el.getAttribute('data-route'); },
      'hist-back': function () { history.back(); },
      'toast': function () { UI.toast(el.getAttribute('data-msg')); },
      'open-eval': function () {
        var id = el.getAttribute('data-id');
        Store.setActive(id);
        location.hash = '#/eval/' + id + '/hub';
      },
      'create-eval': function () {
        var d = NewEvalDraft;
        if (!d.name || !d.address) { UI.toast('Name and service address are required.'); return; }
        var created = Store.createEval(
          { name: d.name, address: d.address, phone: d.phone || '', email: d.email || '' },
          { date: d.date || new Date().toISOString().slice(0, 10), time: d.time || '', type: d.type || 'Evaluation', state: 'Confirmed' });
        created.intake.motivation = d.motivation || '';
        created.intake.heatType = d.heatType || '';
        Object.keys(d).forEach(function (k) { delete d[k]; });
        Store.save();
        if (el.getAttribute('data-start')) {
          created.status = 'in-progress'; Store.save();
          location.hash = '#/eval/' + created.id + '/hub';
        } else {
          UI.toast('Evaluation scheduled.');
          location.hash = '#/dashboard';
        }
      },
      'seg': function () {
        var t = bindTarget(el.getAttribute('data-bind'));
        if (!t.obj) return;
        var v = el.getAttribute('data-value');
        if (t.transient) { NewEvalDraft[t.path] = v; } else { Store.set(t.obj, t.path, v); }
        rerender();
      },
      'attic-vent': function () {
        var f = Store.zone(ev, 'attic').fields;
        var kind = el.getAttribute('data-vent');
        if (kind === 'none') {
          f.noVent = !f.noVent;
          if (f.noVent) { f.ridgeVents = ''; f.gableVents = ''; }
        } else {
          var key = kind === 'ridge' ? 'ridgeVents' : 'gableVents';
          f[key] = f[key] ? '' : '1';
          if (f[key]) f.noVent = false;
        }
        Store.save(); rerender();
      },
      'sys-toggle': function () {
        var zd = Store.zone(ev, el.getAttribute('data-zone'));
        var id = el.getAttribute('data-sys');
        if (zd.systems[id]) delete zd.systems[id]; else zd.systems[id] = {};
        Store.save(); rerender();
      },
      'zone-finalize': function () {
        Store.zone(ev, el.getAttribute('data-zone')).complete = true;
        Store.save(); UI.toast('Section finalized.');
        location.hash = '#/eval/' + ev.id + '/hub';
      },
      'zone-reopen': function () {
        Store.zone(ev, el.getAttribute('data-zone')).complete = false;
        Store.save(); rerender();
      },
      'window-add': function () {
        var zd = Store.zone(ev, el.getAttribute('data-zone'));
        zd.windows.push({ room: '', type: '', glazing: '', condition: '' });
        zd.editingWindow = zd.windows.length - 1;
        Store.save(); rerender();
      },
      'window-edit': function () {
        var zd = Store.zone(ev, el.getAttribute('data-zone'));
        zd.editingWindow = parseInt(el.getAttribute('data-idx'), 10);
        Store.save(); rerender();
      },
      'window-done': function () {
        var zd = Store.zone(ev, el.getAttribute('data-zone'));
        delete zd.editingWindow;
        Store.save(); rerender();
      },
      'window-remove': function () {
        var zd = Store.zone(ev, el.getAttribute('data-zone'));
        zd.windows.splice(parseInt(el.getAttribute('data-idx'), 10), 1);
        delete zd.editingWindow;
        Store.save(); rerender();
      },
      'photo-capture': function () {
        var meta = {
          slotKey: el.getAttribute('data-slot-key') || Store.uid('free'),
          zone: el.getAttribute('data-zone') || '',
          label: el.getAttribute('data-label') || 'Photo',
          required: !!el.getAttribute('data-required'),
          tag: el.getAttribute('data-tag') || ''
        };
        UI.pickPhoto().then(function (file) {
          if (!file) return;
          Store.addPhoto(ev, meta, file).then(function (p) { rerender(); UI.tagSheet(ev, p.id); })
            .catch(function () { UI.toast('Could not read that image.'); });
        });
      },
      'sheet-tag-toggle': function () {
        var p = ev && ev.photos.filter(function (x) { return x.id === el.getAttribute('data-photo'); })[0];
        if (!p) return;
        var t = el.getAttribute('data-tag');
        p.tags = p.tags || [];
        var i = p.tags.indexOf(t);
        if (i >= 0) p.tags.splice(i, 1); else p.tags.push(t);
        Store.save();
        UI.tagSheet(ev, p.id);
      },
      'sheet-close': function () { UI.closeTagSheet(); rerender(); },
      'media-tag-toggle': function () {
        var p = ev && ev.photos.filter(function (x) { return x.id === el.getAttribute('data-photo'); })[0];
        if (!p) return;
        var t = el.getAttribute('data-tag');
        p.tags = p.tags || [];
        var i = p.tags.indexOf(t);
        if (i >= 0) p.tags.splice(i, 1); else p.tags.push(t);
        Store.save(); rerender();
      },
      'photo-remove': function () {
        Store.removePhoto(ev, el.getAttribute('data-photo'));
        rerender();
      },
      'blower-check': function () {
        var id = el.getAttribute('data-check');
        ev.tests.blower.checklist[id] = !ev.tests.blower.checklist[id];
        Store.save(); rerender();
      },
      'blower-photo': function () {
        var pid = el.getAttribute('data-pid');
        var def = DATA.BLOWER_PHOTOS.filter(function (p) { return p.id === pid; })[0];
        UI.pickPhoto().then(function (file) {
          if (!file) return;
          Store.addPhoto(ev, { slotKey: 'blower-' + pid, zone: 'blower', label: def.label, required: def.required }, file)
            .then(function (p) { ev.tests.blower.photos[pid] = p.id; Store.save(); rerender(); UI.tagSheet(ev, p.id); });
        });
      },
      'blower-photo-remove': function () {
        var pid = el.getAttribute('data-pid');
        var photoId = ev.tests.blower.photos[pid];
        if (photoId) Store.removePhoto(ev, photoId);
        delete ev.tests.blower.photos[pid];
        Store.save(); rerender();
      },
      'blower-submit': function () {
        UI.toast('Blower door assessment recorded.');
        location.hash = '#/eval/' + ev.id + '/hub';
      },
      'caz-result': function () {
        var id = el.getAttribute('data-test');
        ev.tests.caz.tests[id] = ev.tests.caz.tests[id] || {};
        ev.tests.caz.tests[id].result = el.getAttribute('data-result');
        Store.save(); rerender();
      },
      'caz-photo': function () {
        var id = el.getAttribute('data-test');
        var def = Store.prompts('cazTests').filter(function (c) { return c.id === id; })[0];
        UI.pickPhoto().then(function (file) {
          if (!file) return;
          Store.addPhoto(ev, { slotKey: 'caz-' + id, zone: 'caz', label: def.name, required: true }, file)
            .then(function (p) {
              ev.tests.caz.tests[id] = ev.tests.caz.tests[id] || {};
              ev.tests.caz.tests[id].photoId = p.id;
              Store.save(); rerender();
              UI.tagSheet(ev, p.id);
            });
        });
      },
      'caz-photo-remove': function () {
        var id = el.getAttribute('data-test');
        var d = ev.tests.caz.tests[id];
        if (d && d.photoId) { Store.removePhoto(ev, d.photoId); delete d.photoId; }
        Store.save(); rerender();
      },
      'iaq-start': function () {
        ev.tests.iaq.startedAt = Date.now();
        ev.tests.iaq.finishedAt = null;
        Store.save(); rerender();
      },
      'iaq-reset': function () {
        var t = { startedAt: null, finishedAt: null };
        DATA.IAQ_METRICS.forEach(function (m) { t[m.id] = ''; });
        ev.tests.iaq = t;
        Store.save(); rerender();
      },
      'iaq-save': function () {
        ev.tests.iaq.finishedAt = ev.tests.iaq.finishedAt || Date.now();
        Store.save(); UI.toast('IAQ baseline saved.');
        location.hash = '#/eval/' + ev.id + '/hub';
      },
      'catalog-filter': function () { uiState.catalogFilter = el.getAttribute('data-cat'); rerender(); },
      'catalog-toggle': function () {
        var mid = el.getAttribute('data-mid');
        var i = ev.selections.indexOf(mid);
        if (i >= 0) ev.selections.splice(i, 1); else ev.selections.push(mid);
        Store.save(); rerender();
      },
      'builder-pick': function () { uiState.builderPick = el.getAttribute('data-mid'); rerender(); },
      'media-filter': function () { uiState.mediaFilter = el.getAttribute('data-zone'); rerender(); },
      'pmedia-toggle': function () {
        var id = el.getAttribute('data-photo');
        ev.proposalMedia = ev.proposalMedia || [];
        var i = ev.proposalMedia.indexOf(id);
        if (i >= 0) ev.proposalMedia.splice(i, 1); else ev.proposalMedia.push(id);
        Store.save(); rerender();
      },
      'pmedia-clear': function () { ev.proposalMedia = []; Store.save(); rerender(); },
      'pdoc-measure': function () {
        var mid = el.getAttribute('data-mid');
        ev.proposalOmit = ev.proposalOmit || [];
        var i = ev.proposalOmit.indexOf(mid);
        if (i >= 0) ev.proposalOmit.splice(i, 1); else ev.proposalOmit.push(mid);
        Store.save(); rerender();
      },
      'tpl-view': function () { uiState.tplView = el.getAttribute('data-view'); rerender(); },
      /* ---- Bulk CSV templates (admin) ---- */
      'csv-download': function () {
        var section = el.getAttribute('data-section');
        var blob = new Blob([Admin.csvTemplate(section)], { type: 'text/csv' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'homsci-' + section + '-template.csv';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        UI.toast('Template downloaded — edit it in Excel or Google Sheets, then upload it back.');
      },
      'csv-upload': function () {
        csvUploadSection = el.getAttribute('data-section');
        var inp = document.getElementById('csv-upload-file');
        if (inp) inp.click();
      },
      /* ---- Media settings (admin) ---- */
      'admin-stamp-toggle': function () {
        var m = Admin.ensureMedia();
        m.stamp = !m.stamp;
        Store.save(); rerender();
      },
      'admin-media-tags-reset': function () {
        if (!confirm('Restore the default media tag list?')) return;
        Admin.ensureMedia().tags = DATA.MEDIA_TAGS.join('\n');
        Store.save();
        UI.toast('Default tags restored.');
        rerender();
      },
      /* ---- Diagnostics guide editor ---- */
      'guide-step-add': function () {
        var guides = Admin.ensureGuides();
        var g = guides[parseInt(el.getAttribute('data-gidx'), 10)];
        if (!g) return;
        (g.steps = g.steps || []).push({ text: '', photo: '' });
        Store.save(); rerender();
      },
      'guide-step-remove': function () {
        var guides = Admin.ensureGuides();
        var g = guides[parseInt(el.getAttribute('data-gidx'), 10)];
        if (!g || !g.steps) return;
        g.steps.splice(parseInt(el.getAttribute('data-idx'), 10), 1);
        Store.save(); rerender();
      },
      'guide-reset': function () {
        if (!confirm('Discard your edits to this guide and restore the default steps?')) return;
        Admin.resetGuide(el.getAttribute('data-gid'));
        UI.toast('Default guide restored.');
        rerender();
      },
      'guide-upload': function () {
        if (!Auth.signedIn()) { UI.toast('Sign in first — uploads go to cloud storage.'); return; }
        var kind = el.getAttribute('data-kind');
        guideUploadPending = {
          gidx: parseInt(el.getAttribute('data-gidx'), 10),
          idx: el.hasAttribute('data-idx') ? parseInt(el.getAttribute('data-idx'), 10) : null,
          kind: kind
        };
        var inp = document.getElementById('guide-upload-file');
        if (!inp) return;
        inp.setAttribute('accept', kind === 'pdf' ? 'application/pdf,.pdf' : 'image/*');
        inp.click();
      },
      'tpl-save': function () {
        Store.state.proposalTemplate = TemplateDraft.html || Proposal.DEFAULT_TEMPLATE;
        Store.save();
        UI.toast('Template saved — all future proposals use this design.');
        rerender();
      },
      'tpl-reset': function () {
        if (!confirm('Discard your custom template and restore the default design?')) return;
        delete Store.state.proposalTemplate;
        TemplateDraft.html = null;
        Store.save();
        UI.toast('Default template restored.');
        rerender();
      },
      'tpl-preview': function () {
        var active = Store.activeEval();
        if (!active) { UI.toast('Open an evaluation first to preview with its data.'); return; }
        Store.state.proposalTemplate = TemplateDraft.html || Proposal.DEFAULT_TEMPLATE;
        Store.save();
        location.hash = '#/eval/' + active.id + '/proposal-doc';
      },
      /* ---- Admin portal ---- */
      'admin-measure-add': function () {
        var m = Admin.addMeasure();
        location.hash = '#/admin/measure/' + m.id;
      },
      'admin-measure-delete': function () {
        if (!confirm('Delete this measure from the catalog? Audits that already selected it will drop it from their plan.')) return;
        var mid = el.getAttribute('data-mid');
        var cat = Admin.ensureCatalog();
        Store.state.admin.catalog = cat.filter(function (m) { return m.id !== mid; });
        Store.save();
        UI.toast('Measure deleted.');
        location.hash = '#/admin/catalog';
      },
      'admin-catalog-reset': function () {
        if (!confirm('Discard all catalog customizations and restore the default measures?')) return;
        Store.state.admin.catalog = null;
        Store.save();
        UI.toast('Default catalog restored.');
        rerender();
      },
      'admin-suggest-add': function () {
        var cat = Admin.ensureCatalog();
        var m = cat.filter(function (x) { return x.id === el.getAttribute('data-mid'); })[0];
        if (!m) return;
        m.suggest = m.suggest || [];
        m.suggest.push({ field: 'site.sqft', op: 'gt', value: '' });
        Store.save(); rerender();
      },
      'admin-suggest-remove': function () {
        var cat = Admin.ensureCatalog();
        var m = cat.filter(function (x) { return x.id === el.getAttribute('data-mid'); })[0];
        if (!m || !m.suggest) return;
        m.suggest.splice(parseInt(el.getAttribute('data-i'), 10), 1);
        Store.save(); rerender();
      },
      /* ---- Materials catalog ---- */
      'admin-material-add': function () {
        var mat = Admin.addMaterial();
        location.hash = '#/admin/material/' + mat.id;
      },
      'admin-material-delete': function () {
        var matId = el.getAttribute('data-matid');
        var usedBy = Store.catalog().filter(function (c) { return (c.materials || []).indexOf(matId) >= 0; });
        if (!confirm('Delete this material?' + (usedBy.length ? ' It is attached to ' + usedBy.length + ' measure(s) — their cost build-ups will drop it.' : ''))) return;
        Store.state.admin.materials = Admin.ensureMaterials().filter(function (mat) { return mat.id !== matId; });
        Admin.ensureCatalog().forEach(function (c) {
          if (c.materials) c.materials = c.materials.filter(function (x) { return x !== matId; });
        });
        Store.save();
        UI.toast('Material deleted.');
        location.hash = '#/admin/materials';
      },
      'admin-materials-reset': function () {
        if (!confirm('Discard materials customizations and restore the defaults?')) return;
        Store.state.admin.materials = null;
        Store.save();
        UI.toast('Default materials restored.');
        rerender();
      },
      'admin-mat-toggle': function () {
        var cat = Admin.ensureCatalog();
        var m = cat.filter(function (x) { return x.id === el.getAttribute('data-mid'); })[0];
        if (!m) return;
        var matId = el.getAttribute('data-matid');
        m.materials = m.materials || [];
        var i = m.materials.indexOf(matId);
        if (i >= 0) m.materials.splice(i, 1); else m.materials.push(matId);
        Store.save(); rerender();
      },
      'admin-rule-add': function () {
        var r = Admin.addRule();
        location.hash = '#/admin/rule/' + r.id;
      },
      'admin-rule-delete': function () {
        if (!confirm('Delete this pricing rule?')) return;
        var rid = el.getAttribute('data-rid');
        Store.state.admin.pricingRules = Store.state.admin.pricingRules.filter(function (r) { return r.id !== rid; });
        Store.save();
        UI.toast('Rule deleted.');
        location.hash = '#/admin/pricing';
      },
      'admin-prompts-reset': function () {
        Admin.resetPrompts(el.getAttribute('data-key'));
        UI.toast('Defaults restored.');
        rerender();
      },
      'admin-check-add': function () {
        var p = Admin.ensurePrompts();
        p.blowerChecklist.push({ id: Store.uid('chk'), name: 'New checklist item', desc: '' });
        Store.save(); rerender();
      },
      'admin-check-remove': function () {
        var p = Admin.ensurePrompts();
        p.blowerChecklist.splice(parseInt(el.getAttribute('data-idx'), 10), 1);
        Store.save(); rerender();
      },
      'admin-export': function () {
        var blob = new Blob([JSON.stringify(Admin.exportPayload(), null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'homsci-config-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        UI.toast('Config exported — import it on other crew devices.');
      },
      'admin-import': function () {
        var inp = document.getElementById('admin-import-file');
        if (inp) inp.click();
      },
      /* ---- Crew accounts (admin) ---- */
      'crew-refresh': function () { CrewCache.list = null; CrewCache.error = null; rerender(); },
      'crew-create': function () {
        if (!CrewDraft.email || !CrewDraft.password) { UI.toast('Email and a temporary password are required.'); return; }
        var btn = document.getElementById('crew-create-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
        Auth.crewAdmin({
          action: 'create', email: CrewDraft.email.trim(), password: CrewDraft.password,
          name: CrewDraft.name || '', role: CrewDraft.role || 'auditor'
        }).then(function () {
          UI.toast('Account created — share the temporary password with them.');
          Object.keys(CrewDraft).forEach(function (k) { delete CrewDraft[k]; });
          CrewCache.list = null; CrewCache.error = null;
          rerender();
        }).catch(function (e) {
          UI.toast(e.name === 'TypeError' ? 'Offline — cannot reach the account service.' : e.message);
          rerender();
        });
      },
      'crew-role': function () {
        Auth.crewAdmin({ action: 'set-role', userId: el.getAttribute('data-uid'), role: el.getAttribute('data-role') })
          .then(function () {
            UI.toast('Role updated.');
            CrewCache.list = null; rerender();
            return Auth.refreshProfile();
          }).then(function () { rerender(); })
          .catch(function (e) { UI.toast(e.message); });
      },
      'crew-passwd': function () {
        var pw = prompt('New temporary password for this crew member:');
        if (!pw) return;
        if (pw.length < 8) { UI.toast('Use at least 8 characters.'); return; }
        Auth.crewAdmin({ action: 'set-password', userId: el.getAttribute('data-uid'), password: pw })
          .then(function () { UI.toast('Password reset — share it with them.'); })
          .catch(function (e) { UI.toast(e.message); });
      },
      'crew-remove': function () {
        if (!confirm('Remove this crew account? They will no longer be able to sign in.')) return;
        Auth.crewAdmin({ action: 'delete', userId: el.getAttribute('data-uid') })
          .then(function () {
            UI.toast('Account removed.');
            CrewCache.list = null; rerender();
          }).catch(function (e) { UI.toast(e.message); });
      },
      'test-backend': function () {
        var cfg = window.BACKEND_CONFIG || {};
        if (!cfg.url) { UI.toast('No backend configured.'); return; }
        var btn = document.getElementById('test-backend-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
        var host = cfg.url.replace(/^https?:\/\//, '');
        fetch(cfg.url + '/auth/v1/health', { headers: { 'apikey': cfg.anonKey } })
          .then(function (r) {
            UI.toast(r.ok ? 'Backend reachable — sign-in service is up (' + host + ').'
              : 'Backend responded HTTP ' + r.status + ' — service may be paused (' + host + ').');
          })
          .catch(function () {
            UI.toast('Cannot reach ' + host + ' — check this device’s internet connection.');
          })
          .then(function () { rerender(); });
      },
      'pw-toggle': function () {
        var wrap = el.closest('.pw-wrap');
        var inp = wrap && wrap.querySelector('input');
        if (!inp) return;
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        el.innerHTML = icon(show ? 'eyeOff' : 'eye');
        el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        inp.focus();
      },
      'auth-change-pass': function () {
        var inp = document.querySelector('[data-bind="login.newPassword"]');
        var pw = inp ? inp.value : '';
        if (!pw || pw.length < 8) { UI.toast('Use at least 8 characters.'); return; }
        Auth.changePassword(pw).then(function () {
          if (inp) inp.value = '';
          delete LoginDraft.newPassword;
          UI.toast('Password changed.');
        }).catch(function (e) {
          UI.toast(e.message === 'SIGN_IN_REQUIRED' ? 'Sign in first.' : e.message);
        });
      },
      'print-doc': function () { window.print(); },
      /* Share the customer-facing deck link. The audit must be in the cloud
         (that's what the deck serves), so sync first when needed. */
      'share-deck': function () {
        if (!Backend.ready()) { UI.toast('No backend configured.'); return; }
        var cfg = window.BACKEND_CONFIG;
        var base = cfg.appUrl || (location.origin.indexOf('http') === 0 ? location.origin : '');
        function finish(tok) {
          var url = base + '/deck.html?t=' + tok;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(
              function () { UI.toast('Deck link copied — text or email it to the customer.'); },
              function () { prompt('Copy this proposal link:', url); });
          } else {
            prompt('Copy this proposal link:', url);
          }
        }
        if (ev.shareToken && ev.synced) { finish(ev.shareToken); return; }
        UI.toast('Syncing this audit to create the share link…');
        Store.sync(ev).then(function () {
          rerender();
          finish(ev.shareToken);
        }).catch(function (e) {
          if (e.message === 'SIGN_IN_REQUIRED') {
            UI.toast('Sign in first — sharing needs cloud sync.');
            location.hash = '#/login';
          } else if (ev.synced) {
            // Synced earlier (possibly by an older app version) — the
            // server's token is authoritative, not the one this failed
            // sync attempt minted locally.
            ev.shareToken = null;
            Backend.fetchShareToken(ev).then(function (tok) {
              if (tok) finish(tok); else UI.toast('Could not get a share link — check your connection.');
            }).catch(function () { UI.toast('Could not get a share link — check your connection.'); });
          } else {
            UI.toast('Offline — the deck link needs the audit synced to the cloud.');
          }
        });
      },
      'dash-view': function () {
        uiState.dashView = el.getAttribute('data-view');
        if (uiState.dashView === 'cal' && !uiState.calSelected) {
          uiState.calSelected = new Date().toISOString().slice(0, 10);
        }
        rerender();
      },
      'cal-nav': function () { uiState.calMonth = el.getAttribute('data-month'); rerender(); },
      'cal-day': function () { uiState.calSelected = el.getAttribute('data-date'); rerender(); },
      'media-edit': function () {
        var id = el.getAttribute('data-photo');
        uiState.mediaEditing = uiState.mediaEditing === id ? null : id;
        rerender();
      },
      'media-edit-done': function () { uiState.mediaEditing = null; rerender(); },
      'export-json': function () {
        var payload = JSON.parse(JSON.stringify(ev));
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'audit-' + (ev.customer.name || ev.id).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        UI.toast('Audit record exported.');
      },
      'finalize-eval': function () {
        ev.status = 'complete';
        Store.save();
        if (!Backend.ready()) {
          UI.toast('Finalized locally — no backend configured.');
          rerender(); return;
        }
        UI.toast('Synchronizing…');
        Store.sync(ev).then(function () {
          UI.toast('Assessment + ' + ev.photos.length + ' photos saved to the HomSci cloud.');
          Store.reindexRemote();
          rerender();
        }).catch(function (e) {
          UI.toast(e && e.message === 'SIGN_IN_REQUIRED'
            ? 'Finalized locally — sign in (Settings) to sync to the cloud.'
            : 'Offline — saved locally; will sync when you reconnect.');
          rerender();
        });
      },
      'auth-login': function () {
        if (!LoginDraft.email || !LoginDraft.password) { UI.toast('Email and password required.'); return; }
        var btn = document.getElementById('auth-login-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
        Auth.login(LoginDraft.email.trim(), LoginDraft.password).then(function () {
          delete LoginDraft.password;
          UI.toast('Signed in. Cloud sync unlocked.');
          Backend.syncPending();
          location.hash = '#/dashboard';
        }).catch(function (e) {
          UI.toast(e.name === 'TypeError' ? 'Offline — cannot reach the sign-in service.' : e.message);
          rerender();
        });
      },
      'auth-signup': function () {
        if (!LoginDraft.email || !LoginDraft.password) { UI.toast('Email and password required.'); return; }
        Auth.signup(LoginDraft.email.trim(), LoginDraft.password, LoginDraft.name || '').then(function (res) {
          delete LoginDraft.password;
          if (res.active) {
            UI.toast('Account created — you are signed in.');
            location.hash = '#/dashboard';
          } else {
            UI.toast('Account created. Confirm via the email we sent, then sign in.');
            rerender();
          }
        }).catch(function (e) {
          UI.toast(e.name === 'TypeError' ? 'Offline — cannot reach the sign-in service.' : e.message);
        });
      },
      'auth-logout': function () {
        Auth.logout().then(function () { UI.toast('Signed out.'); rerender(); });
      },
      'hcp-import': function () {
        if (!Backend.ready()) { UI.toast('No backend configured.'); return; }
        if (!Auth.signedIn()) { UI.toast('Sign in first — job import needs a crew account.'); location.hash = '#/login'; return; }
        UI.toast('Importing jobs from Housecall Pro…');
        Hcp.importJobs().then(function (res) {
          UI.toast(res.added + ' new job' + (res.added === 1 ? '' : 's') + ' imported' +
            (res.updated ? ', ' + res.updated + ' updated' : '') + ' (' + res.total + ' upcoming).');
          rerender();
        }).catch(function (e) {
          if (e.notConfigured) {
            UI.toast('Housecall Pro not connected yet — set the HCP_API_KEY secret on the hcp-jobs function.');
          } else if (e.message === 'SIGN_IN_REQUIRED') {
            UI.toast('Sign in first — job import needs a crew account.');
            location.hash = '#/login';
          } else {
            UI.toast(e.name === 'TypeError' ? 'Offline — cannot reach the import service.' : e.message);
          }
        });
      },
      'energy-run': function () {
        var btn = document.getElementById('energy-run-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Fetching climate data…'; }
        EnergyModel.run(ev).then(function () {
          UI.toast('Energy model ready.');
          rerender();
        }).catch(function (e) {
          UI.toast(e.message.indexOf('fetch') >= 0 || e.name === 'TypeError'
            ? 'Offline — energy modeling needs a connection. Audit data is unaffected.'
            : e.message);
          rerender();
        });
      },
      'energy-clear': function () {
        delete ev.energyModel;
        Store.save(); rerender();
      },
      'sync-now': function () {
        if (!Backend.ready()) { UI.toast('No backend configured.'); return; }
        if (!Auth.signedIn()) { UI.toast('Sign in first — cloud sync needs a crew account.'); location.hash = '#/login'; return; }
        UI.toast('Syncing pending audits…');
        Backend.syncPending().then(function () {
          UI.toast('Sync complete.');
          rerender();
        });
      },
      'pull-remote': function () {
        if (!Backend.ready()) { UI.toast('No backend configured.'); return; }
        if (!Auth.signedIn()) { UI.toast('Sign in first — cloud sync needs a crew account.'); location.hash = '#/login'; return; }
        UI.toast('Fetching audits from the cloud…');
        Backend.pullAudits().then(function (added) {
          Store.reindexRemote();
          UI.toast(added ? added + ' audit' + (added > 1 ? 's' : '') + ' pulled from the cloud.' : 'Already up to date.');
          rerender();
        }).catch(function (e) { UI.toast('Could not reach the cloud: ' + e.message); });
      },
      'clear-demo': function () { Store.clearDemo(); UI.toast('Demo appointments removed.'); rerender(); },
      'wipe': function () {
        if (confirm('Erase ALL local audit data on this device? This cannot be undone.')) {
          localStorage.clear();
          indexedDB.deleteDatabase('homsci_photos');
          location.reload();
        }
      }
    };
    if (actions[action]) actions[action]();
  });

  /* IAQ completion alarm — runs globally so the auditor is alerted even
     while working in another zone. Fires once per test run; stale
     completions (app reopened much later) flip to results silently. */
  function checkIaqAlarms() {
    var total = DATA.IAQ_MINUTES * 60 * 1000;
    var fired = false;
    Object.keys(Store.state.evaluations).forEach(function (id) {
      var ev = Store.state.evaluations[id];
      var t = ev.tests && ev.tests.iaq;
      if (!t || !t.startedAt || t.finishedAt || t.alerted) return;
      var over = Date.now() - t.startedAt - total;
      if (over < 0) return;
      t.alerted = true;
      fired = true;
      if (over < 15 * 60 * 1000) {
        UI.alertAuditor('IAQ sampling complete — ready for results entry.');
      }
    });
    if (fired) {
      Store.save();
      if (location.hash.indexOf('/iaq') >= 0) rerender();
    }
  }
  setInterval(checkIaqAlarms, 3000);

  /* Auto-retry pending syncs when connectivity returns. */
  window.addEventListener('online', function () {
    if (!Backend.ready()) return;
    Backend.syncPending().then(function () { rerender(); });
  });

  window.addEventListener('hashchange', function () { render(); });
  Store.init().then(function () { render(); });
  window.rerender = rerender;
})();
