<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Unsubscribe</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; background:#f6f8fa; color:#222; }
      .card { max-width:640px; margin:72px auto; background:#fff; border-radius:8px; padding:28px; box-shadow:0 6px 30px rgba(16,24,40,0.08); }
      h1 { margin:0 0 8px 0; font-size:20px; }
      p { color:#444; margin:8px 0 0 0; }
      .muted { color:#777; font-size:13px; margin-top:12px }
      .ok { display:inline-block; margin-top:18px; padding:10px 14px; background:#46aa42; color:#fff; border-radius:6px; text-decoration:none }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>{{ $title ?? 'You are unsubscribed' }}</h1>
      <p>{{ $message ?? 'You have been successfully unsubscribed from our messages. You will no longer receive SMS from us.' }}</p>
      <p class="muted">If this was a mistake and you want to subscribe again, please contact support or log into your account.</p>
      <a class="ok" href="#" id="exitBtn">Exit</a>
    </div>

    <script>
      (function () {
        var btn = document.getElementById('exitBtn');
        if (!btn) return;
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          // Attempt to close the tab. Browsers may block closing tabs not opened by script;
          // as a fallback navigate to about:blank then try to close again.
          try { window.close(); } catch (err) {}
          setTimeout(function () {
            try {
              window.open('', '_self');
              window.location.href = 'about:blank';
              window.close();
            } catch (err) {}
          }, 200);
        });
      })();
    </script>
  </body>
</html>
