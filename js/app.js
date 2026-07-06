/* Router + event wiring. Screens are pure render functions; interactions run
   through delegated data-action handlers, then re-render. Text inputs bind
   via data-bind without re-rendering (keeps focus while typing). */
(function () {
  var app = document.getElementById('app');
  var tabbar = document.getElementById('tabbar');
  var uiState = {
    catalogFilter: 'All Measures', mediaFilter: 'all', builderPick: null, historyQuery: '',
    dashView: 'list', calMonth: null, calSelected: null, mediaEditing: null
  };
  var iaqTimer = null;

  function route() {
    var h = location.hash || '#/dashboard';
    return h.replace(/^#\//, '').split('/');
  }

  function evalFromRoute(parts) {
    // ['eval', id, screen, ...]
    var ev = Store.getEval(parts[1]);
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
        case 'site': html = ScreenSite(ev); break;
        case 'zone': html = ScreenZone(ev, parts[3]); break;
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
      : parts[0];
    tabbar.innerHTML = DATA.TABS.map(function (t) {
      if (t.id === 'fab') {
        return '<a href="' + t.route + '" class="fab-slot" aria-label="New evaluation"><span class="fab">' + icon('plus') + '</span></a>';
      }
      return '<a href="' + t.route + '" class="' + (t.id === current ? 'on' : '') + '">' +
        '<span class="tic">' + icon(t.icon) + '</span>' + t.label + '</a>';
    }).join('');
  }

  function startIaqTick(ev) {
    var t = ev.tests.iaq;
    if (!t.startedAt || t.finishedAt) return;
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
    // 'new.*' → NewEvalDraft; 'auditor.*' → Store.state; else active evaluation
    if (path.indexOf('new.') === 0) return { obj: NewEvalDraft, path: path.slice(4), transient: true };
    if (path.indexOf('auditor.') === 0) return { obj: Store.state, path: path };
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
          Store.addPhoto(ev, meta, file).then(function () { rerender(); })
            .catch(function () { UI.toast('Could not read that image.'); });
        });
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
            .then(function (p) { ev.tests.blower.photos[pid] = p.id; Store.save(); rerender(); });
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
        var def = DATA.CAZ_TESTS.filter(function (c) { return c.id === id; })[0];
        UI.pickPhoto().then(function (file) {
          if (!file) return;
          Store.addPhoto(ev, { slotKey: 'caz-' + id, zone: 'caz', label: def.name, required: true }, file)
            .then(function (p) {
              ev.tests.caz.tests[id] = ev.tests.caz.tests[id] || {};
              ev.tests.caz.tests[id].photoId = p.id;
              Store.save(); rerender();
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
        ev.tests.iaq = { startedAt: null, finishedAt: null, co2: '', voc: '' };
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
      'print-doc': function () { window.print(); },
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
        }).catch(function () {
          UI.toast('Offline — saved locally; will sync when you reconnect.');
          rerender();
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
        UI.toast('Syncing pending audits…');
        Backend.syncPending().then(function () {
          UI.toast('Sync complete.');
          rerender();
        });
      },
      'pull-remote': function () {
        if (!Backend.ready()) { UI.toast('No backend configured.'); return; }
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

  /* Auto-retry pending syncs when connectivity returns. */
  window.addEventListener('online', function () {
    if (!Backend.ready()) return;
    Backend.syncPending().then(function () { rerender(); });
  });

  window.addEventListener('hashchange', function () { render(); });
  Store.init().then(function () { render(); });
  window.rerender = rerender;
})();
