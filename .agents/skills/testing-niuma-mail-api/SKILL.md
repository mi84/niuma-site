---
name: testing-niuma-mail-api
description: Deploy and test the Niuma mail-api (Outlook OAuth reader) end-to-end via https://niuma.ru/mail.html. Use when verifying changes to mail-api/app.py (IMAP/REST inbox reading, code extraction) or the mail.html frontend.
---

# Testing the Niuma mail-api (Outlook code reader)

## What it is
`mail-api/app.py` (FastAPI) exchanges an Outlook `refresh_token` for an OAuth
access token and reads the inbox, returning recent messages + extracted
verification codes (e.g. Devin login codes). Frontend: `mail.html`.
Input string format: `email----password----client_id----refresh_token`.

- IMAP XOAUTH2 is the primary path (`outlook.office365.com:993`).
- If IMAP fails (common cause: **account has IMAP/POP disabled** → Outlook
  answers with the misleading `User is authenticated but not connected.`), it
  falls back to the **Outlook REST API v2.0** (`outlook.office.com/api/v2.0/me/messages`)
  with the same token. Keep both — REST v2.0 is Microsoft-deprecated and may be
  turned off someday, IMAP works where enabled.

## Where it runs (prod)
- `mail.html` is on **GitHub Pages** at `https://niuma.ru/mail.html` and POSTs to
  `https://api.niuma.ru/mailapi/api/inbox`.
- `api.niuma.ru` resolves to **107.173.7.103** (NOT other niuma VPS like
  185.87.192.112, which only serves `svetlyachok.niuma.ru`). Verify with
  `getent hosts api.niuma.ru` before deploying.
- Service: `niuma-mailapi.service`, app at `/opt/niuma-mailapi/app.py`, uvicorn
  on `127.0.0.1:8201`, nginx route `/mailapi/` in
  `/etc/nginx/sites-available/api.niuma.conf`.

## Deploy a new app.py to prod
```bash
sshpass -p "$PASS" scp -o StrictHostKeyChecking=no mail-api/app.py root@107.173.7.103:/opt/niuma-mailapi/app.py
sshpass -p "$PASS" ssh root@107.173.7.103 '
  cp /opt/niuma-mailapi/app.py /opt/niuma-mailapi/app.py.bak.$(date +%s)
  /opt/niuma-mailapi/.venv/bin/python -m py_compile /opt/niuma-mailapi/app.py &&
  systemctl restart niuma-mailapi.service && sleep 2 &&
  systemctl is-active niuma-mailapi.service &&
  curl -s http://127.0.0.1:8201/api/health'
```
(back up the old app.py first; health returns `{"ok":true}`.)

## Quick API check (no browser)
```python
import json,urllib.request
req=urllib.request.Request("https://api.niuma.ru/mailapi/api/inbox",
  data=json.dumps({"raw":ACCOUNT_STRING,"sender":"cognition.ai"}).encode(),
  headers={"Content-Type":"application/json"})
a=json.load(urllib.request.urlopen(req,timeout=40))["accounts"][0]
print(a["ok"], a.get("transport"), a.get("code"))   # expect: True rest/imap <6-digit>
```

## UI test (record this)
1. Open `https://niuma.ru/mail.html`, maximize window.
2. Paste the account string into the "Аккаунты" textarea. Keep "Только письма
   Devin (код входа)" checked (sends `sender=cognition.ai`).
3. Click "Получить письма".
- **PASS**: green **OK** badge, a 6-digit code, messages from
  `Devin <no-reply@cognition.ai>` "Your Devin Login Code".
- **FAIL/old**: red **Ошибка** badge with `IMAP: User is authenticated but not connected.`

### GOTCHA — do NOT `type` the token
The refresh_token is ~500 chars; the computer-use `type` action drops
characters and you'll get an unrelated error like
`OAuth: AADSTS7000012: The grant was obtained for a different tenant.`
(mangled token). Instead put the exact string on the clipboard and paste:
```bash
tr -d '\n' < /tmp/tok.txt | DISPLAY=:0 xclip -selection clipboard
```
then click the textarea, `ctrl+a`, `Delete`, `ctrl+v`. Confirm via the DOM
`text=` attribute that the `M.` prefix and all chars are intact before submitting.

Note: `mail.html` footnote text still says "IMAP (XOAUTH2)" only — cosmetic; it
lives on GitHub Pages and lags merged doc changes. The functional fix is
server-side.

## Devin Secrets Needed
- `VPS` — SSH access to the niuma prod server (107.173.7.103, root). In this org
  it has been passed as a markdown table containing IP / port / user / password;
  extract the backtick-quoted fields.
- A valid Outlook account test string (`email----password----client_id----refresh_token`),
  provided per-task by the user. These are live creds — advise rotating after.
