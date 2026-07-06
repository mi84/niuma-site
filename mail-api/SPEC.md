# SPEC — Niuma mail-api (Outlook OAuth code reader)

FastAPI-сервис, который по строке доступа Outlook отдаёт последние письма и
извлечённые коды подтверждения (в т.ч. коды входа в Devin). Почта нигде не
сохраняется.

## Вход

Строка аккаунта: `email----password----client_id----refresh_token`
(`refresh_token` может содержать `----` — всё после 3-го разделителя
склеивается обратно, см. `parse_account`).

## Эндпоинты

- `GET /api/health` → `{"ok": true}`.
- `POST /api/inbox` — тело `InboxRequest`:
  - `raw` — одна или несколько строк аккаунтов (по одной в строке, максимум
    `MAIL_API_MAX_ACCOUNTS`, по умолчанию 10);
  - `sender` — необязательный фильтр по отправителю (подстрока; для «только
    письма Devin» фронт шлёт `cognition.ai`);
  - `key` — необязательный общий секрет (проверяется, только если задан
    `MAIL_API_KEY`).
  - Ответ: `{"accounts": [ {email, ok, messages[], code, transport, error?}, ... ]}`.
    Аккаунты обрабатываются параллельно (`ThreadPoolExecutor`).
  - Тело — JSON; принимается и с `Content-Type: application/json`, и с
    `text/plain` (тело парсится вручную). Фронт шлёт **без** заголовка
    `Content-Type`, чтобы запрос был CORS-«простым» и браузер не делал preflight
    `OPTIONS` — некоторые сети/провайдеры режут OPTIONS к зарубежному IP, и это
    выглядело как ложное `Failed to fetch` при живом сервере. Блокирующая работа
    вынесена в `run_in_threadpool`, чтобы не держать event loop.

## Поток на аккаунт (`fetch_account`)

1. **OAuth**: `refresh_token` → access token через
   `https://login.microsoftonline.com/consumers/oauth2/v2.0/token`,
   scope `https://outlook.office.com/IMAP.AccessAsUser.All offline_access`.
   Ошибка здесь → `error: "OAuth: …"`, аккаунт помечается `ok:false`.
2. **IMAP (основной путь)**: XOAUTH2 к `outlook.office365.com:993`, поиск
   `FROM "<sender>"` либо `ALL`, разбор последних `MAIL_API_FETCH_LIMIT` писем,
   извлечение кодов (`extract_codes`: числа 6–8 цифр). Успех → `transport:"imap"`.
3. **REST-фолбэк**: если IMAP бросает исключение (частая причина — на аккаунте
   **отключён IMAP/POP**, Outlook отвечает вводящим в заблуждение
   `User is authenticated but not connected.`), читаем инбокс через Outlook
   **REST API v2.0** (`https://outlook.office.com/api/v2.0/me/messages`) тем же
   токеном — он также даёт `Mail.ReadWrite` на ресурсе `outlook.office.com`,
   поэтому работает независимо от тумблера IMAP/POP. Успех → `transport:"rest"`.
   Фильтр по отправителю в REST применяется на стороне сервиса (подстрока по
   `From`, как семантика IMAP `FROM`). Формат сообщений идентичен IMAP-пути
   (`from/subject/date/preview/codes`).
4. Если и IMAP, и REST упали → `error: "IMAP: …; REST: …"`.

**Почему держим оба, а не только REST:** Outlook REST API v2.0 помечен
Microsoft как устаревший (может быть отключён), а IMAP работает на аккаунтах,
где он включён. Схема «IMAP → при ошибке REST» покрывает оба случая. Не
переходить на REST-only без явного решения.

## Конфигурация (env)

| Переменная | Назначение | Дефолт |
|---|---|---|
| `MAIL_API_KEY` | общий секрет; если задан — клиент обязан прислать `key` | пусто (проверки нет) |
| `MAIL_API_MAX_ACCOUNTS` | максимум аккаунтов за запрос | 10 |
| `MAIL_API_FETCH_LIMIT` | сколько последних писем на аккаунт | 10 |

CORS вешается на nginx (api.niuma.ru), в приложении middleware нет.

## Продакшн-топология

- Фронт `mail.html` — на **GitHub Pages** (`https://niuma.ru/mail.html`), шлёт
  `POST https://api.niuma.ru/mailapi/api/inbox`.
- `api.niuma.ru` → **107.173.7.103** (проверять `getent hosts api.niuma.ru`;
  другой VPS 185.87.192.112 обслуживает только `svetlyachok.niuma.ru`).
- Сервис `niuma-mailapi.service`, код в `/opt/niuma-mailapi/app.py`, uvicorn на
  `127.0.0.1:8201`, маршрут nginx `/mailapi/` в
  `/etc/nginx/sites-available/api.niuma.conf`.

### Деплой новой версии

```bash
scp mail-api/app.py root@107.173.7.103:/opt/niuma-mailapi/app.py   # сначала бэкап app.py.bak.*
ssh root@107.173.7.103 '
  /opt/niuma-mailapi/.venv/bin/python -m py_compile /opt/niuma-mailapi/app.py &&
  systemctl restart niuma-mailapi.service && sleep 2 &&
  systemctl is-active niuma-mailapi.service &&
  curl -s http://127.0.0.1:8201/api/health'
```

`mail.html` обновляется автоматически через GitHub Pages при мерже в `main`
(текст сноски про протокол может отставать от деплоя — это косметика,
функциональная логика на сервере).
