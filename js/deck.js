/* Customer-facing proposal deck. Standalone: fetches the shared audit via
   the public proposal-deck edge function (unguessable share token in the
   URL: deck.html?t=<token>) and renders a full-screen slide presentation
   with keyboard / touch / dot navigation and a print-to-PDF layout.

   ── EDITING THE DECK ──────────────────────────────────────────────────
   The slide layouts live in the SLIDES section below as template
   functions. To change wording, order or styling: edit this file (or
   css/deck.css) on GitHub — press "." in the repo to open the web editor —
   commit, and Vercel redeploys the live deck in under a minute. Data and
   photos auto-populate from the audit; the `d` object holds everything
   (see the proposal-deck edge function for its shape). */
(function () {
  var BRAND = 'HomSci Pro';
  var TAGLINE = 'A healthier, more efficient home.';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    return '$' + Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtDate(iso) {
    var d = new Date((iso || '') + 'T12:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }
  /* *emphasis* in building-science copy renders as <em>. */
  function science(text) {
    return esc(text).split('*').map(function (p, i) { return i % 2 ? '<em>' + p + '</em>' : p; }).join('');
  }
  function photoBlock(url, label) {
    return url
      ? '<figure class="shot"><img src="' + esc(url) + '" alt="' + esc(label) + '"><figcaption>' + esc(label) + '</figcaption></figure>'
      : '<div class="shot placeholder">Photo pending</div>';
  }

  /* ── SLIDES: one template function per slide type ─────────────────── */

  function coverSlide(d) {
    var fin = d.proposal;
    return '<div class="slide-inner cover">' +
      '<span class="kicker">' + esc(BRAND) + ' · Home Performance Proposal</span>' +
      '<h1>' + esc(TAGLINE) + '</h1>' +
      '<p class="who">Prepared for <b>' + esc(d.customer.name || 'Homeowner') + '</b><br>' +
      esc(d.customer.address) + (d.date ? '<br>' + esc(fmtDate(d.date)) : '') +
      (d.auditor ? '<br>Field auditor: ' + esc(d.auditor) : '') + '</p>' +
      (fin ? '<div class="hero">' +
        '<div><b>' + money(fin.cost) + '</b><span>Total Investment</span></div>' +
        '<div><b>' + money(fin.savings) + '</b><span>Savings / Year</span></div>' +
        '<div><b>' + (fin.payback != null ? fin.payback + ' yrs' : '—') + '</b><span>Simple Payback</span></div>' +
        '</div>' : '') +
      '<p class="basis">Based on a whole-home diagnostic assessment' +
      (d.tests.cfm50 ? ' — calibrated blower-door test (' + esc(d.tests.cfm50) + ' CFM50)' : '') +
      (d.tests.co2 ? ', indoor air quality baseline (' + esc(d.tests.co2) + ' ppm CO₂)' : '') +
      (d.energy ? ', and a full year of local weather data for ' + esc(d.energy.location) : '') + '.</p>' +
      '<p class="hint-nav no-print">Use ← → arrow keys, swipe, or the dots below</p>' +
      '</div>';
  }

  function findingSlide(photo, idx, total) {
    return '<div class="slide-inner finding">' +
      '<div class="copy">' +
      '<span class="kicker">What we found — ' + (idx + 1) + ' of ' + total + '</span>' +
      '<h2>' + esc(photo.label) + '</h2>' +
      (photo.zone ? '<p class="zone">Area: ' + esc(photo.zone) + '</p>' : '') +
      '</div>' +
      photoBlock(photo.url, photo.label) +
      '</div>';
  }

  function measureSlide(m, idx) {
    return '<div class="slide-inner measure">' +
      '<span class="kicker">Recommended Improvement #' + (idx + 1) + '</span>' +
      '<h2>' + esc(m.name) + '<span class="cost">' + money(m.cost) + '</span></h2>' +
      '<p class="desc">' + esc(m.desc) + '</p>' +
      (m.science ? '<div class="why"><b>The building science:</b> ' + science(m.science) + '</div>' : '') +
      (m.benefits && m.benefits.length ?
        '<ul class="benefits">' + m.benefits.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="numbers">' +
      '<div><b>' + money(m.savings) + '/yr</b><span>Estimated savings</span></div>' +
      (m.adjustments && m.adjustments.length ?
        '<div><b>' + money(m.base) + ' base</b><span>' +
        m.adjustments.map(function (a) {
          return (a.amount < 0 ? '− ' + money(-a.amount) : '+ ' + money(a.amount)) + ' ' + esc(a.label);
        }).join(' · ') + '</span></div>' : '') +
      (m.rebate ? '<div><b>' + esc(m.rebate) + '</b><span>Rebate</span></div>' : '') +
      '</div>' +
      (m.notes ? '<p class="scope">Scope: ' + esc(m.notes) + '</p>' : '') +
      '</div>';
  }

  function pricingSlide(d) {
    var fin = d.proposal;
    var rows = fin.items.map(function (m) {
      return '<tr><td>' + esc(m.name) + '</td><td class="num">' + money(m.cost) + '</td>' +
        '<td class="num save">' + money(m.savings) + '/yr</td></tr>';
    }).join('') +
    (fin.upcharge ? '<tr><td>Restricted-access labor</td><td class="num">' + money(fin.upcharge) + '</td><td class="num">—</td></tr>' : '');
    var breakeven = fin.payback != null ? Math.ceil(fin.payback) : null;
    return '<div class="slide-inner pricing">' +
      '<span class="kicker">Your Investment</span>' +
      '<div class="total">' + money(fin.cost) + '</div>' +
      '<table><thead><tr><th>Improvement</th><th class="num">Cost</th><th class="num">Saves</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      (breakeven != null ?
        '<p class="note">Cumulative savings overtake the investment in <b>Year ' + breakeven + '</b>. ' +
        'Projected 20-year net gain: <b>' + money(fin.savings * 20 - fin.cost) + '</b>.' +
        (fin.payback < fin.marketPayback ? ' That’s ahead of the ' + fin.marketPayback + '-year market average.' : '') + '</p>' : '') +
      '</div>';
  }

  function closingSlide(d) {
    return '<div class="slide-inner closing">' +
      '<span class="kicker">Next Steps</span>' +
      '<h2>Ready when you are.</h2>' +
      '<p>Reply to ' + esc(d.auditor || 'your auditor') + ' to approve this proposal and reserve your place on the installation calendar. ' +
      'Pricing is valid for 30 days; savings estimates are based on your home’s measured performance and current utility rates.</p>' +
      '<p class="fine">Prepared with ' + esc(BRAND) + ' field diagnostics. Your full assessment record — blower-door depressurization, combustion safety hard-stops, and air-quality baselines — is retained and available on request.</p>' +
      '</div>';
  }

  /* ── Engine ─────────────────────────────────────────────────────── */

  function buildSlides(d) {
    var slides = [coverSlide(d)];
    d.photos.forEach(function (p, i) { slides.push(findingSlide(p, i, d.photos.length)); });
    if (d.proposal && d.proposal.items.length) {
      d.proposal.items.forEach(function (m, i) { slides.push(measureSlide(m, i)); });
      slides.push(pricingSlide(d));
    } else {
      slides.push('<div class="slide-inner closing"><span class="kicker">In Progress</span>' +
        '<h2>Your proposal is being prepared.</h2><p>Your auditor is finalizing recommendations — this page will update automatically.</p></div>');
    }
    slides.push(closingSlide(d));
    return slides;
  }

  function render(d) {
    var slides = buildSlides(d);
    var current = 0;
    var root = document.getElementById('deck');

    root.innerHTML =
      '<header class="bar no-print">' +
      '<span class="brand">' + esc(BRAND) + '</span>' +
      '<span class="count" id="deck-count"></span>' +
      '<button class="pdf" onclick="window.print()">Export PDF</button>' +
      '</header>' +
      '<main class="stage no-print">' +
      slides.map(function (s, i) {
        return '<section class="slide" data-idx="' + i + '">' + s + '</section>';
      }).join('') +
      '</main>' +
      '<footer class="nav no-print">' +
      '<button id="deck-prev" aria-label="Previous slide">←</button>' +
      '<div class="dots" id="deck-dots">' +
      slides.map(function (_, i) { return '<button data-goto="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>'; }).join('') +
      '</div>' +
      '<button id="deck-next" aria-label="Next slide">→</button>' +
      '</footer>' +
      '<div class="print-only">' +
      slides.map(function (s) { return '<section class="print-slide">' + s + '</section>'; }).join('') +
      '</div>';

    function show(idx) {
      current = Math.max(0, Math.min(idx, slides.length - 1));
      var nodes = root.querySelectorAll('.slide');
      for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle('on', i === current);
      var dots = root.querySelectorAll('.dots button');
      for (var j = 0; j < dots.length; j++) dots[j].classList.toggle('on', j === current);
      document.getElementById('deck-count').textContent = (current + 1) + ' / ' + slides.length;
      document.getElementById('deck-prev').disabled = current === 0;
      document.getElementById('deck-next').disabled = current === slides.length - 1;
    }

    document.getElementById('deck-prev').onclick = function () { show(current - 1); };
    document.getElementById('deck-next').onclick = function () { show(current + 1); };
    document.getElementById('deck-dots').onclick = function (e) {
      var b = e.target.closest('[data-goto]');
      if (b) show(parseInt(b.getAttribute('data-goto'), 10));
    };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); show(current + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(current - 1); }
    });
    var touchX = null;
    document.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (touchX == null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
      touchX = null;
    }, { passive: true });

    show(0);
  }

  function fail(msg) {
    document.getElementById('deck').innerHTML =
      '<div class="deck-loading">' + esc(msg) + '</div>';
  }

  var cfg = window.BACKEND_CONFIG || {};
  var token = new URLSearchParams(location.search).get('t');
  if (!token) { fail('This proposal link is incomplete — ask your auditor to resend it.'); return; }
  if (!cfg.url) { fail('Proposal service is not configured.'); return; }

  fetch(cfg.url + '/functions/v1/proposal-deck?t=' + encodeURIComponent(token), {
    headers: { 'apikey': cfg.anonKey }
  }).then(function (r) {
    return r.json().then(function (data) {
      if (!r.ok || data.error) throw new Error(data.error || 'Could not load the proposal.');
      document.title = (data.customer.name ? data.customer.name + ' — ' : '') + 'Home Performance Proposal';
      render(data);
    });
  }).catch(function (e) {
    fail(e.name === 'TypeError' ? 'You appear to be offline — reconnect and refresh.' : e.message);
  });
})();
