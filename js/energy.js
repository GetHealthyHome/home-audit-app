/* Optional energy model — external climate data + measured audit data.
   Data source: Open-Meteo (geocoding + historical weather archive). Keyless
   and CORS-enabled, so the static app can call it directly from the field.
   The module is opt-in per customer: nothing in the audit flow requires it.

   Model shape stored on the evaluation:
   ev.energyModel = {
     location: 'Portland, OR',      // user-editable place query
     resolved: { name, admin1, lat, lon },
     climate: { hdd, cdd, days, from, to, fetchedAt },
     assumptions: { fuelPrice, elecPrice, eff, seer, nFactor }
   }
   Loads/costs are derived at render time from climate + current audit data,
   so editing assumptions or audit inputs never requires a refetch. */
(function () {
  var GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  var ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

  function defaults() {
    return {
      fuelPrice: 1.45,  // $/therm (natural gas)
      elecPrice: 0.16,  // $/kWh
      eff: 85,          // heating system efficiency %
      seer: 13,         // cooling efficiency
      nFactor: 20       // CFM50 -> natural infiltration divisor
    };
  }

  /* Guess a geocodable place from the service address tail
     ("124 Organic Lane, Portland, OR" -> "Portland"). */
  function placeFromAddress(address) {
    var parts = (address || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2];
    return parts[0] || '';
  }

  function ensure(ev) {
    if (!ev.energyModel) {
      ev.energyModel = {
        location: placeFromAddress(ev.customer.address),
        resolved: null,
        climate: null,
        assumptions: defaults()
      };
      Store.save();
    }
    // older records may miss newer assumption keys
    var d = defaults();
    for (var k in d) {
      if (ev.energyModel.assumptions[k] == null) ev.energyModel.assumptions[k] = d[k];
    }
    return ev.energyModel;
  }

  function degreeDays(temps) {
    var hdd = 0, cdd = 0, days = 0;
    temps.forEach(function (t) {
      if (t == null) return;
      days++;
      if (t < 65) hdd += 65 - t;
      if (t > 65) cdd += t - 65;
    });
    return { hdd: Math.round(hdd), cdd: Math.round(cdd), days: days };
  }

  /* Fetch geocode + 12 months of daily mean temperature. */
  function run(ev) {
    var m = ensure(ev);
    var q = (m.location || '').trim();
    if (!q) return Promise.reject(new Error('Enter a town/city to model against.'));

    return fetch(GEO_URL + '?count=1&language=en&format=json&name=' + encodeURIComponent(q))
      .then(function (r) {
        if (!r.ok) throw new Error('Geocoding failed (HTTP ' + r.status + ')');
        return r.json();
      })
      .then(function (geo) {
        var hit = geo && geo.results && geo.results[0];
        if (!hit) throw new Error('No location match for "' + q + '" — try "City, State".');
        m.resolved = { name: hit.name, admin1: hit.admin1 || '', lat: hit.latitude, lon: hit.longitude };

        var end = new Date(Date.now() - 7 * 24 * 3600 * 1000); // archive lags a few days
        var start = new Date(end.getTime() - 365 * 24 * 3600 * 1000);
        var iso = function (d) { return d.toISOString().slice(0, 10); };
        var url = ARCHIVE_URL + '?latitude=' + hit.latitude + '&longitude=' + hit.longitude +
          '&start_date=' + iso(start) + '&end_date=' + iso(end) +
          '&daily=temperature_2m_mean&temperature_unit=fahrenheit&timezone=auto';
        return fetch(url).then(function (r) {
          if (!r.ok) throw new Error('Climate archive failed (HTTP ' + r.status + ')');
          return r.json();
        }).then(function (wx) {
          var temps = (wx.daily && wx.daily.temperature_2m_mean) || [];
          if (temps.length < 300) throw new Error('Climate record incomplete for this location.');
          var dd = degreeDays(temps);
          m.climate = {
            hdd: dd.hdd, cdd: dd.cdd, days: dd.days,
            from: iso(start), to: iso(end),
            fetchedAt: new Date().toISOString()
          };
          Store.save();
          return m;
        });
      });
  }

  /* Derive loads + annual costs from climate data, measured audit inputs,
     and the (editable) assumptions. All heat flow in BTU/hr·°F (UA). */
  function compute(ev) {
    var m = ev.energyModel;
    if (!m || !m.climate) return null;
    var a = m.assumptions;

    var sqft = parseFloat(ev.site.sqft) || 1800;
    var stories = parseFloat(ev.site.stories) || 1;
    var footprint = sqft / stories;

    // Infiltration: measured CFM50 when available, else an age-based guess.
    var cfm50 = parseFloat(ev.tests.blower.cfm50);
    var cfm50Assumed = !cfm50;
    if (!cfm50) cfm50 = sqft * 1.4; // leaky-average default
    var naturalCfm = cfm50 / (a.nFactor || 20);
    var uaInfiltration = 1.08 * naturalCfm;

    // Ceiling: measured attic R when recorded, else R-19.
    var atticFields = (ev.zones.attic && ev.zones.attic.fields) || {};
    var rv = Store.rValue(atticFields.insulationType, atticFields.depth);
    var rCeiling = rv ? rv.r : 19;
    var uaCeiling = footprint / Math.max(rCeiling, 1);

    // Walls: perimeter approximation at R-13; windows from the window audit.
    var perimeter = 4 * Math.sqrt(footprint);
    var wallArea = perimeter * 9 * stories;
    var windowCount = 0;
    ['floor1', 'floor2', 'floor3'].forEach(function (f) {
      windowCount += ((ev.zones[f] && ev.zones[f].windows) || []).length;
    });
    if (!windowCount) windowCount = Math.round(sqft / 180);
    var windowArea = windowCount * 15;
    var uaWindows = windowArea / 2;               // ~R-2 average glazing
    var uaWalls = Math.max(wallArea - windowArea, 0) / 13;

    var uaTotal = uaInfiltration + uaCeiling + uaWalls + uaWindows;

    var heatingBtu = uaTotal * m.climate.hdd * 24;
    var eff = Math.min(Math.max((parseFloat(a.eff) || 85) / 100, 0.5), 1);
    var therms = heatingBtu / (100000 * eff);
    var heatingCost = therms * (parseFloat(a.fuelPrice) || 1.45);

    var coolingKwh = (uaTotal * m.climate.cdd * 24) / ((parseFloat(a.seer) || 13) * 1000);
    var coolingCost = coolingKwh * (parseFloat(a.elecPrice) || 0.16);

    return {
      ua: {
        infiltration: Math.round(uaInfiltration),
        ceiling: Math.round(uaCeiling),
        walls: Math.round(uaWalls),
        windows: Math.round(uaWindows),
        total: Math.round(uaTotal)
      },
      cfm50: Math.round(cfm50),
      cfm50Assumed: cfm50Assumed,
      naturalCfm: Math.round(naturalCfm),
      rCeiling: rCeiling,
      windowCount: windowCount,
      heatingBtu: Math.round(heatingBtu),
      therms: Math.round(therms),
      heatingCost: Math.round(heatingCost),
      coolingKwh: Math.round(coolingKwh),
      coolingCost: Math.round(coolingCost),
      totalCost: Math.round(heatingCost + coolingCost)
    };
  }

  window.EnergyModel = { ensure: ensure, run: run, compute: compute, degreeDays: degreeDays };
})();
