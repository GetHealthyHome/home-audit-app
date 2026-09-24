/* Minimal CSV parse/stringify (RFC-4180 style: quoted fields, embedded
   commas/quotes/newlines) used by the admin bulk-template upload. */
(function () {
  window.CSVX = {
    parse: function (text) {
      var rows = [];
      var row = [];
      var field = '';
      var inQuotes = false;
      var i = 0;
      text = String(text || '').replace(/^﻿/, '');
      while (i < text.length) {
        var c = text[i];
        if (inQuotes) {
          if (c === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            inQuotes = false; i++; continue;
          }
          field += c; i++; continue;
        }
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ',') { row.push(field); field = ''; i++; continue; }
        if (c === '\r') { i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        field += c; i++;
      }
      if (field !== '' || row.length) { row.push(field); rows.push(row); }
      // Drop fully empty trailing rows (a trailing newline is common).
      return rows.filter(function (r) {
        return r.some(function (f) { return String(f).trim() !== ''; });
      });
    },

    stringify: function (rows) {
      return rows.map(function (r) {
        return r.map(function (f) {
          var s = f == null ? '' : String(f);
          return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
      }).join('\r\n') + '\r\n';
    }
  };
})();
