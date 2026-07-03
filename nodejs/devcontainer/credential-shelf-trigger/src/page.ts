/**
 * The self-contained operator page served at `GET /`. It carries no secrets: the shared token
 * is entered on the device and kept in `localStorage`, and every call adds it as a Bearer
 * header — so the token never rides a URL or lands in a server log. Designed for a phone: save
 * the token once, then tap "Refresh" to start a device-code login and get the `user_code` +
 * an approval link. Plain inline HTML/CSS/JS, no build step, no external resources.
 */
export const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AWS session refresh</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0 auto; padding: 1.25rem; max-width: 32rem; }
  h1 { font-size: 1.25rem; }
  button { font-size: 1rem; padding: 0.75rem 1rem; width: 100%; margin: 0.35rem 0; border-radius: 0.5rem; border: 1px solid #8888; background: #0000; color: inherit; }
  button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  input { font-size: 1rem; padding: 0.6rem; width: 100%; box-sizing: border-box; border-radius: 0.5rem; border: 1px solid #8888; }
  .card { border: 1px solid #8884; border-radius: 0.75rem; padding: 1rem; margin: 0.75rem 0; }
  .code { font-size: 2rem; font-weight: 700; letter-spacing: 0.15em; text-align: center; padding: 0.5rem 0; }
  a.approve { display: block; text-align: center; padding: 0.75rem; background: #16a34a; color: #fff; border-radius: 0.5rem; text-decoration: none; margin-top: 0.5rem; }
  .muted { color: #8a8a8a; font-size: 0.85rem; }
  .err { color: #dc2626; }
  .hidden { display: none; }
</style>
</head>
<body>
<h1>AWS session refresh</h1>
<div id="setup" class="card hidden">
  <label class="muted" for="token">Access token</label>
  <input id="token" type="password" autocomplete="off" autocapitalize="off" placeholder="paste the shared token">
  <button class="primary" id="save">Save token</button>
  <p class="muted">Stored only on this device.</p>
</div>
<div id="main" class="hidden">
  <button class="primary" id="refresh">Refresh AWS session</button>
  <button id="status">Check status</button>
  <button id="forget">Forget token</button>
  <div id="out" aria-live="polite"></div>
</div>
<script>
(function () {
  var KEY = 'refresh-trigger-token';
  var $ = function (id) { return document.getElementById(id); };
  var token = function () { return localStorage.getItem(KEY); };
  var out = function (html) { $('out').innerHTML = html; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  }); };
  // Only ever link an http(s) URL — never a javascript:/data: scheme, even if the upstream
  // response were tampered with (it must not become a token-exfiltration click).
  var safeUrl = function (u) { return /^https?:\\/\\//i.test(String(u == null ? '' : u)) ? u : ''; };
  var show = function () {
    var t = token();
    $('setup').classList.toggle('hidden', !!t);
    $('main').classList.toggle('hidden', !t);
  };
  var call = function (method, path) {
    return fetch(path, { method: method, headers: { Authorization: 'Bearer ' + token() } });
  };
  var rejectToken = function () { localStorage.removeItem(KEY); show(); };

  $('save').onclick = function () {
    var v = $('token').value.trim();
    if (v) { localStorage.setItem(KEY, v); $('token').value = ''; out(''); show(); }
  };
  $('forget').onclick = function () { rejectToken(); out(''); };

  $('refresh').onclick = function () {
    out('<p class="muted">Starting device-code login…</p>');
    call('POST', '/refresh').then(function (r) {
      if (r.status === 401) { out('<p class="err">Token rejected — re-enter it.</p>'); rejectToken(); return; }
      if (r.status === 429) { out('<p class="err">Rate limited — a refresh was triggered too recently.</p>'); return; }
      if (!r.ok) { out('<p class="err">Trigger failed (' + r.status + ').</p>'); return; }
      return r.json().then(function (d) {
        var html = (d.prompts || []).map(function (p) {
          var link = safeUrl(p.verification_uri_complete) || safeUrl(p.verification_uri);
          var approve = link
            ? '<a class="approve" href="' + esc(link) + '" target="_blank" rel="noopener">Open approval page</a>'
            : '<div class="muted">Approval URL: ' + esc(p.verification_uri || '(none)') + '</div>';
          return '<div class="card"><div class="muted">Enter this code at the AWS page:</div>'
            + '<div class="code">' + esc(p.user_code) + '</div>'
            + approve
            + '<p class="muted">Approve only this code — it came from this tap.</p></div>';
        }).join('');
        out(html || '<p class="err">No prompt returned.</p>');
      });
    }).catch(function () { out('<p class="err">Network error reaching the trigger.</p>'); });
  };

  $('status').onclick = function () {
    call('GET', '/status').then(function (r) {
      if (r.status === 401) { out('<p class="err">Token rejected — re-enter it.</p>'); rejectToken(); return; }
      if (!r.ok) { out('<p class="err">Status failed (' + r.status + ').</p>'); return; }
      return r.json().then(function (d) {
        out('<div class="card"><div class="muted">SSO session expires</div><div>' + esc(d.session_expires_at || 'unknown') + '</div>'
          + '<div class="muted" style="margin-top:.5rem">Vended creds expire</div><div>' + esc(d.credentials_expire_at || 'unknown') + '</div>'
          + (d.refresh_pending ? '<p class="muted">A refresh is pending approval.</p>' : '') + '</div>');
      });
    }).catch(function () { out('<p class="err">Network error.</p>'); });
  };

  show();
})();
</script>
</body>
</html>
`
