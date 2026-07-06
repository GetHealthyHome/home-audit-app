/* Housecall Pro job import. The app never talks to api.housecallpro.com
   directly — the company API key lives server-side as a Supabase Edge
   Function secret (HCP_API_KEY), and the `hcp-jobs` function proxies a slim,
   read-only job list to signed-in crew. */
(function () {
  var CFG = window.BACKEND_CONFIG || { url: '', anonKey: '' };

  function fetchJobs() {
    return Auth.ensureFresh().then(function (token) {
      if (!token) throw new Error('SIGN_IN_REQUIRED');
      return fetch(CFG.url + '/functions/v1/hcp-jobs?days=14', {
        headers: {
          'apikey': CFG.anonKey,
          'Authorization': 'Bearer ' + token
        }
      });
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('Job import failed (HTTP ' + r.status + '): ' + t.slice(0, 120)); });
      return r.json();
    });
  }

  window.Hcp = {
    /* Import upcoming Housecall Pro jobs as scheduled evaluations.
       Dedupes on the HCP job id; re-imports refresh schedule details of
       jobs that haven't been started yet. */
    importJobs: function () {
      return fetchJobs().then(function (data) {
        if (data && data.configured === false) {
          var e = new Error('NOT_CONFIGURED');
          e.notConfigured = true;
          throw e;
        }
        var jobs = (data && data.jobs) || [];
        var added = 0, updated = 0;
        var activeBefore = Store.state.activeEvalId;
        jobs.forEach(function (job) {
          if (!job.id) return;
          var existing = Store.listEvals().filter(function (e) { return e.hcpId === job.id; })[0];
          var when = job.scheduledStart ? new Date(job.scheduledStart) : null;
          var appt = {
            date: when ? when.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            time: when ? String(when.getHours()).padStart(2, '0') + ':' + String(when.getMinutes()).padStart(2, '0') : '',
            type: 'Evaluation',
            state: job.workStatus ? job.workStatus.replace(/_/g, ' ') : 'Scheduled'
          };
          if (existing) {
            if (existing.status === 'scheduled') {
              Object.assign(existing.appointment, appt);
              if (job.customer) existing.customer.name = job.customer;
              if (job.address) existing.customer.address = job.address;
              updated++;
            }
            return;
          }
          var ev = Store.createEval(
            { name: job.customer || 'Housecall Pro job', address: job.address || '', phone: '', email: '' },
            appt);
          ev.hcpId = job.id;
          ev.source = 'housecallpro';
          if (job.description) ev.intake.motivation = job.description.slice(0, 120);
          added++;
        });
        if (activeBefore) Store.state.activeEvalId = activeBefore;
        Store.save();
        return { added: added, updated: updated, total: jobs.length };
      });
    }
  };
})();
