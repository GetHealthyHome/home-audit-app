/* Optional Energy Model screen: external climate data (Open-Meteo) combined
   with measured audit data into an annual load/cost model. */
(function () {
  var esc = UI.esc;

  window.ScreenEnergy = function (ev) {
    var m = EnergyModel.ensure(ev);
    var r = EnergyModel.compute(ev);

    var setup = '<div class="card">' + UI.sectionHeading('Climate Data Source', 'pin') +
      '<p class="hint">The model pulls the last 12 months of daily temperatures for the home’s location from Open-Meteo and computes heating/cooling degree days.</p>' +
      UI.field({ label: 'Location (City, State)', bind: 'energyModel.location', placeholder: 'Portland, OR', value: m.location }) +
      '<button class="btn primary" data-action="energy-run" id="energy-run-btn">' +
      (m.climate ? 'Refresh Climate Data ' + icon('sync') : 'Run Energy Model ' + icon('bolt')) + '</button>' +
      (m.resolved ?
        '<p class="hint" style="margin-top:10px;display:flex;align-items:center;gap:6px">' + icon('pin') + ' Matched: ' +
        esc(m.resolved.name + (m.resolved.admin1 ? ', ' + m.resolved.admin1 : '')) +
        ' (' + m.resolved.lat.toFixed(2) + ', ' + m.resolved.lon.toFixed(2) + ')</p>' : '') +
      '</div>';

    var results = '';
    if (m.climate && r) {
      var savingsPct = null;
      var fin = Store.financials(ev);
      if (fin.savings > 0 && r.totalCost > 0) savingsPct = Math.round(fin.savings / r.totalCost * 100);

      results =
        '<div class="stat-cards">' +
        '<div class="stat-card"><div class="k" style="color:var(--muted)">Heating Degree Days</div><div class="v">' + m.climate.hdd.toLocaleString() + '</div><div class="foot">Base 65°F · ' + m.climate.days + ' days</div></div>' +
        '<div class="stat-card"><div class="k" style="color:var(--muted)">Cooling Degree Days</div><div class="v" style="color:var(--magenta)">' + m.climate.cdd.toLocaleString() + '</div><div class="foot">' + esc(m.climate.from) + ' → ' + esc(m.climate.to) + '</div></div>' +
        '</div>' +

        '<div class="card"><h3>Modeled Annual Energy Cost</h3>' +
        '<div class="bignum">' + UI.money(r.totalCost) + '<small>/ yr</small></div>' +
        '<div class="kv-list" style="margin-top:12px">' +
        '<div class="kv-row"><span class="k">Heating (' + r.therms.toLocaleString() + ' therms @ ' + (m.assumptions.eff || 85) + '% eff.)</span><span class="v">' + UI.money(r.heatingCost) + '</span></div>' +
        '<div class="kv-row"><span class="k">Cooling (' + r.coolingKwh.toLocaleString() + ' kWh @ SEER ' + (m.assumptions.seer || 13) + ')</span><span class="v">' + UI.money(r.coolingCost) + '</span></div>' +
        '</div>' +
        (savingsPct != null ?
          '<div class="insight" style="margin-bottom:0"><b>Proposal context:</b> the selected improvements (' + UI.money(fin.savings) +
          '/yr) target ≈ <b style="color:var(--green)">' + savingsPct + '%</b> of this home’s modeled annual energy spend.</div>' : '') +
        '</div>' +

        '<div class="card">' + UI.sectionHeading('Heat Loss Breakdown (UA)', 'thermo') +
        '<p class="hint">BTU/hr per °F of indoor–outdoor difference.</p>' +
        '<div class="kv-list">' +
        '<div class="kv-row"><span class="k">Air infiltration (' + r.cfm50.toLocaleString() + ' CFM50' + (r.cfm50Assumed ? ', assumed' : ', measured') + ' → ' + r.naturalCfm + ' nat. CFM)</span><span class="v">' + r.ua.infiltration + '</span></div>' +
        '<div class="kv-row"><span class="k">Ceiling / attic (R-' + r.rCeiling + ')</span><span class="v">' + r.ua.ceiling + '</span></div>' +
        '<div class="kv-row"><span class="k">Walls (est.)</span><span class="v">' + r.ua.walls + '</span></div>' +
        '<div class="kv-row"><span class="k">Windows (' + r.windowCount + ' units)</span><span class="v">' + r.ua.windows + '</span></div>' +
        '<div class="kv-row"><span class="k">Total UA</span><span class="v good">' + r.ua.total + '</span></div>' +
        '</div>' +
        (r.cfm50Assumed ?
          '<div class="insight"><b>Precision:</b> no blower-door reading yet — infiltration is an age-typical assumption. Run the Blower Door test and refresh for a measured model.</div>' : '') +
        '</div>' +

        '<div class="card">' + UI.sectionHeading('Assumptions', 'calc') +
        UI.field({ label: 'Fuel Price ($/therm)', bind: 'energyModel.assumptions.fuelPrice', type: 'number', inputmode: 'decimal', value: m.assumptions.fuelPrice }) +
        UI.field({ label: 'Electric Price ($/kWh)', bind: 'energyModel.assumptions.elecPrice', type: 'number', inputmode: 'decimal', value: m.assumptions.elecPrice }) +
        UI.field({ label: 'Heating System Efficiency (%)', bind: 'energyModel.assumptions.eff', type: 'number', inputmode: 'numeric', value: m.assumptions.eff }) +
        UI.field({ label: 'Cooling SEER', bind: 'energyModel.assumptions.seer', type: 'number', inputmode: 'numeric', value: m.assumptions.seer }) +
        '<p class="hint">Edits recompute instantly — no refetch needed. Climate data cached ' + esc((m.climate.fetchedAt || '').slice(0, 10)) + '.</p>' +
        '<button class="btn danger-ghost" data-action="energy-clear">Clear model data</button>' +
        '</div>';
    } else {
      results = '<div class="empty">' + icon('chart') +
        '<b>No model yet</b><p>Set the location and run the model. Works best after the blower door test and attic assessment are recorded.</p></div>';
    }

    return UI.subbar('Energy Model', '#/eval/' + ev.id + '/hub') +
      '<div class="screen">' +
      '<span class="eyebrow blue">' + icon('chart') + ' Optional Module</span>' +
      '<h1 class="screen-title">Energy Model</h1>' +
      '<p class="screen-sub">Climate-normalized load model built from this home’s measured leakage and envelope data. Run it when the customer wants modeled costs — it is not required to complete the audit.</p>' +
      setup + results +
      '</div>';
  };
})();
