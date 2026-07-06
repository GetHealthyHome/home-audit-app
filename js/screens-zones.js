/* Zone assessment screens: Basement, Crawlspace, Attic, Garage, Exterior,
   Living Floors 1–3. All routed through ScreenZone(ev, zoneId). */
(function () {
  var esc = UI.esc;

  function zoneMeta(zoneId) {
    return DATA.ZONES.filter(function (z) { return z.id === zoneId; })[0];
  }
  function zbind(zoneId, field) { return 'zones.' + zoneId + '.fields.' + field; }

  function zoneHeader(ev, z) {
    var zd = Store.zone(ev, z.id);
    return '<span class="eyebrow ' + (zd.complete ? '' : 'magenta') + '">' +
      icon('grid') + ' Section ' + esc(z.num) + '</span>' +
      '<h1 class="screen-title">' + esc(z.name) + '</h1>' +
      '<p class="screen-sub">' + esc(z.sub || '') + '</p>' +
      (zd.complete ? UI.pill('complete', 'Standard Protocol ✓') : UI.pill('progress', 'In Progress', true)) +
      '<div style="height:8px"></div>';
  }

  function finalizeDock(ev, z, ready, missingMsg) {
    var zd = Store.zone(ev, z.id);
    if (zd.complete) {
      return '<div class="cta-dock"><button class="btn secondary" data-action="zone-reopen" data-zone="' + z.id + '">Reopen Section</button></div>';
    }
    return '<div class="cta-dock">' +
      (!ready && missingMsg ? '<div style="text-align:center;margin-bottom:10px"><span class="photo-missing">' + icon('alert') + ' ' + esc(missingMsg) + '</span></div>' : '') +
      '<button class="btn primary" data-action="zone-finalize" data-zone="' + z.id + '" ' + (ready ? '' : 'disabled') + '>Finalize Assessment</button>' +
      '<div style="height:8px"></div>' +
      '<button class="btn ghost" data-action="nav" data-route="#/eval/' + ev.id + '/hub">Save Draft</button>' +
      '</div>';
  }

  function photoPair(ev, zoneId, keyBase, labels) {
    return '<div class="photo-grid">' +
      UI.photoSlot(ev, { key: keyBase + '-1', zone: zoneId, label: labels[0] || 'Photo 1', required: true }) +
      UI.photoSlot(ev, { key: keyBase + '-2', zone: zoneId, label: labels[1] || 'Photo 2', required: false }) +
      '</div>';
  }

  /* ---------------- Basement ---------------- */
  function basement(ev, z) {
    var zd = Store.zone(ev, z.id);
    var sys = zd.systems;

    var inventory = '<div class="card">' +
      UI.sectionHeading('Mechanical Systems Inventory', 'boiler') +
      '<div class="check-grid">' +
      DATA.BASEMENT_SYSTEMS.map(function (s) {
        var on = !!sys[s.id];
        return '<button class="check-tile ' + (on ? 'on' : '') + '" data-action="sys-toggle" data-zone="' + z.id + '" data-sys="' + s.id + '">' +
          '<span class="box">' + icon('check') + '</span>' + esc(s.name) + '</button>';
      }).join('') + '</div></div>';

    var idx = 0;
    var cards = DATA.BASEMENT_SYSTEMS.filter(function (s) { return sys[s.id]; }).map(function (s) {
      idx++;
      var b = 'zones.' + z.id + '.systems.' + s.id;
      var d = sys[s.id] === true ? (sys[s.id] = {}) : sys[s.id];
      return '<div class="card">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        '<span class="badge-ic" style="width:30px;height:30px;border-radius:999px;background:var(--green-soft);color:var(--green);display:inline-flex;align-items:center;justify-content:center;font:800 14px var(--font-body)">' + idx + '</span>' +
        '<h3 style="margin:0">' + esc(s.name) + ' Data Entry</h3></div>' +
        UI.field({ label: 'Age (Years)', info: true, bind: b + '.age', type: 'number', inputmode: 'numeric', placeholder: '5', value: d.age }) +
        UI.field({ label: 'Fuel Type', info: true, bind: b + '.fuel', options: DATA.FUEL_TYPES, value: d.fuel }) +
        UI.field({ label: 'Efficiency Rating', info: true, bind: b + '.eff', type: 'number', inputmode: 'numeric', unit: '%', placeholder: '85', value: d.eff }) +
        '<div class="field"><label>Required: Primary Unit Photo</label>' +
        UI.photoSlot(ev, { key: z.id + '-' + s.id + '-primary', zone: z.id, label: s.name + ' Primary', required: true }) + '</div>' +
        '<div class="photo-grid">' +
        UI.photoSlot(ev, { key: z.id + '-' + s.id + '-d1', zone: z.id, label: 'Optional: Detail 1', required: false }) +
        UI.photoSlot(ev, { key: z.id + '-' + s.id + '-d2', zone: z.id, label: 'Optional: Detail 2', required: false }) +
        '</div></div>';
    }).join('');

    var general = '<div class="card">' + UI.sectionHeading('General Basement Photos', 'photo') +
      photoPair(ev, z.id, z.id + '-general', ['Add Photo', 'Add Photo']) + '</div>';

    var checkedIds = DATA.BASEMENT_SYSTEMS.filter(function (s) { return sys[s.id]; }).map(function (s) { return s.id; });
    var photosOk = checkedIds.every(function (id) {
      return ev.photos.some(function (p) { return p.slotKey === z.id + '-' + id + '-primary'; });
    });
    var ready = checkedIds.length > 0 && photosOk;
    return inventory + cards + general +
      finalizeDock(ev, z, ready, checkedIds.length === 0 ? 'Select at least one system' : (photosOk ? '' : 'Primary unit photos required'));
  }

  /* ---------------- Crawlspace ---------------- */
  function crawlspace(ev, z) {
    var zd = Store.zone(ev, z.id);
    var f = zd.fields;
    var clearance = parseFloat(f.clearance);
    var restricted = !isNaN(clearance) && clearance < DATA.CRAWL_MIN_CLEARANCE_IN;

    return '<div class="card">' + UI.sectionHeading('Clearance Height', 'ruler') +
      UI.field({ label: 'Measured clearance', bind: zbind(z.id, 'clearance'), type: 'number', inputmode: 'numeric', unit: 'inches', big: true, placeholder: '28', value: f.clearance }) +
      (restricted ?
        '<div class="callout-danger"><div class="ct">' + icon('alert') + ' Restricted Space Upcharge</div>' +
        '<p>Heights below ' + DATA.CRAWL_MIN_CLEARANCE_IN + '&quot; require premium labor rates due to restricted mobility.</p>' +
        '<div class="amount">+' + UI.money(DATA.CRAWL_UPCHARGE) + '.00</div></div>' : '') +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Footprint & Ventilation', 'grid') +
      UI.field({ label: 'Crawlspace area', bind: zbind(z.id, 'sqft'), type: 'number', inputmode: 'numeric', unit: 'sq. ft.', big: true, placeholder: '1250', value: f.sqft }) +
      '<div class="field"><label>Foundation Wall Vents — Vents Present?</label>' +
      UI.segmented(zbind(z.id, 'vents'), ['Yes', 'No'], f.vents) + '</div>' +
      (f.vents === 'Yes' ? UI.field({ label: 'Quantity', bind: zbind(z.id, 'ventQty'), type: 'number', inputmode: 'numeric', placeholder: '8', value: f.ventQty }) : '') +
      '</div>' +

      '<div class="card"><div class="field"><label>VAPOR BARRIER STATUS</label>' +
      UI.choiceList(zbind(z.id, 'vapor'), DATA.VAPOR_BARRIER, f.vapor, ['Damaged / Partial', 'Missing']) + '</div>' +
      '<div class="field"><label>INSULATION CONDITION</label>' +
      UI.choiceList(zbind(z.id, 'insulation'), DATA.CRAWL_INSULATION, f.insulation, ['Fiberglass - Sagging', 'None']) + '</div></div>' +

      '<div class="card">' + UI.sectionHeading('Mandatory Media Capture', 'camera') +
      photoPair(ev, z.id, z.id + '-media', ['Access / Entry', 'Structural Detail']) +
      '<div style="height:10px"></div>' +
      UI.field({ label: 'Clinical Notes', bind: zbind(z.id, 'notes'), textarea: true, placeholder: 'Inspector observations — e.g. sagging insulation at north bay…', value: f.notes }) +
      '</div>' +

      finalizeDock(ev, z,
        !!(f.clearance && f.vapor && f.insulation && ev.photos.some(function (p) { return p.slotKey === z.id + '-media-1'; })),
        'Clearance, vapor barrier, insulation + 1 photo required');
  }

  /* ---------------- Attic ---------------- */
  function attic(ev, z) {
    var zd = Store.zone(ev, z.id);
    var f = zd.fields;
    var rv = Store.rValue(f.insulationType, f.depth);

    return '<div class="card">' + UI.sectionHeading('Insulation Depth', 'ruler') +
      '<p class="hint">Measure average fill across attic floor</p>' +
      UI.field({ label: 'Insulation Type', info: true, bind: zbind(z.id, 'insulationType'), options: DATA.INSULATION_TYPES.map(function (t) { return t.name; }), value: f.insulationType }) +
      UI.field({ label: 'Measured Depth (Inches)', bind: zbind(z.id, 'depth'), type: 'number', inputmode: 'decimal', unit: 'in', big: true, placeholder: '14', value: f.depth }) +
      (rv ?
        '<div><label style="font:700 12px var(--font-body);color:var(--magenta)">Calculated Rating</label>' +
        '<div style="display:flex;align-items:center;gap:12px;margin-top:6px">' +
        '<span class="bignum" style="font-size:38px">R-' + rv.r + '<small>Value</small></span>' +
        UI.pill(rv.rating === 'OPTIMAL' ? 'optimal' : rv.rating === 'ADEQUATE' ? 'complete' : 'action', rv.rating) +
        '</div></div>' : '') +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Ventilation', 'wind') +
      '<div class="toggle-row"><span class="badge-ic" style="flex:none;width:34px;height:34px;border-radius:10px;background:var(--surface-2);display:inline-flex;align-items:center;justify-content:center">' + icon('home') + '</span>' +
      '<div class="tbody"><b>Ridge Vents</b><span>Continuous exhaust at roof peak</span></div>' +
      '<button class="check-tile ' + (f.ridgeVents ? 'on' : '') + '" style="width:auto" data-action="seg" data-bind="' + zbind(z.id, 'ridgeVents') + '" data-value="' + (f.ridgeVents ? '' : '1') + '"><span class="box">' + icon('check') + '</span></button></div>' +
      '<div class="toggle-row"><span class="badge-ic" style="flex:none;width:34px;height:34px;border-radius:10px;background:var(--surface-2);display:inline-flex;align-items:center;justify-content:center">' + icon('grid') + '</span>' +
      '<div class="tbody"><b>Gable Vents</b><span>Passive intake at gable ends</span></div>' +
      '<button class="check-tile ' + (f.gableVents ? 'on' : '') + '" style="width:auto" data-action="seg" data-bind="' + zbind(z.id, 'gableVents') + '" data-value="' + (f.gableVents ? '' : '1') + '"><span class="box">' + icon('check') + '</span></button></div>' +
      '<div class="insight"><b>Insight:</b> Airflow balance is critical to prevent moisture accumulation under the roof deck — pair intake and exhaust venting.</div>' +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Attic Photos', 'camera') +
      photoPair(ev, z.id, z.id + '-media', ['Attic Overview', 'Detail']) + '</div>' +

      finalizeDock(ev, z,
        !!(f.insulationType && f.depth && ev.photos.some(function (p) { return p.slotKey === z.id + '-media-1'; })),
        'Insulation type, depth + 1 photo required');
  }

  /* ---------------- Garage ---------------- */
  function garage(ev, z) {
    var zd = Store.zone(ev, z.id);
    var f = zd.fields;
    var temp = parseFloat(f.floorTemp);
    var moist = parseFloat(f.slabMoisture);

    return '<div class="card"><h3>Garage Type</h3>' +
      '<p class="hint">Specify the structural connection</p>' +
      UI.segmented(zbind(z.id, 'type'), ['Attached', 'Detached'], f.type) + '</div>' +

      '<div class="card">' + UI.sectionHeading('Critical Safety Checks', 'shield') +
      '<div class="toggle-row"><button class="check-tile ' + (f.fireDoor ? 'on' : '') + '" style="width:auto;flex:none" data-action="seg" data-bind="' + zbind(z.id, 'fireDoor') + '" data-value="' + (f.fireDoor ? '' : '1') + '"><span class="box">' + icon('check') + '</span></button>' +
      '<div class="tbody"><b>Fire-rated door check</b><span>Verify 20-minute fire rating label and self-closing mechanism on entry to living space.</span>' +
      '<div style="margin-top:6px">' + UI.pill('progress', 'High Priority') + '</div></div></div>' +
      '<div class="field" style="margin-top:10px"><label>Ceiling insulation above garage</label>' +
      '<p class="hint">Confirm R-30 or better insulation if a bedroom is located directly above the garage floor.</p>' +
      UI.field({ label: '', bind: zbind(z.id, 'ceiling'), options: ['R-30+ Confirmed', 'Below R-30', 'Uninsulated', 'No room above'], value: f.ceiling }).replace('<label></label>', '') +
      '</div></div>' +

      '<div class="card">' + UI.sectionHeading('Clinical Observations', 'note') +
      UI.field({ label: '', bind: zbind(z.id, 'notes'), textarea: true, placeholder: 'Describe any slab cracking, moisture intrusion, or ventilation concerns…', value: f.notes }).replace('<label></label>', '') +
      '</div>' +

      '<div class="dark-media"><h3>Media Capture <span>' + icon('camera') + '</span></h3>' +
      UI.photoSlot(ev, { key: z.id + '-slab', zone: z.id, label: 'Upload Garage Slab Photo', required: true }) +
      '<div style="height:10px"></div><div class="photo-grid">' +
      UI.photoSlot(ev, { key: z.id + '-door', zone: z.id, label: 'Garage Door', required: false }) +
      UI.photoSlot(ev, { key: z.id + '-detail', zone: z.id, label: 'Detail', required: false }) +
      '</div></div>' +

      '<div class="card"><label style="font:700 12px var(--font-body);color:var(--magenta)">Environmental Data</label>' +
      '<div class="env-stat"><div><input data-bind="' + zbind(z.id, 'floorTemp') + '" type="number" inputmode="numeric" value="' + esc(f.floorTemp || '') + '" placeholder="68">°' +
      '<small>Ambient Floor Temperature</small></div>' +
      (!isNaN(temp) ? UI.pill(temp <= 68 ? 'magenta' : 'complete', temp <= 68 ? 'Dew Point Risk' : 'Normal') : '') + '</div>' +
      '<div class="env-stat"><div><input data-bind="' + zbind(z.id, 'slabMoisture') + '" type="number" inputmode="numeric" value="' + esc(f.slabMoisture || '') + '" placeholder="14">%' +
      '<small>Slab Moisture Content</small></div>' +
      (!isNaN(moist) ? UI.pill(moist <= 17 ? 'complete' : 'action', moist <= 17 ? 'Normal Range' : 'Elevated') : '') + '</div>' +
      '</div>' +

      finalizeDock(ev, z,
        !!(f.type && ev.photos.some(function (p) { return p.slotKey === z.id + '-slab'; })),
        'Garage type + slab photo required');
  }

  /* ---------------- Exterior ---------------- */
  function exterior(ev, z) {
    var zd = Store.zone(ev, z.id);
    var f = zd.fields;
    return '<div class="card">' + UI.sectionHeading('Site Logistics', 'truck') +
      '<div class="field"><label>Vehicle Accessibility</label>' +
      UI.segmented(zbind(z.id, 'vehicle'), ['Truck', 'Box Truck'], f.vehicle, true) + '</div>' +
      UI.field({ label: 'Parking Instructions', bind: zbind(z.id, 'parking'), textarea: true, placeholder: 'Specific access codes, narrow driveway notes, or restricted street zones…', value: f.parking }) +
      '<div class="field"><label>Truck Parking Photo</label>' +
      UI.photoSlot(ev, { key: z.id + '-parking', zone: z.id, label: 'Capture Parking Area', required: true }) +
      (ev.photos.some(function (p) { return p.slotKey === z.id + '-parking'; }) ? '' :
        '<div style="margin-top:8px"><span class="photo-missing">' + icon('alert') + ' Photo Required</span></div>') +
      '</div></div>' +

      '<div class="card">' + UI.sectionHeading('Envelope Condition', 'home') +
      UI.field({ label: 'Siding Condition', bind: zbind(z.id, 'siding'), options: ['Good', 'Fair', 'Poor'], value: f.siding }) +
      UI.field({ label: 'Grading & Drainage', bind: zbind(z.id, 'drainage'), options: ['Slopes away (good)', 'Flat', 'Slopes toward foundation'], value: f.drainage }) +
      UI.field({ label: 'Wall Construction', bind: zbind(z.id, 'walls'), options: ['2x4 Frame', '2x6 Frame', 'Masonry', 'Unknown'], value: f.walls }) +
      '</div>' +

      '<div class="card">' + UI.sectionHeading('Exterior Photos', 'camera') +
      '<div class="photo-grid">' +
      UI.photoSlot(ev, { key: z.id + '-front', zone: z.id, label: 'Front Elevation', required: true }) +
      UI.photoSlot(ev, { key: z.id + '-rear', zone: z.id, label: 'Rear Elevation', required: false }) +
      UI.photoSlot(ev, { key: z.id + '-left', zone: z.id, label: 'Left Side', required: false }) +
      UI.photoSlot(ev, { key: z.id + '-right', zone: z.id, label: 'Right Side', required: false }) +
      '</div></div>' +

      finalizeDock(ev, z,
        !!(f.vehicle && ev.photos.some(function (p) { return p.slotKey === z.id + '-parking'; }) &&
           ev.photos.some(function (p) { return p.slotKey === z.id + '-front'; })),
        'Vehicle access, parking + front photos required');
  }

  /* ---------------- Living floors (window audit + room photos) ---------------- */
  function floor(ev, z) {
    var zd = Store.zone(ev, z.id);
    var wins = zd.windows;

    var winCards = wins.map(function (w, i) {
      var complete = w.room && w.type && w.glazing && w.condition;
      var flagged = w.condition === 'Poor' || w.glazing === 'Single Pane';
      if (zd.editingWindow === i) {
        var b = 'zones.' + z.id + '.windows.' + i;
        return '<div class="window-card ' + (flagged ? 'flag' : '') + '">' +
          UI.field({ label: 'Room', bind: b + '.room', placeholder: 'e.g. Master Bed', value: w.room }) +
          UI.field({ label: 'Type', bind: b + '.type', options: DATA.WINDOW_TYPES, value: w.type }) +
          UI.field({ label: 'Glazing', bind: b + '.glazing', options: DATA.GLAZING_TYPES, value: w.glazing }) +
          '<div class="field"><label>Primary Condition</label>' +
          UI.segmented(b + '.condition', DATA.WINDOW_CONDITIONS, w.condition) + '</div>' +
          '<div class="btn-row" style="margin:6px 0 0">' +
          '<button class="btn small primary" data-action="window-done" data-zone="' + z.id + '">Done</button>' +
          '<button class="btn small danger-ghost" data-action="window-remove" data-zone="' + z.id + '" data-idx="' + i + '">Remove</button>' +
          '</div></div>';
      }
      return '<div class="window-card ' + (flagged ? 'flag' : '') + '">' +
        '<div class="wtop"><div><b>' + esc(w.room || 'Window ' + (i + 1)) + '</b>' +
        '<div class="tags">' + (w.type ? '<span class="t">' + esc(w.type) + '</span>' : '') +
        (w.glazing ? '<span class="t">' + esc(w.glazing) + '</span>' : '') +
        (w.condition ? '<span class="t">' + esc(w.condition) + '</span>' : '') + '</div></div>' +
        '<div class="wactions">' +
        (complete ? '<button class="ok" aria-label="Complete">' + icon('check') + '</button>' : '') +
        '<button data-action="window-edit" data-zone="' + z.id + '" data-idx="' + i + '" aria-label="Edit">' + icon('edit') + '</button>' +
        '</div></div></div>';
    }).join('');

    var photoCount = ev.photos.filter(function (p) { return p.zone === z.id && p.tag === 'room'; }).length;
    var roomShots = ev.photos.filter(function (p) { return p.zone === z.id && p.tag === 'room'; }).map(function (p) {
      var url = Store.photoUrl(p.id);
      return '<div class="photo-slot filled"><img src="' + url + '" alt="Room photo">' +
        '<button class="retake" data-action="photo-remove" data-photo="' + p.id + '">' + icon('trash') + '</button></div>';
    }).join('');

    return '<div class="card">' +
      UI.sectionHeading('Window Audit', 'window',
        '<button class="btn small secondary" data-action="window-add" data-zone="' + z.id + '">Add Window ' + icon('plus') + '</button>') +
      (wins.length ? '<div style="margin-bottom:6px">' + UI.pill('progress', wins.length + ' Units Total') + '</div>' : '') +
      (winCards || '<div class="empty" style="padding:16px"><p>No windows recorded yet on this floor.</p></div>') +
      '</div>' +

      '<div class="card">' +
      UI.sectionHeading('Room Photos', 'camera',
        '<span class="aux" style="color:var(--muted)">' + photoCount + ' / ' + DATA.FLOOR_PHOTO_TARGET + ' Photos Captured</span>') +
      '<div class="photo-grid">' +
      '<button class="photo-slot" data-action="photo-capture" data-slot-key="" data-zone="' + z.id + '" data-label="Room Photo" data-tag="room">' +
      '<span class="cam">' + icon('camera') + '</span><span>Add Photo</span></button>' +
      roomShots +
      '<button class="photo-slot" data-action="photo-capture" data-slot-key="" data-zone="' + z.id + '" data-label="Thermal Scan" data-tag="thermal" style="background:var(--green-soft);border-color:var(--green);color:var(--green)">' +
      '<span class="cam">' + icon('thermo') + '</span><span>Thermal Scan</span></button>' +
      '</div></div>' +

      finalizeDock(ev, z,
        wins.length > 0 && photoCount > 0,
        'At least one window + one room photo required');
  }

  var RENDERERS = {
    basement: basement, crawlspace: crawlspace, attic: attic,
    garage: garage, exterior: exterior, floor1: floor, floor2: floor, floor3: floor
  };

  window.ScreenZone = function (ev, zoneId) {
    var z = zoneMeta(zoneId);
    if (!z) return '<div class="screen"><div class="empty"><b>Unknown zone</b></div></div>';
    var body = RENDERERS[zoneId](ev, z);
    return UI.subbar(z.name, '#/eval/' + ev.id + '/hub') +
      '<div class="screen">' + zoneHeader(ev, z) + body + '</div>';
  };
})();
