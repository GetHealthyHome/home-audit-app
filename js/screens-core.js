/* Core screens: Dashboard, New Evaluation, Assessment Hub, Site Info,
   History, Settings. */
(function () {
  var esc = UI.esc;

  function fmtDay(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  function fmtTime(t) {
    if (!t) return { hm: '--:--', ap: '' };
    var parts = t.split(':');
    var h = parseInt(parts[0], 10);
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    return { hm: (h12 < 10 ? '0' : '') + h12 + ':' + parts[1], ap: ap };
  }

  /* ---------------- Dashboard ---------------- */
  function apptCard(e) {
    var t = fmtTime(e.appointment.time);
    var chip = e.appointment.type === 'Estimate' ? 'chip-est' : 'chip-eval';
    return '<button class="appt-card" data-action="open-eval" data-id="' + e.id + '">' +
      '<div class="top"><div class="who"><b>' + esc(e.customer.name || 'Unnamed customer') + '</b>' +
      '<span class="loc">' + icon('pin') + esc(e.customer.address || 'No address') + '</span></div>' +
      '<div class="when">' + t.hm + '<small>' + t.ap + '</small></div></div>' +
      '<div class="bottom"><span style="display:inline-flex;gap:6px"><span class="pill ' + chip + '">' + esc(e.appointment.type) + '</span>' +
      (e.source === 'housecallpro' ? '<span class="pill magenta">HCP</span>' : '') + '</span>' +
      '<span class="state">' + esc(e.appointment.state) + '</span></div>' +
      '</button>';
  }

  function calendarView(open, calMonth, calSelected) {
    // calMonth: 'YYYY-MM'
    var parts = calMonth.split('-');
    var year = parseInt(parts[0], 10), month = parseInt(parts[1], 10) - 1;
    var first = new Date(year, month, 1);
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var startDow = first.getDay(); // 0 = Sunday
    var todayIso = new Date().toISOString().slice(0, 10);

    var byDay = {};
    open.forEach(function (e) {
      (byDay[e.appointment.date] = byDay[e.appointment.date] || []).push(e);
    });

    var monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    var prev = month === 0 ? (year - 1) + '-12' : year + '-' + String(month < 10 ? '0' : '') + month;
    var next = month === 11 ? (year + 1) + '-01' : year + '-' + (month + 2 < 10 ? '0' : '') + (month + 2);

    var cells = '';
    for (var i = 0; i < startDow; i++) cells += '<span class="cal-cell empty"></span>';
    for (var d = 1; d <= daysInMonth; d++) {
      var iso = year + '-' + (month + 1 < 10 ? '0' : '') + (month + 1) + '-' + (d < 10 ? '0' : '') + d;
      var has = byDay[iso];
      cells += '<button class="cal-cell' + (iso === todayIso ? ' today' : '') +
        (iso === calSelected ? ' selected' : '') + '" data-action="cal-day" data-date="' + iso + '">' +
        d + (has ? '<span class="cal-dots">' + has.slice(0, 3).map(function (e) {
          return '<span class="cd ' + (e.appointment.type === 'Estimate' ? 'est' : 'ev') + '"></span>';
        }).join('') + '</span>' : '') + '</button>';
    }

    var dayList = '';
    if (calSelected) {
      var todays = byDay[calSelected] || [];
      dayList = '<div class="day-label">' + esc(fmtDay(calSelected)) + '</div>' +
        (todays.map(apptCard).join('') ||
          '<div class="empty" style="padding:18px"><p>Nothing scheduled this day.</p></div>');
    }

    return '<div class="card cal-card">' +
      '<div class="cal-head">' +
      '<button class="iconbtn" data-action="cal-nav" data-month="' + prev + '" aria-label="Previous month">' + icon('back') + '</button>' +
      '<b>' + esc(monthLabel) + '</b>' +
      '<button class="iconbtn" data-action="cal-nav" data-month="' + next + '" aria-label="Next month" style="transform:scaleX(-1)">' + icon('back') + '</button>' +
      '</div>' +
      '<div class="cal-grid cal-dow">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="cal-legend"><span><span class="cd ev"></span> Evaluation</span><span><span class="cd est"></span> Estimate</span></div>' +
      '</div>' + dayList;
  }

  window.ScreenDashboard = function (view, calMonth, calSelected) {
    view = view || 'list';
    var evals = Store.listEvals();
    var open = evals.filter(function (e) { return e.status !== 'complete'; });
    var next = open.filter(function (e) { return e.appointment.time; })[0];

    var byDay = {};
    open.forEach(function (e) {
      (byDay[e.appointment.date] = byDay[e.appointment.date] || []).push(e);
    });

    var schedule = Object.keys(byDay).sort().map(function (day) {
      return '<div class="day-label">' + esc(fmtDay(day)) + '</div>' + byDay[day].map(apptCard).join('');
    }).join('');

    return UI.appbar({
        actions: Backend.ready() ? '<button class="iconbtn" data-action="hcp-import" aria-label="Import Housecall Pro jobs" title="Import Housecall Pro jobs">' + icon('truck') + '</button>' : ''
      }) +
      '<div class="screen">' +
      '<div class="searchbar">' + icon('search') +
      '<input placeholder="Find prior evaluations by customer name" data-action-input="dash-search"></div>' +
      '<div id="dash-results"></div>' +
      '<div class="stat-cards">' +
      '<div class="stat-card"><div class="k">Active Pipeline</div><div class="v">' + open.length +
      '<small>Audits</small></div></div>' +
      '<div class="stat-card fill"><div class="k">Next Appointment</div><div class="v">' +
      (next ? fmtTime(next.appointment.time).hm + ' ' + fmtTime(next.appointment.time).ap : '—') + '</div></div>' +
      '</div>' +
      '<div class="section-heading"><h2>Schedule</h2>' +
      '<div class="segmented lite" style="width:110px">' +
      '<button class="' + (view === 'list' ? 'on' : '') + '" data-action="dash-view" data-view="list">List</button>' +
      '<button class="' + (view === 'cal' ? 'on' : '') + '" data-action="dash-view" data-view="cal">Cal</button></div></div>' +
      (view === 'cal'
        ? calendarView(open, calMonth || new Date().toISOString().slice(0, 7), calSelected)
        : (schedule || '<div class="empty">' + icon('clipboard') + '<b>No audits scheduled</b><p>Tap + to start a new evaluation.</p></div>')) +
      '</div>';
  };

  window.dashSearch = function (q) {
    var box = document.getElementById('dash-results');
    if (!box) return;
    q = q.trim().toLowerCase();
    if (!q) { box.innerHTML = ''; return; }
    var hits = Store.listEvals().filter(function (e) {
      return (e.customer.name || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 5);
    box.innerHTML = hits.map(function (e) {
      return '<button class="module-row" data-action="open-eval" data-id="' + e.id + '">' +
        '<span class="mic">' + icon('user') + '</span>' +
        '<span class="mbody"><b>' + esc(e.customer.name) + '</b>' + UI.pill(e.status === 'complete' ? 'complete' : 'progress') + '</span>' +
        '<span class="chev">' + icon('chevR') + '</span></button>';
    }).join('') || '<div class="empty"><p>No matching evaluations.</p></div>';
  };

  /* ---------------- New Evaluation ---------------- */
  window.ScreenNewEval = function () {
    return UI.subbar('New Evaluation', '#/dashboard') +
      '<div class="screen">' +
      '<span class="eyebrow">' + icon('sparkle') + ' Field Assessment</span>' +
      '<h1 class="screen-title">New Evaluation</h1>' +
      '<p class="screen-sub">Capture environmental data for your clinical record.</p>' +
      '<div class="card">' +
      '<h3>Customer Information</h3><p class="hint">Who and where we are evaluating.</p>' +
      UI.field({ label: 'Full Name', bind: 'new.name', required: true, placeholder: 'e.g. Dr. Julian Voss', value: draft.name }) +
      UI.field({ label: 'Service Address', bind: 'new.address', required: true, placeholder: '124 Organic Lane, Portland, OR', value: draft.address }) +
      UI.field({ label: 'Phone Number', bind: 'new.phone', type: 'tel', placeholder: '+1 (555) 000-0000', value: draft.phone }) +
      UI.field({ label: 'Email Address', bind: 'new.email', type: 'email', placeholder: 'voss@precision.com', value: draft.email }) +
      '</div>' +
      '<div class="card">' +
      '<h3>Visit</h3><p class="hint">Type and timing of the appointment.</p>' +
      UI.segmented('new.type', ['Evaluation', 'Estimate'], draft.type || 'Evaluation') +
      '<div style="height:12px"></div>' +
      UI.field({ label: 'Date', bind: 'new.date', type: 'date', value: draft.date || new Date().toISOString().slice(0, 10) }) +
      UI.field({ label: 'Time', bind: 'new.time', type: 'time', value: draft.time }) +
      '<div class="card" style="background:var(--surface-2);border:none;margin:4px 0 0">' +
      UI.field({ label: 'Primary Motivation', bind: 'new.motivation', options: DATA.MOTIVATIONS, value: draft.motivation }) +
      UI.field({ label: 'Heating System Type', bind: 'new.heatType', options: DATA.HEAT_TYPES, value: draft.heatType }) +
      '</div></div>' +
      '<div class="cta-dock">' +
      '<button class="btn primary" data-action="create-eval" data-start="1">Start Evaluation ' + icon('chevR') + '</button>' +
      '<div style="height:8px"></div>' +
      '<button class="btn secondary" data-action="create-eval">Schedule for later</button>' +
      '</div></div>';
  };
  var draft = {};
  window.NewEvalDraft = draft;

  /* ---------------- Assessment Hub ---------------- */
  window.ScreenHub = function (ev) {
    var ms = Store.moduleStatus(ev);
    function moduleRow(route, iconName, name, status, extra) {
      var locked = status === 'locked';
      return '<button class="module-row ' + (status === 'action' ? 'action-required' : '') + (locked ? ' locked' : '') + '"' +
        (locked ? ' data-action="toast" data-msg="Complete Blower Door, IAQ and Combustion Safety to unlock recommendations."'
                : ' data-action="nav" data-route="' + route + '"') + '>' +
        '<span class="mic">' + icon(iconName) + '</span>' +
        '<span class="mbody"><b>' + esc(name) + '</b>' +
        (locked ? UI.pill('pending', 'Awaiting Tests') : UI.pill(status)) + (extra || '') + '</span>' +
        '<span class="chev">' + icon(locked ? 'lock' : 'chevR') + '</span></button>';
    }

    var zoneRows = DATA.ZONES.filter(function (z) { return !z.special; }).map(function (z) {
      var zd = ev.zones[z.id];
      var st = zd && zd.complete ? 'complete' : zd ? 'progress' : 'pending';
      return moduleRow('#/eval/' + ev.id + '/zone/' + z.id, z.icon, z.name, st);
    }).join('');

    return UI.subbar('Assessment Hub', '#/dashboard',
        '<button class="iconbtn" data-action="nav" data-route="#/eval/' + ev.id + '/record" aria-label="Summary">' + icon('doc') + '</button>') +
      '<div class="screen">' +
      '<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
      '<div><b style="display:flex;align-items:center;gap:6px">' + icon('pin') + esc(ev.customer.address || 'No address') + '</b>' +
      '<p class="hint" style="margin:6px 0 0">Customer: ' + esc(ev.customer.name || '—') + '</p></div>' +
      UI.pill(ev.status === 'complete' ? 'complete' : 'progress') + '</div></div>' +

      UI.sectionHeading('Diagnostics', 'shield') +
      moduleRow('#/eval/' + ev.id + '/blower', 'wind', 'Blower Door Test', ms.blower) +
      moduleRow('#/eval/' + ev.id + '/iaq', 'air', 'IAQ Test', ms.iaq) +
      moduleRow('#/eval/' + ev.id + '/caz', 'flame', 'Combustion Safety', ms.caz) +
      moduleRow('#/eval/' + ev.id + '/site', 'home', 'Site Overview', ms.site) +

      UI.sectionHeading('Mechanicals', 'boiler') +
      (function () {
        var mech = ev.zones.mechanicals;
        var count = mech ? Object.keys(mech.systems || {}).length : 0;
        var st = mech && mech.complete ? 'complete' : count > 0 ? 'progress' : 'pending';
        return moduleRow('#/eval/' + ev.id + '/mechanicals', 'boiler', 'Mechanical Systems', st,
          '<span style="display:block;font:600 11px var(--font-body);color:var(--faint);margin-top:4px">' +
          (count ? count + ' system' + (count > 1 ? 's' : '') + ' recorded' : 'Heating, HVAC, water heater, electrical panel') + '</span>');
      })() +

      UI.sectionHeading('Zone Assessments', 'grid',
        '<span class="aux">' + ms.zonesDone + ' / ' + ms.zonesTotal + ' complete</span>') +
      zoneRows +

      UI.sectionHeading('Deliverables', 'doc') +
      '<button class="module-row" data-action="nav" data-route="#/eval/' + ev.id + '/energy">' +
      '<span class="mic" style="background:var(--blue-soft);color:var(--blue-ink)">' + icon('chart') + '</span>' +
      '<span class="mbody"><b>Energy Model</b>' +
      (ev.energyModel && ev.energyModel.climate ? UI.pill('complete', 'Modeled') : UI.pill('progress', 'Optional')) +
      '<span style="display:block;font:600 11px var(--font-body);color:var(--faint);margin-top:4px">Climate-normalized cost model — run on request</span></span>' +
      '<span class="chev">' + icon('chevR') + '</span></button>' +
      moduleRow('#/eval/' + ev.id + '/catalog', 'bolt', 'Improvement Recommendations', ms.recsUnlocked ? (ev.selections.length ? 'progress' : 'pending') : 'locked') +
      moduleRow('#/eval/' + ev.id + '/media', 'photo', 'Media Review & Tagging', ev.photos.length ? 'progress' : 'pending',
        '<span style="display:block;font:600 11px var(--font-body);color:var(--faint);margin-top:4px">' + ev.photos.length + ' photos captured</span>') +
      '</div>';
  };

  /* ---------------- Site Info & Building Science ---------------- */
  window.ScreenSite = function (ev) {
    var a = Store.ashrae(ev);
    return UI.subbar('Site Info', '#/eval/' + ev.id + '/hub') +
      '<div class="screen">' +
      '<span class="eyebrow">' + icon('sparkle') + ' Field Assessment</span>' +
      '<h1 class="screen-title">Site Info &amp; Building Science</h1>' +
      '<p class="screen-sub">Detailed audit of the physical envelope and occupancy loads.</p>' +

      '<div class="card">' + UI.sectionHeading('Structural Parameters', 'ruler') +
      UI.field({ label: 'Year Built', bind: 'site.yearBuilt', type: 'number', inputmode: 'numeric', placeholder: '1992', value: ev.site.yearBuilt }) +
      '<div class="field"><label>Stories Above Grade</label>' +
      UI.segmented('site.stories', ['1.0', '1.5', '2.0', '3+'], ev.site.stories) + '</div>' +
      UI.field({ label: 'Conditioned Square Footage (SqFt)', bind: 'site.sqft', type: 'number', inputmode: 'numeric', unit: 'ft²', big: true, placeholder: '2450', value: ev.site.sqft }) +
      UI.field({ label: 'Number of Bedrooms', bind: 'site.bedrooms', type: 'number', inputmode: 'numeric', placeholder: '4', value: ev.site.bedrooms }) +
      '</div>' +

      '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
      '<div><h3>Minimum Building Airflow</h3><p class="hint">ASHRAE 62.2 Calculation</p></div>' +
      '<span class="badge-ic" style="width:34px;height:34px;border-radius:10px;background:var(--green-soft);color:var(--green);display:inline-flex;align-items:center;justify-content:center">' + icon('wind') + '</span></div>' +
      (a ?
        '<div class="bignum">' + a.target.toFixed(0) + '<small>CFM</small></div>' +
        '<p class="hint">Recommended continuous mechanical ventilation</p>' +
        '<div class="kv-list" style="margin-top:10px">' +
        '<div class="kv-row"><span class="k">Infiltration (0.03 × ' + esc(ev.site.sqft) + ')</span><span class="v">' + a.infiltration.toFixed(1) + '</span></div>' +
        '<div class="kv-row"><span class="k">Occupancy (7.5 × ' + a.occupants + ')</span><span class="v">' + a.occupancy.toFixed(1) + '</span></div>' +
        '<div class="kv-row"><span class="k">Target MBA</span><span class="v good">' + a.target.toFixed(1) + '</span></div>' +
        '</div>'
        :
        '<div class="empty" style="padding:18px"><p>Enter square footage and bedrooms to compute the ASHRAE 62.2 target airflow.</p></div>') +
      '</div>' +

      (a ? '<div class="lockbar" style="background:var(--green-soft);color:var(--green)">' +
        '<b style="color:var(--green)">' + icon('shield') + ' Calculations Validated</b>' +
        '<span style="color:var(--green-deep)">Audit status: structural parameters captured.</span></div>' : '') +

      '<div class="card">' + UI.sectionHeading('Site Notes', 'note') +
      UI.field({ label: 'Observations', bind: 'site.notes', textarea: true, placeholder: 'Orientation, shading, access notes…', value: ev.site.notes }) +
      '</div>' +

      '<div class="cta-dock"><button class="btn primary" data-action="nav" data-route="#/eval/' + ev.id + '/hub">Save &amp; Return to Hub</button></div>' +
      '</div>';
  };

  /* ---------------- History ---------------- */
  window.ScreenHistory = function (query) {
    query = (query || '').toLowerCase();
    var evals = Store.listEvals();
    var hits = evals.filter(function (e) {
      if (!query) return true;
      return (e.customer.name + ' ' + e.customer.address).toLowerCase().indexOf(query) >= 0;
    });
    var rows = hits.map(function (e) {
      var fin = Store.financials(e);
      return '<button class="appt-card" data-action="open-eval" data-id="' + e.id + '">' +
        '<div class="top"><div class="who"><b>' + esc(e.customer.name || 'Unnamed') + '</b>' +
        '<span class="loc">' + icon('pin') + esc(e.customer.address || '—') + '</span></div>' +
        UI.pill(e.status === 'complete' ? 'complete' : 'progress') + '</div>' +
        '<div class="bottom"><span class="state">' + esc(fmtDay(e.appointment.date)) + '</span>' +
        '<span class="state">' + e.photos.length + ' photos · ' + e.selections.length + ' measures' +
        (fin.cost ? ' · ' + UI.money(fin.cost) : '') + '</span></div></button>';
    }).join('');

    return UI.appbar() +
      '<div class="screen">' +
      '<span class="eyebrow magenta">' + icon('archive') + ' Historical Repository</span>' +
      '<h1 class="screen-title">Audit History</h1>' +
      '<p class="screen-sub">Found ' + hits.length + ' matching evaluation' + (hits.length === 1 ? '' : 's') + '.</p>' +
      '<div class="searchbar">' + icon('search') +
      '<input placeholder="Search by customer or address" value="' + esc(query) + '" data-action-input="history-search"></div>' +
      (rows || '<div class="empty">' + icon('archive') + '<b>No results</b><p>Try a different name or clear the search.</p></div>') +
      '</div>';
  };

  /* ---------------- Crew Sign In ---------------- */
  window.ScreenLogin = function () {
    return '<div class="screen" style="padding-top:56px">' +
      '<div style="text-align:center;margin-bottom:26px">' +
      '<span class="badge-ic" style="width:56px;height:56px;border-radius:16px;background:var(--green);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:26px">' + icon('bolt') + '</span>' +
      '<h1 class="screen-title" style="margin-top:14px">Crew Sign In</h1>' +
      '<p class="screen-sub" style="margin-bottom:0">Sign in to sync audits and photos to the HomSci cloud.<br>The app works offline without an account.</p>' +
      '</div>' +
      '<div class="card">' +
      UI.field({ label: 'Email', bind: 'login.email', type: 'email', placeholder: 'you@gethealthyhome.com', value: LoginDraft.email }) +
      UI.field({ label: 'Password', bind: 'login.password', type: 'password', placeholder: '••••••••', value: '' }) +
      '<button class="btn primary" data-action="auth-login" id="auth-login-btn">Sign In</button>' +
      '</div>' +
      '<div class="card"><h3>New crew member?</h3>' +
      UI.field({ label: 'Full Name', bind: 'login.name', placeholder: 'Your name', value: LoginDraft.name }) +
      '<button class="btn secondary" data-action="auth-signup">Create Account</button>' +
      '<p class="hint" style="margin-top:10px">Uses the email + password above. Depending on project settings you may need to confirm your email before signing in.</p>' +
      '</div>' +
      '<button class="btn ghost" data-action="nav" data-route="#/dashboard">Continue offline ' + icon('chevR') + '</button>' +
      '</div>';
  };
  window.LoginDraft = {};

  /* ---------------- Settings ---------------- */
  window.ScreenSettings = function () {
    var s = Store.state;
    var hasDemo = Store.listEvals().some(function (e) { return e.demo; });
    var sess = Auth.session();
    return UI.subbar('Settings', '#/dashboard') +
      '<div class="screen">' +
      '<h1 class="screen-title">Settings</h1>' +

      '<div class="card"><h3>Crew Account</h3>' +
      (sess
        ? '<div style="display:flex;gap:8px;margin-bottom:10px">' + UI.pill('complete', 'Signed In') + '</div>' +
          '<p class="hint">Signed in as <b>' + UI.esc(sess.user.name) + '</b> (' + UI.esc(sess.user.email) + '). Cloud sync is unlocked for this device.</p>' +
          '<button class="btn secondary" data-action="auth-logout">Sign Out</button>'
        : '<div style="display:flex;gap:8px;margin-bottom:10px">' + UI.pill('warn', 'Signed Out') + '</div>' +
          '<p class="hint">Audits stay on this device until a crew member signs in — cloud sync and Housecall Pro import require an account.</p>' +
          '<button class="btn primary" data-action="nav" data-route="#/login">Sign In / Create Account</button>') +
      '</div>' +

      '<div class="card"><h3>Auditor Profile</h3>' +
      UI.field({ label: 'Auditor Name', bind: 'auditor.name', placeholder: 'Your name', value: s.auditor.name }) +
      UI.field({ label: 'Initials (avatar)', bind: 'auditor.initials', placeholder: 'JD', value: s.auditor.initials }) +
      '</div>' +

      '<div class="card"><h3>Cloud Sync</h3>' +
      (Backend.ready()
        ? '<p class="hint">Connected to the HomSci cloud (Supabase). Audits and photos sync when you finalize an assessment, and retry automatically when you come back online.' +
          (sess ? '' : ' <b>Sign in to enable.</b>') + '</p>' +
          '<div style="display:flex;gap:8px;margin-bottom:10px">' + UI.pill(sess ? 'complete' : 'warn', sess ? 'Backend Connected' : 'Sign-in Required') +
          UI.pill('pending', Store.listEvals().filter(function (e) { return e.status === 'complete' && !e.synced && !e.remote; }).length + ' pending') + '</div>' +
          '<button class="btn secondary" data-action="sync-now">' + icon('sync') + ' Sync pending audits now</button>' +
          '<div style="height:8px"></div>' +
          '<button class="btn secondary" data-action="pull-remote">' + icon('export') + ' Pull audits from the cloud</button>'
        : '<p class="hint">No backend configured — audits stay on this device. Set the Supabase URL and publishable key in <code>js/config.js</code>.</p>' +
          '<div>' + UI.pill('warn', 'Offline Only') + '</div>') +
      '</div>' +

      '<div class="card"><h3>Housecall Pro</h3>' +
      '<p class="hint">Import upcoming Housecall Pro jobs into the schedule. Requires sign-in; the company API key lives server-side (Supabase secret <code>HCP_API_KEY</code>), never on this device.</p>' +
      '<button class="btn secondary" data-action="hcp-import">' + icon('truck') + ' Import jobs from Housecall Pro</button>' +
      '</div>' +
      '<div class="card"><h3>Data</h3>' +
      '<p class="hint">Audits are stored on this device first; the cloud copy is created on sync.</p>' +
      (hasDemo ? '<button class="btn secondary" data-action="clear-demo">Remove demo appointments</button>' : '') +
      '<div style="height:8px"></div>' +
      '<button class="btn danger-ghost" data-action="wipe">Erase all local data…</button>' +
      '</div>' +
      '<p class="hint" style="text-align:center">HomSci Pro · offline-first field build</p>' +
      '</div>';
  };
})();
