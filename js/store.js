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
        iaq: { startedAt: null, finishedAt: null, co2: '', voc: '' }
      },
      photos: [], // {id, zone, label, required, ts, tag}
      selections: [], // catalog measure ids
      recs: {}, // measureId -> {cost, savings, notes}
      proposalMedia: [] // photo ids selected for proposal
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
  function downscale(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var MAX = 1024;
        var scale = Math.min(1, MAX / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        res(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      img.src = url;
    });
  }

  /* ---------- Public API ---------- */
  window.Store = {
    state: state,
    save: save,
    uid: uid,

    init: function () {
      return idbLoadAll().then(function (all) { photoCache = all; });
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
    photoUrl: function (id) { return photoCache[id] || null; },
    addPhoto: function (ev, meta, file) {
      return downscale(file).then(function (dataUrl) {
        var p = Object.assign({ id: uid('ph'), ts: new Date().toISOString(), inspector: state.auditor.name || 'Field Auditor' }, meta);
        photoCache[p.id] = dataUrl;
        ev.photos.push(p);
        save();
        return idbPut(p.id, dataUrl).then(function () { return p; });
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
    iaqBand: function (metric, value) {
      var v = parseFloat(value);
      if (isNaN(v)) return null;
      for (var i = 0; i < metric.bands.length; i++) {
        if (v <= metric.bands[i].max) return metric.bands[i].label;
      }
      return null;
    },

    /* Module statuses drive the Assessment Hub. */
    moduleStatus: function (ev) {
      var blower = ev.tests.blower;
      var checklistDone = DATA.BLOWER_CHECKLIST.every(function (c) { return blower.checklist[c.id]; });
      var blowerPhotosDone = DATA.BLOWER_PHOTOS.filter(function (p) { return p.required; })
        .every(function (p) { return blower.photos[p.id]; });
      var blowerStatus = (blower.cfm50 && checklistDone && blowerPhotosDone) ? 'complete'
        : (blower.cfm50 || Object.keys(blower.checklist).some(function (k) { return blower.checklist[k]; })) ? 'progress' : 'pending';

      var caz = ev.tests.caz;
      var cazRecorded = DATA.CAZ_TESTS.filter(function (t) { return caz.tests[t.id] && caz.tests[t.id].result; });
      var cazFailed = cazRecorded.some(function (t) { return caz.tests[t.id].result === 'FAIL'; });
      var cazStatus = cazFailed ? 'action'
        : cazRecorded.length === DATA.CAZ_TESTS.length ? 'complete'
        : cazRecorded.length > 0 ? 'progress' : 'pending';

      var iaq = ev.tests.iaq;
      var iaqStatus = (iaq.co2 !== '' && iaq.voc !== '') ? 'complete'
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

    financials: function (ev) {
      var items = ev.selections.map(function (id) {
        var m = DATA.CATALOG.filter(function (c) { return c.id === id; })[0];
        if (!m) return null;
        var r = ev.recs[id] || {};
        return {
          measure: m,
          cost: parseFloat(r.cost) || m.cost,
          savings: parseFloat(r.savings) || m.savings,
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

    /* ---------- Sync (legacy Apps Script endpoint) ---------- */
    sync: function (ev) {
      var payload = JSON.parse(JSON.stringify(ev));
      payload.photos = ev.photos.map(function (p) {
        return { id: p.id, zone: p.zone, label: p.label, ts: p.ts, inspector: p.inspector };
      });
      payload.photoCount = ev.photos.length;
      return fetch(DATA.DATABASE_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) })
        .then(function () { ev.synced = true; save(); return true; });
    }
  };
})();
