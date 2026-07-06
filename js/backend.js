/* Supabase backend (replaces the legacy Google Apps Script endpoint).
   Talks straight to PostgREST + Storage over fetch — no SDK, so the app
   stays dependency-free and keeps working from file:// and offline.

   Offline-first contract:
   - All writes happen locally first (localStorage / IndexedDB).
   - "Finalize & Sync" (or Settings → Sync now) pushes pending audits.
   - Photos upload to the audit-photos storage bucket; rows land in
     public.audits / public.audit_photos.
   - A reconnect (online event) retries anything still pending.

   NOTE: the publishable (anon) key is safe to embed by design; table access
   is limited by RLS policies. Field-crew auth can be layered on later
   without changing this module's shape. */
(function () {
  var CFG = window.BACKEND_CONFIG || { url: '', anonKey: '' };

  function ready() { return !!(CFG.url && CFG.anonKey); }

  function headers(extra) {
    /* RLS is authenticated-only: data calls carry the crew member's access
       token. The anon key remains the apikey (project routing) only. */
    var token = (window.Auth && Auth.accessToken()) || CFG.anonKey;
    var h = {
      'apikey': CFG.anonKey,
      'Authorization': 'Bearer ' + token
    };
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  function requireAuth() {
    if (!window.Auth) return Promise.resolve(null);
    return Auth.ensureFresh().then(function (token) {
      if (!token) throw new Error('SIGN_IN_REQUIRED');
      return token;
    });
  }

  function rest(path, opts) {
    opts = opts || {};
    return fetch(CFG.url + '/rest/v1/' + path, {
      method: opts.method || 'GET',
      headers: headers(Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {})),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200)); });
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var mime = (parts[0].match(/data:([^;]+)/) || [null, 'image/jpeg'])[1];
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function uploadPhoto(evId, photo, dataUrl) {
    var path = evId + '/' + photo.id + '.jpg';
    return fetch(CFG.url + '/storage/v1/object/audit-photos/' + path, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }),
      body: dataUrlToBlob(dataUrl)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('upload ' + r.status + ': ' + t.slice(0, 120)); });
      return rest('audit_photos', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: [{
          id: photo.id, audit_id: evId, zone: photo.zone || '', label: photo.label || '',
          tag: photo.tag || '', storage_path: path,
          taken_at: photo.ts || null, inspector: photo.inspector || ''
        }]
      }).then(function () { return path; });
    });
  }

  window.Backend = {
    ready: ready,
    publicPhotoUrl: function (storagePath) {
      return CFG.url + '/storage/v1/object/public/audit-photos/' + storagePath;
    },

    /* Push one audit: upsert the record, then upload any photos that
       haven't made it to the cloud yet. Partial progress is remembered. */
    syncAudit: function (ev) {
      if (!ready()) return Promise.reject(new Error('Backend not configured'));
      ev.syncState = ev.syncState || { photos: {} };
      var payload = JSON.parse(JSON.stringify(ev));
      delete payload.syncState;

      return requireAuth().then(function () {
        return Backend._syncAuthed(ev, payload);
      });
    },

    _syncAuthed: function (ev, payload) {
      return rest('audits', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: [{
          id: ev.id,
          customer_name: ev.customer.name || '',
          address: ev.customer.address || '',
          status: ev.status,
          appointment_date: ev.appointment.date || null,
          photo_count: ev.photos.length,
          payload: payload,
          updated_at: new Date().toISOString()
        }]
      }).then(function () {
        var pending = ev.photos.filter(function (p) { return !ev.syncState.photos[p.id]; });
        var chain = Promise.resolve();
        pending.forEach(function (p) {
          chain = chain.then(function () {
            var dataUrl = Store.photoUrl(p.id);
            if (!dataUrl || dataUrl.indexOf('data:') !== 0) return null; // remote-only photo
            return uploadPhoto(ev.id, p, dataUrl).then(function (path) {
              ev.syncState.photos[p.id] = path;
              p.storagePath = path;
              Store.save();
            });
          });
        });
        return chain;
      }).then(function () {
        ev.synced = true;
        ev.syncState.at = new Date().toISOString();
        ev.syncState.error = null;
        Store.save();
        return true;
      }).catch(function (e) {
        ev.syncState = ev.syncState || { photos: {} };
        ev.syncState.error = e.message;
        Store.save();
        throw e;
      });
    },

    /* Pull remote audits (e.g. captured on another device) into History. */
    pullAudits: function () {
      if (!ready()) return Promise.resolve(0);
      return requireAuth().then(function () {
        return rest('audits?select=id,payload,updated_at&order=updated_at.desc&limit=100');
      })
        .then(function (rows) {
          var added = 0;
          (rows || []).forEach(function (row) {
            if (!row.payload || Store.getEval(row.id)) return;
            var ev = row.payload;
            ev.remote = true;
            ev.synced = true;
            Store.state.evaluations[ev.id] = ev;
            added++;
          });
          if (added) Store.save();
          return added;
        });
    },

    /* Retry every finalized-but-unsynced audit (called on reconnect). */
    syncPending: function () {
      if (!ready()) return Promise.resolve();
      var pending = Store.listEvals().filter(function (e) {
        return e.status === 'complete' && !e.synced && !e.remote;
      });
      var chain = Promise.resolve();
      pending.forEach(function (e) {
        chain = chain.then(function () {
          return Backend.syncAudit(e).catch(function () { /* stays pending */ });
        });
      });
      return chain;
    }
  };
})();
