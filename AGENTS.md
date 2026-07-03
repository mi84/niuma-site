# Niuma site — инструкции для AI-агента

Статический сайт **niuma.ru** (лендинг + оплата + утилиты для выданных
аккаунтов) плюс небольшой сервис `mail-api`. Сайт публикуется на **GitHub
Pages** (файл `CNAME`), поэтому изменения `*.html/js/css` появляются на
niuma.ru после мержа в `main` и передеплоя Pages.

## Структура

```
*.html                     — страницы сайта (index, guide, devin, 2fa, mail, pay, oferta, …)
script.js / style.css      — общий фронт
mail-api/                  — FastAPI-сервис чтения почты Outlook (см. mail-api/SPEC.md)
niuma.conf, *.sh, *.conf   — nginx / cloudflared / выпуск сертификатов (инфра)
.agents/skills/            — скиллы для агента (напр. testing-niuma-mail-api)
```

## mail-api (главное, что здесь трогаем)

Полная спека — **`mail-api/SPEC.md`**. Кратко:
- По строке `email----password----client_id----refresh_token` сервис получает
  OAuth-токен Microsoft и читает инбокс, отдаёт письма + коды (напр. код входа
  в Devin). Ничего не сохраняет.
- Порядок протоколов: **IMAP XOAUTH2 (основной) → при ошибке Outlook REST API
  v2.0 (фолбэк)**. REST нужен, когда на аккаунте отключён IMAP/POP (Outlook
  тогда отвечает `User is authenticated but not connected.`).
- **Не переходить на REST-only** без явного решения пользователя: REST v2.0
  помечен Microsoft как устаревший; IMAP работает там, где включён. Держим оба.

### Прод / деплой
`mail.html` (Pages) → `POST https://api.niuma.ru/mailapi/api/inbox`.
`api.niuma.ru` = **107.173.7.103** (сервис `niuma-mailapi`, uvicorn
`127.0.0.1:8201`, код `/opt/niuma-mailapi/app.py`). Команды деплоя и проверки —
в `mail-api/SPEC.md`. Тест-флоу через UI и подводные камни — в скилле
`.agents/skills/testing-niuma-mail-api/SKILL.md` (важно: длинный `refresh_token`
в браузере ВСТАВЛЯТЬ через буфер, не «печатать» — иначе теряются символы и
получите ложную ошибку `OAuth: AADSTS7000012 … different tenant`).

## Жёсткие правила

1. Не коммитить секреты и живые доступы (`refresh_token`, пароли, токены).
   Такие строки — эфемерные тестовые данные, после задачи их отзывают.
2. Не коммитить артефакты отладки (repro-скрипты, `cred.txt`, дампы почты).
3. Спеку `mail-api/SPEC.md` и эти инструкции обновлять при изменении поведения
   сервиса и заливать в репозиторий.
4. Деплой mail-api — только на 107.173.7.103; перед заменой `app.py` делать
   бэкап `app.py.bak.*` и проверять `py_compile` + `/api/health`.
5. Сайт на GitHub Pages: не ломать `CNAME`; помнить, что текст на niuma.ru
   обновляется только после мержа в `main`.
