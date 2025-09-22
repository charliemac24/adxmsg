<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Confirm Unsubscribe</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, Roboto, Arial; background: #fafafa; color: #222; }
    .card { max-width: 640px; margin: 60px auto; background: #fff; padding: 28px; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.08); }
    .btn { padding: 10px 16px; border-radius: 8px; border: none; cursor: pointer; }
    .btn-danger { background: #e74c3c; color: #fff; }
    .btn-cancel { background: #eee; color: #222; }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="margin-top:0;">Confirm unsubscribe</h1>
    <p>You’re about to stop receiving ADX Depot promotional and marketing SMS. Click <strong>Unsubscribe</strong> to confirm. You will then be redirected.</p>

    <form method="POST" action="/u/{{ $token }}/confirm">
      @csrf
      <div style="display:flex; gap:12px; margin-top:18px;">
        <button type="submit" class="btn btn-danger">Unsubscribe</button>
        <a
          href="/"
          class="btn btn-cancel"
          onclick="event.preventDefault(); try { window.open('', '_self'); window.close(); } catch (e) { window.location.href = '/'; }"
        >
          Cancel
        </a>
      </div>
    </form>

    <div style="margin-top:18px; font-size:13px; color:#666">If you did not expect this, you can safely ignore this message.</div>
  </div>
</body>
</html>
