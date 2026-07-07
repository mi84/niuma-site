---
name: testing-niuma-mail-api
description: Deploy and test the Niuma mail-api (Outlook OAuth reader) end-to-end. Client is now the Devin sales Telegram bot @windsurf_pro_bot (mail.html was removed). Use when verifying changes to mail-api/app.py (IMAP/REST inbox reading, code extraction).
---

# Testing the Niuma mail-api (Outlook code reader)

## What it is
`mail-api/app.py` (FastAPI) exchanges an Outlook `refresh_token` for an OAuth
access token and reads the inbox, returning recent messages + extracted
verification codes (e.g. Devin login codes). Client: the Devin sales Telegram
bot `wind_bot/shop_bot_2.py` (`@windsurf_pro_bot`) — the old `mail.html` page
was removed. Input string format: `email----password----client_id----refresh_token`.

- IMAP XOAUTH2 is the primary path (`outlook.office365.com:993`).
- If IMAP fails (common cause: **account has IMAP/POP disabled** → Outlook
  answers with the misleading `User is authenticated but not connected.`), it
  falls back to the **Outlook REST API v2.0** (`outlook.office.com/api/v2.0/me/messages`)
  with the same token. Keep both — REST v2.0 is Microsoft-deprecated and may be
  turned off someday, IMAP works where enabled.

## Where it runs (prod)
- Client: the Telegram bot `@windsurf_pro_bot` (repo `bot`, service
  `wind_shop_bot_2` on the same VPS) POSTs to
  `https://api.niuma.ru/mailapi/api/inbox` via `common/code_tools.fetch_mail_code`.
  The old `mail.html` GitHub Pages frontend was removed.
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

## Bot test (record this)
1. Open `@windsurf_pro_bot` in Telegram → main menu → **🔑 Получить код** →
   **📧 Код с почты**.
2. Send the account string `email----password----client_id----refresh_token`.
3. The bot replies with the latest login code and a **🔄 Обновить** button.
- **PASS**: “✅ Последний код входа” with a 6-digit code (from
  `Devin <no-reply@cognition.ai>` "Your Devin Login Code").
- **FAIL/old**: “❌ Не удалось получить код”, e.g. `IMAP: User is authenticated but not connected.`

2FA: **🔑 Получить код** → **🔐 2FA-код** → send the Base32 token → 6-digit
TOTP with **🔄 Обновить** (computed locally in the bot, not via mail-api).

### GOTCHA — do NOT `type` the token
The refresh_token is ~500 chars; the computer-use `type` action drops
characters and you'll get an unrelated error like
`OAuth: AADSTS7000012: The grant was obtained for a different tenant.`
(mangled token). Instead put the exact string on the clipboard and paste it
into the Telegram input, or use the quick API check below to avoid the UI.

### Fastest: API check without any UI
Prefer the “Quick API check” above — it hits the same endpoint the bot uses and
sidesteps token-typing issues entirely.

## Devin Secrets Needed
- `VPS` — SSH access to the niuma prod server (107.173.7.103, root). In this org
  it has been passed as a markdown table containing IP / port / user / password;
  extract the backtick-quoted fields.
- A valid Outlook account test string (`email----password----client_id----refresh_token`),
  provided per-task by the user. These are live creds — advise rotating after.
