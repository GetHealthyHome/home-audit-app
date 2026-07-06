/* Crew authentication — Supabase Auth (GoTrue) over plain fetch, matching
   the SDK-free architecture. The app stays fully usable offline without an
   account; signing in is what unlocks cloud sync (RLS is authenticated-only).

   Session shape persisted in Store.state.session:
   { access_token, refresh_token, expires_at (epoch s), user: { id, email, name } } */
(function () {
  var CFG = window.BACKEND_CONFIG || { url: '', anonKey: '' };

  function authFetch(path, body) {
    return fetch(CFG.url + '/auth/v1/' + path, {
      method: 'POST',
      headers: { 'apikey': CFG.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var msg = data.error_description || data.msg || data.message || ('Auth error (HTTP ' + r.status + ')');
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function storeSession(data) {
    var meta = (data.user && data.user.user_metadata) || {};
    var email = (data.user && data.user.email) || '';
    var name = meta.name || email.split('@')[0] || 'Field Auditor';
    Store.state.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: { id: data.user && data.user.id, email: email, name: name }
    };
    // Keep the auditor profile in step with the signed-in crew member.
    Store.state.auditor.name = name;
    Store.state.auditor.initials = name.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase() || 'FA';
    Store.save();
  }

  window.Auth = {
    session: function () { return Store.state.session || null; },

    signedIn: function () {
      var s = Store.state.session;
      return !!(s && s.access_token);
    },

    accessToken: function () {
      var s = Store.state.session;
      return s ? s.access_token : null;
    },

    login: function (email, password) {
      return authFetch('token?grant_type=password', { email: email, password: password })
        .then(function (data) { storeSession(data); return data; });
    },

    /* New crew accounts. If email confirmation is enabled on the project,
       no session comes back — surface that to the caller. */
    signup: function (email, password, name) {
      return authFetch('signup', { email: email, password: password, data: { name: name || '' } })
        .then(function (data) {
          if (data.access_token) { storeSession(data); return { active: true }; }
          return { active: false }; // confirmation email pending
        });
    },

    logout: function () {
      var s = Store.state.session;
      var done = function () { delete Store.state.session; Store.save(); };
      if (!s) { done(); return Promise.resolve(); }
      return fetch(CFG.url + '/auth/v1/logout', {
        method: 'POST',
        headers: { 'apikey': CFG.anonKey, 'Authorization': 'Bearer ' + s.access_token }
      }).catch(function () { /* offline logout is still a logout locally */ })
        .then(done);
    },

    /* Resolve a fresh access token, refreshing if within 60s of expiry.
       Resolves null when signed out or refresh fails (session cleared). */
    ensureFresh: function () {
      var s = Store.state.session;
      if (!s || !s.access_token) return Promise.resolve(null);
      var now = Math.floor(Date.now() / 1000);
      if (s.expires_at && s.expires_at - now > 60) return Promise.resolve(s.access_token);
      if (!s.refresh_token) return Promise.resolve(s.access_token);
      return authFetch('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
        .then(function (data) { storeSession(data); return data.access_token; })
        .catch(function () {
          delete Store.state.session;
          Store.save();
          return null;
        });
    }
  };
})();
