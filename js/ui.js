/* Shared UI helpers: escaping, headers, pills, photo tiles, event wiring. */
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var PILL_LABEL = {
    complete: 'Complete', progress: 'In Progress', pending: 'Pending',
    action: 'Action Required', optimal: 'Optimal', warn: 'Attention', magenta: 'Flagged'
  };

  window.UI = {
    esc: esc,

    pill: function (kind, label, dotted) {
      return '<span class="pill ' + kind + '">' + (dotted ? '<span class="dot"></span>' : '') +
        esc(label || PILL_LABEL[kind] || kind) + '</span>';
    },

    /* Root header (tabs' top bar) */
    appbar: function (opts) {
      opts = opts || {};
      var initials = esc((Store.state.auditor.initials || 'JD').slice(0, 2));
      return '<header class="appbar">' +
        '<div class="brand"><span class="logo">' + icon('bolt') + '</span>' +
        '<span>HomSci Pro<small>Clinical Precision</small></span></div>' +
        '<div class="spacer"></div>' +
        (opts.actions || '') +
        '<button class="iconbtn" data-action="nav" data-route="#/history" aria-label="Search evaluations">' + icon('search') + '</button>' +
        '<button class="iconbtn avatar" data-action="nav" data-route="#/settings" aria-label="Settings">' + initials + '</button>' +
        '</header>';
    },

    /* Sub-page header with back button */
    subbar: function (title, backRoute, actions) {
      return '<header class="appbar subpage">' +
        '<button class="iconbtn" data-action="nav" data-route="' + esc(backRoute) + '" aria-label="Back">' + icon('back') + '</button>' +
        '<div class="title">' + esc(title) + '</div>' +
        '<div class="spacer"></div>' + (actions || '') +
        '</header>';
    },

    field: function (opts) {
      var input;
      var attrs = ' class="input ' + (opts.big ? 'bignum-input' : '') + '"' +
        ' data-bind="' + esc(opts.bind) + '"' +
        (opts.type ? ' type="' + opts.type + '"' : ' type="text"') +
        (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') +
        (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
        ' value="' + esc(opts.value == null ? '' : opts.value) + '"';
      if (opts.textarea) {
        input = '<textarea class="input" data-bind="' + esc(opts.bind) + '"' +
          (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + '>' +
          esc(opts.value == null ? '' : opts.value) + '</textarea>';
      } else if (opts.options) {
        input = '<select class="input" data-bind="' + esc(opts.bind) + '">' +
          '<option value="">Select…</option>' +
          opts.options.map(function (o) {
            return '<option ' + (o === opts.value ? 'selected' : '') + '>' + esc(o) + '</option>';
          }).join('') + '</select>';
      } else {
        input = '<input' + attrs + '>';
      }
      if (opts.unit) input = '<div class="input-row">' + input + '<span class="unit">' + esc(opts.unit) + '</span></div>';
      return '<div class="field"><label>' + esc(opts.label) +
        (opts.required ? ' <span class="req">*</span>' : '') +
        (opts.info ? ' <span class="info">' + icon('info') + '</span>' : '') +
        '</label>' + input + '</div>';
    },

    segmented: function (bind, options, value, lite) {
      return '<div class="segmented' + (lite ? ' lite' : '') + '">' + options.map(function (o) {
        return '<button data-action="seg" data-bind="' + esc(bind) + '" data-value="' + esc(o) + '"' +
          ' class="' + (o === value ? 'on' : '') + '">' + esc(o) + '</button>';
      }).join('') + '</div>';
    },

    choiceList: function (bind, options, value, badValues) {
      badValues = badValues || [];
      return '<div class="choice-list">' + options.map(function (o) {
        var on = o === value;
        var bad = badValues.indexOf(o) >= 0;
        return '<button class="choice-row ' + (on ? 'on' : '') + (on && bad ? ' bad' : '') + '"' +
          ' data-action="seg" data-bind="' + esc(bind) + '" data-value="' + esc(o) + '">' +
          '<span>' + esc(o) + '</span><span class="mark">' + icon(on ? 'check' : 'chevR') + '</span></button>';
      }).join('') + '</div>';
    },

    /* Photo slot bound to a slot key. Fills from the evaluation's photo list. */
    photoSlot: function (ev, slot) {
      // slot: {zone, label, required, key}
      var existing = ev.photos.filter(function (p) { return p.slotKey === slot.key; })[0];
      var url = existing && Store.photoUrl(existing.id);
      if (existing && url) {
        return '<div class="photo-slot filled">' +
          '<img src="' + url + '" alt="' + esc(slot.label) + '">' +
          '<span class="req-flag">' + esc(slot.label) + '</span>' +
          '<button class="retake" data-action="photo-remove" data-photo="' + existing.id + '" aria-label="Remove photo">' + icon('trash') + '</button>' +
          '</div>';
      }
      return '<button class="photo-slot ' + (slot.required ? 'required' : '') + '"' +
        ' data-action="photo-capture" data-slot-key="' + esc(slot.key) + '"' +
        ' data-zone="' + esc(slot.zone || '') + '" data-label="' + esc(slot.label) + '"' +
        ' data-required="' + (slot.required ? '1' : '') + '">' +
        '<span class="cam">' + icon('camera') + '</span><span>' + esc(slot.label) + '</span>' +
        (slot.required ? '<span class="req-flag">REQUIRED</span>' : '') +
        '</button>';
    },

    sectionHeading: function (title, iconName, aux) {
      return '<div class="section-heading"><h2>' +
        (iconName ? '<span class="badge-ic">' + icon(iconName) + '</span>' : '') +
        esc(title) + '</h2>' + (aux || '') + '</div>';
    },

    money: function (n) {
      return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    toast: function (msg) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(t._h);
      t._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
    },

    /* Hidden file input used by all capture actions. */
    pickPhoto: function () {
      return new Promise(function (res) {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.setAttribute('capture', 'environment');
        inp.onchange = function () { res(inp.files[0] || null); };
        inp.click();
      });
    }
  };
})();
