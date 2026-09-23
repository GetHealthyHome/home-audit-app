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
    var prevRole = Store.state.session && Store.state.session.user && Store.state.session.user.role;
    Store.state.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: { id: data.user && data.user.id, email: email, name: name, role: prevRole || null }
    };
    // Keep the auditor profile in step with the signed-in crew member.
    Store.state.auditor.name = name;
    Store.state.auditor.initials = name.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase() || 'FA';
    Store.save();
  }

  /* Pull the crew member's profile row (role + display name) after sign-in.
     Failure (offline) keeps the last known role. */
  function fetchProfile() {
    var s = Store.state.session;
    if (!s || !s.user || !s.user.id) return Promise.resolve(null);
    return fetch(CFG.url + '/rest/v1/profiles?select=role,name&id=eq.' + s.user.id, {
      headers: { 'apikey': CFG.anonKey, 'Authorization': 'Bearer ' + s.access_token }
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (rows && rows[0]) {
          s.user.role = rows[0].role;
          if (rows[0].name) s.user.name = rows[0].name;
          Store.save();
        }
        return s.user.role;
      }).catch(function () { return s.user.role || null; });
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
        .then(function (data) { storeSession(data); return fetchProfile().then(function () { return data; }); });
    },

    /* New crew accounts. If email confirmation is enabled on the project,
       no session comes back — surface that to the caller. */
    signup: function (email, password, name) {
      return authFetch('signup', { email: email, password: password, data: { name: name || '' } })
        .then(function (data) {
          if (data.access_token) {
            storeSession(data);
            return fetchProfile().then(function () { return { active: true }; });
          }
          return { active: false }; // confirmation email pending
        });
    },

    /* ---- Roles ---- */
    role: function () {
      var s = Store.state.session;
      return (s && s.user && s.user.role) || null;
    },
    /* Without a configured backend the app is a single-device tool — admin
       features stay open. With a backend, admin requires the admin role. */
    isAdmin: function () {
      var cfg = window.BACKEND_CONFIG || {};
      if (!cfg.url || !cfg.anonKey) return true;
      return Auth.role() === 'admin';
    },
    refreshProfile: fetchProfile,

    changePassword: function (newPassword) {
      return Auth.ensureFresh().then(function (token) {
        if (!token) throw new Error('SIGN_IN_REQUIRED');
        return fetch(CFG.url + '/auth/v1/user', {
          method: 'PUT',
          headers: { 'apikey': CFG.anonKey, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPassword })
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (!r.ok) throw new Error(data.msg || data.message || ('Password change failed (HTTP ' + r.status + ')'));
            return true;
          });
        });
      });
    },

    /* Admin-only crew management via the crew-admin edge function.
       payload: {action: 'create'|'set-role'|'set-password'|'delete', ...} */
    crewAdmin: function (payload) {
      return Auth.ensureFresh().then(function (token) {
        if (!token) throw new Error('SIGN_IN_REQUIRED');
        return fetch(CFG.url + '/functions/v1/crew-admin', {
          method: 'POST',
          headers: { 'apikey': CFG.anonKey, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok || data.error) throw new Error(data.error || ('Crew admin failed (HTTP ' + r.status + ')'));
          return data;
        });
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
