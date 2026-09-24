/* State management: localStorage for audit data (offline-first, carried over
   from v1), IndexedDB for photo blobs with an in-memory dataURL cache so
   screens can render synchronously. */
(function () {
  var LS_KEY = 'homsci_state_v2';
  var DB_NAME = 'homsci_photos';
  var photoCache = {}; // photoId -> dataURL

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function blankEvaluation(customer) {
    return {
      id: uid('eval'),
      createdAt: new Date().toISOString(),
      status: 'scheduled', // scheduled | in-progress | complete
      synced: false,
      appointment: { date: new Date().toISOString().slice(0, 10), time: '', type: 'Evaluation', state: 'Confirmed' },
      customer: customer || { name: '', address: '', phone: '', email: '' },
      intake: { motivation: '', heatType: '' },
      site: { yearBuilt: '', stories: '1.0', sqft: '', bedrooms: '', notes: '' },
      zones: {}, // zoneId -> zone data (created lazily)
      tests: {
        blower: { checklist: {}, ring: 'Open', cfm50: '', target: '', photos: {} },
        caz: { tests: {}, ambientCO: '', notes: '' },
        iaq: (function () {
          var t = { startedAt: null, finishedAt: null };
          DATA.IAQ_METRICS.forEach(function (m) { t[m.id] = ''; });
          return t;
        })()
      },
      notes: { team: '', customerPrep: '' }, // internal crew notes + customer prep list
      photos: [], // {id, zone, label, required, ts, tag}
      selections: [], // catalog measure ids
      recs: {}, // measureId -> {cost, savings, notes}
      proposalMedia: [], // photo ids selected for proposal
      proposalOmit: [] // selected measure ids unchecked from the proposal doc
    };
  }

  function seed() {
    var s = {
      version: 2,
      auditor: { name: '', initials: 'JD', company: 'HomSci Pro' },
      activeEvalId: null,
      evaluations: {}
    };
    // Demo appointments matching the Figma dashboard; removable in Settings.
    var e1 = blankEvaluation({ name: 'Jonathan Sterling', address: '1242 Oak St., Lake Forest', phone: '', email: '' });
    e1.appointment.time = '09:00';
    e1.demo = true;
    var e2 = blankEvaluation({ name: 'Elena Rodriguez', address: '88 Summit Ave., Summit', phone: '', email: '' });
    e2.appointment.time = '13:30';
    e2.appointment.type = 'Estimate';
    e2.appointment.state = 'Travel Pending';
    e2.demo = true;
    s.evaluations[e1.id] = e1;
    s.evaluations[e2.id] = e2;
    s.activeEvalId = e1.id;
    return s;
  }

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* corrupted state falls through to seed */ }
    return seed();
  }

  var state = load();
  var remotePaths = {}; // photoId -> storage path (for cloud-synced photos)

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch (e) { window.UI && UI.toast('Storage full — could not save. Export or clear old audits.'); }
  }

  /* ---------- IndexedDB photo store ---------- */
  function openDB() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('photos'); };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }
  function idbPut(id, dataUrl) {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('photos', 'readwrite');
        tx.objectStore('photos').put(dataUrl, id);
        tx.oncomplete = res; tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbDelete(id) {
    return openDB().then(function (db) {
      var tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').delete(id);
    });
  }
  function idbLoadAll() {
    return openDB().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction('photos', 'readonly');
        var store = tx.objectStore('photos');
        var out = {};
        var cur = store.openCursor();
        cur.onsuccess = function (ev) {
          var c = ev.target.result;
          if (c) { out[c.key] = c.value; c.continue(); } else res(out);
        };
        cur.onerror = function () { res({}); };
      });
    }).catch(function () { return {}; });
  }

  /* Downscale to keep storage lean while staying legible as evidence. */
  /* Downscale a capture; when stamp lines are given, burn them into the
     lower-right corner (date/time + GPS) before encoding. */
  function downscale(file, stampLines) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var MAX = 1024;
        var scale = Math.min(1, MAX / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (stampLines && stampLines.length) {
          var pad = Math.max(6, Math.round(canvas.width * 0.014));
          var fs = Math.max(11, Math.round(canvas.width * 0.024));
          var lh = Math.round(fs * 1.4);
          ctx.font = '600 ' + fs + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
          var w = 0;
          stampLines.forEach(function (l) { w = Math.max(w, ctx.measureText(l).width); });
          var boxW = Math.ceil(w) + pad * 2;
          var boxH = lh * stampLines.length + pad;
          var x = canvas.width - boxW - pad;
          var y = canvas.height - boxH - pad;
          ctx.fillStyle = 'rgba(10,14,12,0.6)';
          ctx.fillRect(x, y, boxW, boxH);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          stampLines.forEach(function (l, i) {
            ctx.fillText(l, canvas.width - pad * 2, y + Math.round(pad / 2) + i * lh);
          });
        }
        URL.revokeObjectURL(url);
        res(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      img.src = url;
    });
  }

  /* Best-effort device position for the photo stamp; resolves null rather
     than rejecting so a denied permission never blocks the capture. */
  function currentPosition() {
    return new Promise(function (res) {
      if (!navigator.geolocation) return res(null);
      try {
        navigator.geolocation.getCurrentPosition(
          function (pos) { res({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
          function () { res(null); },
          { enableHighAccuracy: true, timeout: 4000, maximumAge: 60000 }
        );
      } catch (e) { res(null); }
    });
  }

  function fmtCoords(lat, lng) {
    return Math.abs(lat).toFixed(4) + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' +
      Math.abs(lng).toFixed(4) + '° ' + (lng >= 0 ? 'E' : 'W');
  }

  /* ---------- Public API ---------- */
  window.Store = {
    state: state,
    save: save,
    uid: uid,

    init: function () {
      return idbLoadAll().then(function (all) {
        photoCache = all;
        Store.reindexRemote();
      });
    },

    activeEval: function () {
      return state.evaluations[state.activeEvalId] || null;
    },
    setActive: function (id) {
      if (state.evaluations[id]) { state.activeEvalId = id; save(); }
    },
    getEval: function (id) { return state.evaluations[id] || null; },
    listEvals: function () {
      return Object.keys(state.evaluations).map(function (k) { return state.evaluations[k]; })
        .sort(function (a, b) { return (a.appointment.date + a.appointment.time) < (b.appointment.date + b.appointment.time) ? -1 : 1; });
    },
    createEval: function (customer, appointment) {
      var ev = blankEvaluation(customer);
      if (appointment) Object.assign(ev.appointment, appointment);
      state.evaluations[ev.id] = ev;
      state.activeEvalId = ev.id;
      save();
      return ev;
    },
    deleteEval: function (id) {
      var ev = state.evaluations[id];
      if (!ev) return;
      ev.photos.forEach(function (p) { idbDelete(p.id); delete photoCache[p.id]; });
      delete state.evaluations[id];
      if (state.activeEvalId === id) state.activeEvalId = Object.keys(state.evaluations)[0] || null;
      save();
    },
    clearDemo: function () {
      Object.keys(state.evaluations).forEach(function (id) {
        if (state.evaluations[id].demo) Store.deleteEval(id);
      });
    },

    zone: function (ev, zoneId) {
      if (!ev.zones[zoneId]) {
        ev.zones[zoneId] = { complete: false, systems: {}, windows: [], fields: {} };
      }
      return ev.zones[zoneId];
    },

    /* set('path.to.field', value) against an evaluation object */
    set: function (obj, path, value) {
      var parts = path.split('.');
      var t = obj;
      for (var i = 0; i < parts.length - 1; i++) {
        if (t[parts[i]] == null) t[parts[i]] = {};
        t = t[parts[i]];
      }
      t[parts[parts.length - 1]] = value;
      save();
    },
    get: function (obj, path) {
      var t = obj;
      var parts = path.split('.');
      for (var i = 0; i < parts.length; i++) {
        if (t == null) return undefined;
        t = t[parts[i]];
      }
      return t;
    },

    /* ---------- Photos ---------- */
    /* Local (IndexedDB) first; photos synced from another device resolve to
       their public storage URL. */
    photoUrl: function (id) {
      if (photoCache[id]) return photoCache[id];
      var path = remotePaths[id];
      return path && window.Backend && Backend.ready() ? Backend.publicPhotoUrl(path) : null;
    },
    reindexRemote: function () {
      remotePaths = {};
      Object.keys(state.evaluations).forEach(function (k) {
        (state.evaluations[k].photos || []).forEach(function (p) {
          if (p.storagePath) remotePaths[p.id] = p.storagePath;
        });
      });
    },
    addPhoto: function (ev, meta, file) {
      var stampOn = Store.photoStampOn();
      var geo = stampOn ? currentPosition() : Promise.resolve(null);
      return geo.then(function (pos) {
        var now = new Date();
        var stampLines = null;
        if (stampOn) {
          stampLines = [
            now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            pos ? fmtCoords(pos.lat, pos.lng) : 'GPS unavailable'
          ];
        }
        return downscale(file, stampLines).then(function (dataUrl) {
          var p = Object.assign({ id: uid('ph'), ts: now.toISOString(), inspector: state.auditor.name || 'Field Auditor', tags: [] }, meta);
          if (pos) { p.lat = pos.lat; p.lng = pos.lng; }
          photoCache[p.id] = dataUrl;
          ev.photos.push(p);
          save();
          return idbPut(p.id, dataUrl).then(function () { return p; });
        });
      });
    },
    removePhoto: function (ev, photoId) {
      ev.photos = ev.photos.filter(function (p) { return p.id !== photoId; });
      ev.proposalMedia = (ev.proposalMedia || []).filter(function (id) { return id !== photoId; });
      delete photoCache[photoId];
      idbDelete(photoId);
      save();
    },
    photosBy: function (ev, filter) {
      return ev.photos.filter(function (p) {
        for (var k in filter) if (p[k] !== filter[k]) return false;
        return true;
      });
    },

    /* ---------- Derived values ---------- */
    /* ---- Admin-configurable content (overlays DATA defaults) ---- */
    catalog: function () {
      return (state.admin && state.admin.catalog) || DATA.CATALOG;
    },
    measure: function (id) {
      return Store.catalog().filter(function (m) { return m.id === id; })[0];
    },
    catalogCats: function () {
      var cats = [];
      Store.catalog().forEach(function (m) {
        if (m.cat && cats.indexOf(m.cat) < 0) cats.push(m.cat);
      });
      return ['All Measures'].concat(cats);
    },
    /* Benefits may be a shipped array or an admin-edited one-per-line string. */
    measureBenefits: function (m) {
      if (Array.isArray(m.benefits)) return m.benefits;
      return String(m.benefits || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    },
    /* prompts('motivations' | 'heatTypes') -> array of strings;
       prompts('blowerChecklist' | 'cazTests') -> array of {id, name, desc}. */
    prompts: function (key) {
      var p = state.admin && state.admin.prompts;
      if (key === 'motivations') {
        return p && p.motivations != null
          ? String(p.motivations).split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
          : DATA.MOTIVATIONS;
      }
      if (key === 'heatTypes') {
        return p && p.heatTypes != null
          ? String(p.heatTypes).split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
          : DATA.HEAT_TYPES;
      }
      if (key === 'blowerChecklist') return (p && p.blowerChecklist) || DATA.BLOWER_CHECKLIST;
      if (key === 'cazTests') return (p && p.cazTests) || DATA.CAZ_TESTS;
      return null;
    },
    pricingRules: function () {
      return (state.admin && state.admin.pricingRules) || [];
    },
    materials: function () {
      return (state.admin && state.admin.materials) || DATA.MATERIALS;
    },
    photoStampOn: function () {
      return !!(state.admin && state.admin.media && state.admin.media.stamp);
    },
    mediaTags: function () {
      var m = state.admin && state.admin.media;
      return m && m.tags != null
        ? String(m.tags).split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
        : DATA.MEDIA_TAGS;
    },
    /* Stable identifier for a required photo: names the slot it fills and,
       once the photo is in the proposal, appears in its figure caption. */
    photoRef: function (p) {
      if (!p || !p.required || !p.slotKey) return null;
      return String(p.slotKey).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    },
    guides: function () {
      return (state.admin && state.admin.guides) || DATA.TEST_GUIDES;
    },
    guide: function (id) {
      return Store.guides().filter(function (g) { return g.id === id; })[0];
    },
    material: function (id) {
      return Store.materials().filter(function (m) { return m.id === id; })[0];
    },

    /* Resolve an assessment quantity reference (audit field path or calc:*). */
    quantity: function (ev, ref) {
      if (ref === 'calc:windows') {
        var n = 0;
        ['floor1', 'floor2', 'floor3'].forEach(function (fid) {
          if (ev.zones[fid] && ev.zones[fid].windows) n += ev.zones[fid].windows.length;
        });
        return n;
      }
      if (ref === 'calc:mechanicals') {
        var mech = ev.zones.mechanicals;
        return mech ? Object.keys(mech.systems || {}).length : 0;
      }
      return parseFloat(Store.get(ev, ref)) || 0;
    },

    /* Cost build-up for a measure's attached materials against this audit.
       Each line: {name, unit, unitCost, qty, qtyLabel, cost, missing}. */
    materialLines: function (ev, m) {
      return (m.materials || []).map(function (id) {
        var mat = Store.material(id);
        if (!mat) return null;
        var unitCost = parseFloat(mat.cost) || 0;
        if (mat.unit === 'flat') {
          return { id: mat.id, name: mat.name, unit: 'flat', unitCost: unitCost, qty: 1, qtyLabel: '', cost: Math.round(unitCost), missing: false };
        }
        var q = Store.quantity(ev, mat.qty);
        return {
          id: mat.id, name: mat.name, unit: mat.unit, unitCost: unitCost,
          qty: q, qtyLabel: Admin.qtyLabel(mat.qty),
          cost: Math.round(q * unitCost), missing: !q
        };
      }).filter(Boolean);
    },

    /* Measures whose suggest-conditions match this audit's data, with the
       matching condition and the measured value (for the "because…" line).
       Already-selected measures are still returned so the section can show
       their added state. */
    suggestedMeasures: function (ev) {
      var out = [];
      Store.catalog().forEach(function (m) {
        var conds = m.suggest || [];
        for (var i = 0; i < conds.length; i++) {
          if (Admin.condMatches(conds[i], ev)) {
            out.push({ measure: m, cond: conds[i], value: Store.get(ev, conds[i].field) });
            return;
          }
        }
      });
      return out;
    },

    ashrae: function (ev) {
      var sqft = parseFloat(ev.site.sqft) || 0;
      var beds = parseInt(ev.site.bedrooms, 10);
      if (!sqft || isNaN(beds)) return null;
      var infiltration = 0.03 * sqft;
      var occupancy = 7.5 * (beds + 1);
      return {
        infiltration: Math.round(infiltration * 10) / 10,
        occupancy: Math.round(occupancy * 10) / 10,
        occupants: beds + 1,
        target: Math.round((infiltration + occupancy) * 10) / 10
      };
    },
    rValue: function (typeName, depth) {
      var t = DATA.INSULATION_TYPES.filter(function (x) { return x.name === typeName; })[0];
      var d = parseFloat(depth);
      if (!t || !d || !t.rPerInch) return null;
      var r = Math.round(t.rPerInch * d);
      var rating = r >= 49 ? 'OPTIMAL' : r >= 30 ? 'ADEQUATE' : 'BELOW CODE';
      return { r: r, rating: rating };
    },
    /* Returns the matched band object ({label, tone}) or null. */
    iaqBand: function (metric, value) {
      var v = parseFloat(value);
      if (isNaN(v)) return null;
      for (var i = 0; i < metric.bands.length; i++) {
        if (v <= metric.bands[i].max) return metric.bands[i];
      }
      return null;
    },
    iaqRequiredDone: function (ev) {
      return DATA.IAQ_METRICS.filter(function (m) { return m.required; })
        .every(function (m) { return ev.tests.iaq[m.id] !== '' && ev.tests.iaq[m.id] != null; });
    },

    /* Module statuses drive the Assessment Hub. */
    moduleStatus: function (ev) {
      var blower = ev.tests.blower;
      var checklistDone = Store.prompts('blowerChecklist').every(function (c) { return blower.checklist[c.id]; });
      var blowerPhotosDone = DATA.BLOWER_PHOTOS.filter(function (p) { return p.required; })
        .every(function (p) { return blower.photos[p.id]; });
      var blowerStatus = (blower.cfm50 && checklistDone && blowerPhotosDone) ? 'complete'
        : (blower.cfm50 || Object.keys(blower.checklist).some(function (k) { return blower.checklist[k]; })) ? 'progress' : 'pending';

      var caz = ev.tests.caz;
      var cazTests = Store.prompts('cazTests');
      var cazRecorded = cazTests.filter(function (t) { return caz.tests[t.id] && caz.tests[t.id].result; });
      var cazFailed = cazRecorded.some(function (t) { return caz.tests[t.id].result === 'FAIL'; });
      var cazStatus = cazFailed ? 'action'
        : cazRecorded.length === cazTests.length ? 'complete'
        : cazRecorded.length > 0 ? 'progress' : 'pending';

      var iaq = ev.tests.iaq;
      var iaqStatus = Store.iaqRequiredDone(ev) ? 'complete'
        : iaq.startedAt ? 'progress' : 'pending';

      var a = Store.ashrae(ev);
      var siteStatus = a ? 'complete' : (ev.site.yearBuilt || ev.site.sqft) ? 'progress' : 'pending';

      var zoneIds = DATA.ZONES.filter(function (z) { return !z.special; }).map(function (z) { return z.id; });
      var zonesDone = zoneIds.filter(function (id) { return ev.zones[id] && ev.zones[id].complete; }).length;

      return {
        site: siteStatus, blower: blowerStatus, caz: cazStatus, iaq: iaqStatus,
        zonesDone: zonesDone, zonesTotal: zoneIds.length,
        recsUnlocked: blowerStatus === 'complete' && iaqStatus === 'complete' &&
          (cazStatus === 'complete' || cazStatus === 'action')
      };
    },

    /* onlyIds (optional) restricts the plan to those measure ids — used by
       the proposal doc, where the assessor can uncheck measures.
       Each item's cost = admin base cost + matching pricing-rule
       adjustments; a manual cost entered in the Builder overrides both. */
    financials: function (ev, onlyIds) {
      var ids = onlyIds ? ev.selections.filter(function (id) { return onlyIds.indexOf(id) >= 0; }) : ev.selections;
      var rules = Store.pricingRules();
      var items = ids.map(function (id) {
        var m = Store.measure(id);
        if (!m) return null;
        var r = ev.recs[id] || {};
        var lines = Store.materialLines(ev, m);
        var base = lines.length
          ? lines.reduce(function (s, l) { return s + l.cost; }, 0)
          : parseFloat(m.cost) || 0;
        var adjustments = rules.filter(function (rule) {
          return Admin.ruleMatches(rule, ev, id) && (parseFloat(rule.amount) || 0) !== 0;
        }).map(function (rule) {
          return { label: rule.label || Admin.fieldLabel(rule.field), amount: Admin.ruleAmount(rule, ev, base) };
        });
        var auto = base + adjustments.reduce(function (s, a) { return s + a.amount; }, 0);
        var manual = r.cost != null && r.cost !== '' ? parseFloat(r.cost) : NaN;
        return {
          measure: m,
          base: base,
          materialLines: lines,
          adjustments: adjustments,
          autoCost: auto,
          cost: isNaN(manual) ? auto : manual,
          savings: parseFloat(r.savings) || parseFloat(m.savings) || 0,
          notes: r.notes || ''
        };
      }).filter(Boolean);
      var cost = items.reduce(function (s, i) { return s + i.cost; }, 0);
      var savings = items.reduce(function (s, i) { return s + i.savings; }, 0);
      var crawl = ev.zones.crawlspace && ev.zones.crawlspace.fields;
      var upcharge = (crawl && crawl.clearance !== undefined && crawl.clearance !== '' &&
        parseFloat(crawl.clearance) < DATA.CRAWL_MIN_CLEARANCE_IN) ? DATA.CRAWL_UPCHARGE : 0;
      return {
        items: items,
        upcharge: upcharge,
        cost: cost + upcharge,
        savings: savings,
        payback: savings > 0 ? Math.round(((cost + upcharge) / savings) * 10) / 10 : null,
        roi: cost > 0 ? Math.round((savings / (cost + upcharge)) * 1000) / 10 : null
      };
    },

    /* ---------- Sync (Supabase backend — see js/backend.js) ---------- */
    sync: function (ev) {
      return Backend.syncAudit(ev);
    }
  };
})();
