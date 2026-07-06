/* Diagnostic test screens: Blower Door & Safety, CAZ Combustion Safety,
   IAQ timer + results. */
(function () {
  var esc = UI.esc;

  /* ---------------- Blower Door ---------------- */
  window.ScreenBlower = function (ev) {
    var t = ev.tests.blower;
    var checklistDone = DATA.BLOWER_CHECKLIST.every(function (c) { return t.checklist[c.id]; });
    var reqPhotosDone = DATA.BLOWER_PHOTOS.filter(function (p) { return p.required; })
      .every(function (p) { return t.photos[p.id]; });
    var canSubmit = checklistDone && reqPhotosDone && t.cfm50;

    var checklist = DATA.BLOWER_CHECKLIST.map(function (c) {
      var on = !!t.checklist[c.id];
      return '<button class="checklist-row ' + (on ? 'on' : '') + '" data-action="blower-check" data-check="' + c.id + '">' +
        '<span class="ring">' + icon('check') + '</span>' +
        '<span class="cbody"><b>' + esc(c.name) + '</b><span>' + esc(c.desc) + '</span></span></button>';
    }).join('');

    var photoTiles = '<div class="photo-grid">' + DATA.BLOWER_PHOTOS.map(function (p) {
      var photoId = t.photos[p.id];
      var url = photoId && Store.photoUrl(photoId);
      if (url) {
        return '<div class="photo-slot filled"><img src="' + url + '" alt="' + esc(p.label) + '">' +
          '<span class="req-flag">' + esc(p.label) + '</span>' +
          '<button class="retake" data-action="blower-photo-remove" data-pid="' + p.id + '">' + icon('trash') + '</button></div>';
      }
      return '<button class="photo-slot ' + (p.required ? 'required' : '') + '"' +
        (checklistDone ? ' data-action="blower-photo" data-pid="' + p.id + '"' :
          ' data-action="toast" data-msg="Complete setup checklist to enable input &amp; photos" disabled style="opacity:.55"') + '>' +
        '<span class="cam">' + icon('camera') + '</span><span>' + esc(p.label).toUpperCase() + '</span>' +
        '<span class="req-flag" style="background:' + (p.required ? 'var(--green)' : 'var(--faint)') + '">' + (p.required ? 'REQUIRED' : 'OPTIONAL') + '</span></button>';
    }).join('') + '</div>';

    return UI.subbar('Blower Door', '#/eval/' + ev.id + '/hub') +
      '<div class="screen">' +
      '<h1 class="screen-title">Blower Door &amp; Safety</h1>' +
      '<p class="screen-sub">Complete the setup checklist to unlock technical measurements</p>' +

      '<div class="card">' + UI.sectionHeading('Mandatory Setup Checklist', 'clipboard',
        checklistDone ? UI.pill('complete', 'Ready') : '<span class="aux" style="color:var(--muted)">' +
        DATA.BLOWER_CHECKLIST.filter(function (c) { return t.checklist[c.id]; }).length + '/' + DATA.BLOWER_CHECKLIST.length + '</span>') +
      checklist + '</div>' +

      UI.sectionHeading('Blower Door Measurement', 'wind') +
      '<div class="card">' +
      '<div class="field"><label style="text-align:center;display:block">Blower Door Ring Selection</label>' +
      UI.segmented('tests.blower.ring', DATA.BLOWER_RINGS, t.ring, true) + '</div>' +
      '<div class="metric-display"><div class="mk">Target Metric: CFM50</div>' +
      '<input type="number" inputmode="decimal" placeholder="0.00" data-bind="tests.blower.cfm50" value="' + esc(t.cfm50) + '"' +
      (checklistDone ? '' : ' disabled') + '>' +
      (checklistDone ? '' : '<div class="hint" style="text-align:center">Complete setup checklist to enable input &amp; photos</div>') +
      '</div>' +
      '<div style="height:14px"></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<b style="display:flex;align-items:center;gap:8px">' + icon('camera') + ' Photo Documentation</b>' +
      '<span style="font:700 11px var(--font-body);color:var(--green)">Required for validation</span></div>' +
      photoTiles +
      '</div>' +

      '<div class="cta-dock"><button class="btn primary" data-action="blower-submit" ' + (canSubmit ? '' : 'disabled') + '>' +
      (canSubmit ? 'Submit Assessment ' + icon('check') : 'Submit Assessment ' + icon('lock')) + '</button></div>' +
      '</div>';
  };

  /* ---------------- CAZ / Combustion Safety ---------------- */
  window.ScreenCaz = function (ev) {
    var t = ev.tests.caz;
    var recorded = DATA.CAZ_TESTS.filter(function (c) { return t.tests[c.id] && t.tests[c.id].result; });
    var passed = recorded.filter(function (c) { return t.tests[c.id].result === 'PASS'; });
    var allDone = recorded.length === DATA.CAZ_TESTS.length;
    var anyFail = recorded.some(function (c) { return t.tests[c.id].result === 'FAIL'; });

    var rows = DATA.CAZ_TESTS.map(function (c) {
      var d = t.tests[c.id] || {};
      var photoUrl = d.photoId && Store.photoUrl(d.photoId);
      return '<div class="card" style="' + (d.result === 'FAIL' ? 'border-left:4px solid var(--red)' : d.result === 'PASS' ? 'border-left:4px solid var(--green)' : '') + '">' +
        '<div style="display:flex;gap:12px;margin-bottom:12px">' +
        '<span class="badge-ic" style="width:40px;height:40px;border-radius:11px;background:var(--surface-2);color:var(--ink);display:inline-flex;align-items:center;justify-content:center;flex:none">' + icon(c.icon) + '</span>' +
        '<div><b>' + esc(c.name) + '</b><p class="hint" style="margin:2px 0 0">' + esc(c.desc) + '</p></div></div>' +
        '<div style="display:flex;gap:10px;align-items:center">' +
        '<div class="passfail" style="flex:1">' +
        '<button class="pf ' + (d.result === 'FAIL' ? 'on-fail' : '') + '" data-action="caz-result" data-test="' + c.id + '" data-result="FAIL">FAIL</button>' +
        '<button class="pf ' + (d.result === 'PASS' ? 'on-pass' : '') + '" data-action="caz-result" data-test="' + c.id + '" data-result="PASS">PASS</button>' +
        '</div>' +
        '<button class="capture-btn ' + (photoUrl ? 'done' : '') + '" data-action="caz-photo" data-test="' + c.id + '">' +
        (photoUrl ? icon('check') + ' Captured' : 'Capture ' + icon('camera')) + '</button>' +
        '</div>' +
        (photoUrl ? '<div class="photo-slot filled" style="margin-top:10px"><img src="' + photoUrl + '" alt="Evidence">' +
          '<button class="retake" data-action="caz-photo-remove" data-test="' + c.id + '">' + icon('trash') + '</button></div>' : '') +
        '</div>';
    }).join('');

    return UI.subbar('Combustion Safety', '#/eval/' + ev.id + '/hub') +
      '<div class="screen">' +
      '<div class="card"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">' +
      '<div><b style="color:var(--green);font-size:16px">Safety Protocol Analysis</b>' +
      '<p class="hint" style="margin-top:6px">Systematic verification of combustion appliance zones to ensure resident safety and indoor air quality.</p></div>' +
      '<div class="counter-badge"><div class="big ' + (anyFail ? 'bad' : '') + '">' + passed.length + '<span style="font-size:16px;color:var(--muted)">/' + DATA.CAZ_TESTS.length + '</span></div>' +
      '<div class="lbl">Critical Tests</div></div></div></div>' +

      (allDone && !anyFail ?
        '<div class="lockbar"><b>' + icon('shield') + ' Compliance Cleared</b><span>All safety hard-stops recorded. Submission unlocked.</span></div>' :
        anyFail ?
        '<div class="lockbar" style="background:var(--red)"><b>' + icon('alert') + ' Action Required</b><span>One or more hard-stops failed. Resolve with the homeowner before proceeding to recommendations.</span></div>' :
        '<div class="lockbar"><b>' + icon('shield') + ' Compliance Lock</b><span>Submission restricted until all safety hard-stops recorded</span></div>') +

      '<h2 style="font:800 18px var(--font-display);margin:22px 0 12px;border-bottom:3px solid var(--green);display:inline-block;padding-bottom:6px">Safety Protocol Hard-Stops</h2>' +
      rows +

      '<div class="card">' + UI.sectionHeading('Ambient Readings', 'air') +
      UI.field({ label: 'Ambient CO (ppm)', bind: 'tests.caz.ambientCO', type: 'number', inputmode: 'numeric', placeholder: '0', value: t.ambientCO }) +
      UI.field({ label: 'Notes', bind: 'tests.caz.notes', textarea: true, placeholder: 'Verified under BPI/ANSI protocols…', value: t.notes }) +
      '</div>' +

      '<div class="cta-dock"><button class="btn primary" data-action="nav" data-route="#/eval/' + ev.id + '/hub" ' + (allDone ? '' : 'disabled') + '>' +
      (allDone ? 'Save &amp; Return to Hub' : 'Record all 4 hard-stops to continue') + '</button></div>' +
      '</div>';
  };

  /* ---------------- IAQ ---------------- */
  window.ScreenIaq = function (ev) {
    var t = ev.tests.iaq;
    var now = Date.now();
    var total = DATA.IAQ_MINUTES * 60 * 1000;
    var running = t.startedAt && !t.finishedAt && (now - t.startedAt) < total;
    var elapsed = t.startedAt ? now - t.startedAt : 0;
    var done = t.finishedAt || (t.startedAt && elapsed >= total);

    var body;
    if (!t.startedAt) {
      body = '<div class="timer-wrap">' + UI.pill('progress', 'Ready to Start', true) +
        '<div style="height:22px"></div>' +
        '<div class="timer-label">Sampling Window</div>' +
        '<div class="timer-big">' + DATA.IAQ_MINUTES + ':00</div>' +
        '<p class="screen-sub" style="max-width:300px;margin:26px auto 0">This baseline indoor air quality audit requires a controlled ' +
        DATA.IAQ_MINUTES + '-minute sampling window. You can continue using your phone; the test will run in the background.</p>' +
        '</div>' +
        '<div class="cta-dock"><button class="btn primary" data-action="iaq-start">Start Baseline Test ' + icon('timer') + '</button></div>';
    } else if (running) {
      var remain = Math.max(0, total - elapsed);
      var mm = Math.floor(remain / 60000);
      var ss = Math.floor((remain % 60000) / 1000);
      body = '<div class="timer-wrap">' + UI.pill('progress', 'Test in Progress', true) +
        '<div style="height:10px"></div>' +
        '<button class="howto" data-action="toast" data-msg="Place the sensor centrally at breathing height, away from windows and supply registers.">' + icon('info') + ' How to Run Test</button>' +
        '<div style="height:26px"></div>' +
        '<div class="timer-label">Time Remaining</div>' +
        '<div class="timer-big" id="iaq-countdown">' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss + '</div>' +
        '<p class="screen-sub" style="max-width:300px;margin:26px auto 0">This baseline indoor air quality audit requires a controlled ' +
        DATA.IAQ_MINUTES + '-minute sampling window. You can continue using your phone; the test will run in the background.</p></div>' +
        '<div class="cta-dock"><button class="btn ghost" data-action="iaq-reset">Cancel Test</button></div>';
    } else {
      var co2Band = Store.iaqBand(DATA.IAQ_METRICS[0], t.co2);
      var vocBand = Store.iaqBand(DATA.IAQ_METRICS[1], t.voc);
      body = '<div style="text-align:center;padding:16px 0">' +
        '<span class="badge-ic" style="width:56px;height:56px;border-radius:999px;background:var(--green-soft);color:var(--green);display:inline-flex;align-items:center;justify-content:center;font-size:26px">' + icon('check') + '</span>' +
        '<h1 class="screen-title" style="margin-top:16px">Test Complete</h1>' +
        '<p class="screen-sub" style="max-width:300px;margin:0 auto 20px">' + DATA.IAQ_MINUTES + '-minute sampling period complete. Enter the captured baseline data below.</p></div>' +

        '<div class="result-card"><div class="rk"><span>CO2 Level</span>' + (co2Band ? UI.pill(co2Band === 'Optimal' ? 'complete' : co2Band === 'Acceptable' ? 'progress' : 'action', co2Band) : '') + '</div>' +
        '<div style="display:flex;align-items:baseline;gap:8px"><input class="input bignum-input" style="max-width:170px" type="number" inputmode="numeric" placeholder="412" data-bind="tests.iaq.co2" value="' + esc(t.co2) + '"><span class="rv" style="font-size:15px;color:var(--muted)">ppm</span></div>' +
        '<div class="rfoot">Atmospheric baseline average</div></div>' +

        '<div class="result-card"><div class="rk"><span>VOC Concentration</span>' + (vocBand ? UI.pill(vocBand === 'Excellent' ? 'complete' : vocBand === 'Acceptable' ? 'progress' : 'action', vocBand) : '') + '</div>' +
        '<div style="display:flex;align-items:baseline;gap:8px"><input class="input bignum-input" style="max-width:170px" type="number" step="0.1" inputmode="decimal" placeholder="0.2" data-bind="tests.iaq.voc" value="' + esc(t.voc) + '"><span class="rv" style="font-size:15px;color:var(--muted)">mg/m³</span></div>' +
        '<div class="rfoot">Organic compound threshold</div></div>' +

        '<div class="insight"><b>Precision:</b> Sensor calibration assumes ambient stabilization in the ' + DATA.IAQ_MINUTES + '-minute window. Retest if doors or windows were opened.</div>' +

        '<div class="cta-dock">' +
        '<button class="btn primary" data-action="iaq-save" ' + (t.co2 !== '' && t.voc !== '' ? '' : 'disabled') + '>Save &amp; Continue Assessment ' + icon('chevR') + '</button>' +
        '<div style="height:8px"></div>' +
        '<button class="btn secondary" data-action="iaq-reset">Retest (Discard Data)</button></div>';
    }

    return UI.subbar('IAQ Test', '#/eval/' + ev.id + '/hub') +
      '<div class="screen">' + body + '</div>';
  };
})();
