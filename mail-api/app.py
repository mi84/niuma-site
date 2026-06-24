"""Mail fetcher for Microsoft/Outlook accounts given as
`email----password----client_id----refresh_token` strings.

Exchanges the refresh token for an OAuth access token and reads the inbox over
IMAP (XOAUTH2), returning recent messages and any verification codes found
(e.g. Devin login codes). No mail data is stored server-side.
"""
import os
import re
import email
import imaplib
import urllib.parse
import urllib.request
import json
from email.header import decode_header
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
IMAP_HOST = "outlook.office365.com"
IMAP_PORT = 993
SCOPE = "https://outlook.office.com/IMAP.AccessAsUser.All offline_access"

# Optional shared secret. If set, clients must send it in the request body "key".
API_KEY = os.environ.get("MAIL_API_KEY", "").strip()
# Max accounts processed per request.
MAX_ACCOUNTS = int(os.environ.get("MAIL_API_MAX_ACCOUNTS", "10"))
# Recent messages fetched per account.
FETCH_LIMIT = int(os.environ.get("MAIL_API_FETCH_LIMIT", "10"))

# CORS is handled by the nginx reverse proxy (api.niuma.ru), so no middleware here.
app = FastAPI(title="niuma mail api")


class InboxRequest(BaseModel):
    raw: str = ""
    sender: str = ""
    key: str = ""


def parse_account(line):
    parts = [p for p in line.strip().split("----")]
    if len(parts) < 4 or not parts[0]:
        return None
    return {
        "email": parts[0].strip(),
        "password": parts[1].strip(),
        "client_id": parts[2].strip(),
        "refresh_token": "----".join(parts[3:]).strip(),
    }


def get_access_token(client_id, refresh_token):
    data = urllib.parse.urlencode({
        "client_id": client_id,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "scope": SCOPE,
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)["access_token"]


def decode_mime(value):
    if not value:
        return ""
    out = []
    for chunk, enc in decode_header(value):
        if isinstance(chunk, bytes):
            out.append(chunk.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(chunk)
    return "".join(out)


def get_body_text(msg):
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and "attachment" not in str(part.get("Content-Disposition")):
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    html = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
                    return re.sub(r"<[^>]+>", " ", html)
        return ""
    payload = msg.get_payload(decode=True)
    if payload:
        return payload.decode(msg.get_content_charset() or "utf-8", errors="replace")
    return ""


def extract_codes(text):
    if not text:
        return []
    codes = re.findall(r"(?<!\d)(\d{6,8})(?!\d)", text)
    seen = []
    for c in codes:
        if c not in seen:
            seen.append(c)
    return seen[:5]


def fetch_account(line, sender_filter):
    acc = parse_account(line)
    if not acc:
        return {"raw": line.strip()[:60], "ok": False, "error": "Не удалось разобрать строку (нужно email----пароль----client_id----refresh_token)"}
    result = {"email": acc["email"], "ok": False, "messages": [], "code": None}
    try:
        token = get_access_token(acc["client_id"], acc["refresh_token"])
    except urllib.error.HTTPError as e:
        try:
            detail = json.load(e).get("error_description", "")[:160]
        except Exception:
            detail = str(e)
        result["error"] = f"OAuth: {detail}"
        return result
    except Exception as e:
        result["error"] = f"OAuth: {e}"
        return result

    auth_string = f"user={acc['email']}\x01auth=Bearer {token}\x01\x01"
    try:
        imap = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
        imap.authenticate("XOAUTH2", lambda _: auth_string.encode())
        imap.select("INBOX")
        if sender_filter:
            typ, data = imap.search(None, "FROM", f'"{sender_filter}"')
        else:
            typ, data = imap.search(None, "ALL")
        ids = data[0].split()
        all_codes = []
        for mid in reversed(ids[-FETCH_LIMIT:]):
            typ, md = imap.fetch(mid, "(RFC822)")
            if not md or not md[0]:
                continue
            msg = email.message_from_bytes(md[0][1])
            subject = decode_mime(msg.get("Subject"))
            body = get_body_text(msg)
            codes = extract_codes(subject + "\n" + body)
            all_codes.extend(codes)
            preview = re.sub(r"\s+", " ", body).strip()[:240]
            result["messages"].append({
                "from": decode_mime(msg.get("From")),
                "subject": subject,
                "date": msg.get("Date", ""),
                "preview": preview,
                "codes": codes,
            })
        imap.logout()
        result["ok"] = True
        result["code"] = all_codes[0] if all_codes else None
    except Exception as e:
        result["error"] = f"IMAP: {e}"
    return result


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/inbox")
def inbox(req: InboxRequest):
    if API_KEY and req.key != API_KEY:
        raise HTTPException(status_code=401, detail="Неверный или отсутствует ключ доступа")
    lines = [l for l in req.raw.splitlines() if l.strip()]
    if not lines:
        raise HTTPException(status_code=400, detail="Пустой список аккаунтов")
    if len(lines) > MAX_ACCOUNTS:
        raise HTTPException(status_code=400, detail=f"Максимум {MAX_ACCOUNTS} аккаунтов за раз")
    sender = req.sender.strip()
    with ThreadPoolExecutor(max_workers=min(len(lines), 8)) as ex:
        results = list(ex.map(lambda l: fetch_account(l, sender), lines))
    return {"accounts": results}
