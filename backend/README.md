# Backend API (CMWC)

## Быстрый старт
- Установка: `cd backend && npm install`
- Разработка: `npm run dev` (по умолчанию `http://localhost:3001`)
- Сборка и запуск: `npm run build && npm start`

## Переменные окружения
- `PORT` — порт сервера (по умолчанию `3001`).
- `SQLITE_DB_PATH` — путь к БД SQLite; для тестов поддерживается `':memory:'`.
- `MISTRAL_API_KEY` — ключ Mistral для LLM‑переранжирования.
- `MISTRAL_MODEL` — модель Mistral (по умолчанию `mistral-small-latest`).
- `MISTRAL_BASE_URL` — базовый URL Mistral API (по умолчанию `https://api.mistral.ai/v1`).
- `OPENAI_API_KEY` — ключ OpenAI (fallback, если нет Mistral).
- `OPENAI_MODEL` — модель OpenAI (по умолчанию `gpt-4o-mini`).
- `OPENAI_BASE_URL` — базовый URL OpenAI API (по умолчанию `https://api.openai.com/v1`).
- `LLM_DEBUG` — `1` включает логирование LLM в `backend/logs/llm.log`.

## Структура
- Приложение: `src/app.ts` (экспорт `createApp()`).
- Запуск сервера: `src/server.ts`.
- БД и схемы: `src/db.ts`.
- Парсер цен: `src/scrapeGarant.ts`.
- Матрица: `src/matrix.ts`.
- Подбор по дисциплинам: `src/mapping.ts`.
- Подбор по элементам: `src/elementMapping.ts`.
- LLM-интеграция: `src/llm.ts`.

## Эндпоинты

### Матрица
- `GET /api/matrix`
  - Возвращает колонки/строки/значения матрицы и путь источника CSV.
  - Пример: `curl http://localhost:3001/api/matrix`
  - Реализация: `src/app.ts:22`.

### Стоимости (парсинг и чтение)
- `POST /api/prices/scrape`
  - Скрейпит прайс‑лист garantstroikompleks.ru и сохраняет в БД.
  - Ответ: `{ scraped, inserted }`.
  - Реализация: `src/app.ts:39`.
- `GET /api/prices?limit=100`
  - Читает цены из БД, лимит по умолчанию `100`.
  - Реализация: `src/app.ts:51`.

### Дисциплины
- `POST /api/disciplines/save`
  - Извлекает группы дисциплин из матрицы и сохраняет в БД.
  - Ответ: `{ inserted, total, disciplines }`.
  - Реализация: `src/app.ts:63`.
- `GET /api/disciplines`
  - Возвращает сохранённые дисциплины.
  - Реализация: `src/app.ts:84`.

### Мэппинг по дисциплинам
- `POST /api/mapping/suggest`
  - Генерирует предложения сопоставления дисциплин с ценами (эвристика + опционально LLM), сохраняет в БД.
  - Ответ: `{ ok, count, disciplines }`.
  - Реализация: `src/app.ts:96`.
- `GET /api/mapping?discipline=АР&limit=50`
  - Возвращает сохранённые предложения для дисциплины (если не указана, все).
  - Реализация: `src/app.ts:111`.

### Мэппинг по элементам (колонки/строки матрицы)
- `POST /api/mapping/elements/suggest`
  - Генерирует предложения сопоставления элементов матрицы с ценами (эвристика + опционально LLM), сохраняет в БД.
  - Ответ: `{ ok, count, elements }`.
  - Реализация: `src/app.ts:123`.
- `GET /api/mapping/elements?grp=ОВ%20(Отоп.)&element=Радиаторы&axis=row&limit=50`
  - Читает сохранённые предложения; поддерживает фильтры `grp`, `element`, `axis`.
  - Реализация: `src/app.ts:135`.

### Отладка LLM
- `GET /api/debug/llm/providers`
  - Показывает доступные LLM‑провайдеры и наличие ключей.
  - Реализация: `src/app.ts:147`.
- `POST /api/debug/llm/ping`
  - Тестовый вызов выбранного провайдера; тело: `{ provider?, message?, temperature? }`.
  - Реализация: `src/app.ts:168`.
- `POST /api/debug/llm/rerank`
  - Переранжирование кандидатов для дисциплины; тело: `{ discipline, candidates:[{name,unit?,category?}] }`.
  - Реализация: `src/app.ts:194`.
- `GET /api/debug/logs/llm?limit=200`
  - Читает хвост логов LLM.
  - Реализация: `src/app.ts:207`.

### Отладка БД
- `GET /api/debug/db/counts`
  - Возвращает количества записей по основным таблицам: `disciplines`, `prices`, `mapping_suggestions`, `element_suggestions`.
  - Реализация: `src/app.ts:220`.

## Примеры

### Сохранение дисциплин
```
$ curl -X POST http://localhost:3001/api/disciplines/save
{"inserted":N,"total":M,"disciplines":[...]}
```

### Генерация предложений по дисциплинам
```
$ curl -X POST http://localhost:3001/api/mapping/suggest
{"ok":true,"count":K,"disciplines":["АР","ОВ","..."]}
```

### Чтение предложений по элементам (ось строки)
```
$ curl "http://localhost:3001/api/mapping/elements?grp=%D0%9E%D0%92%20(%D0%9E%D1%82%D0%BE%D0%BF.)&element=%D0%A0%D0%B0%D0%B4%D0%B8%D0%B0%D1%82%D0%BE%D1%80%D1%8B&axis=row&limit=10"
{"ok":true,"suggestions":[{ "grp":"ОВ (Отоп.)", "element":"Радиаторы", "price_name":"...", "price":123.45 }],"total":1}
```

## Полное заполнение таблиц
- Подготовка:
  - Запустите сервер: `npm run dev`
  - Включите отладку LLM при необходимости: в текущем сеансе `PowerShell` выполните `setx LLM_DEBUG 1` или временно `\$env:LLM_DEBUG='1'`.
- Заполнение цен:
  - `Invoke-RestMethod -Uri "http://localhost:3001/api/prices/scrape" -Method POST | ConvertTo-Json -Depth 4`
- Сохранение дисциплин:
  - `Invoke-RestMethod -Uri "http://localhost:3001/api/disciplines/save" -Method POST | ConvertTo-Json -Depth 4`
- Генерация сопоставления по дисциплинам:
  - `Invoke-RestMethod -Uri "http://localhost:3001/api/mapping/suggest" -Method POST | ConvertTo-Json -Depth 4`
- Генерация сопоставления по элементам матрицы:
  - `Invoke-RestMethod -Uri "http://localhost:3001/api/mapping/elements/suggest" -Method POST | ConvertTo-Json -Depth 4`
- Проверка результата:
  - `Invoke-RestMethod -Uri "http://localhost:3001/api/debug/db/counts" -Method GET | ConvertTo-Json -Depth 3`
  - Чтение записей: `Invoke-RestMethod -Uri "http://localhost:3001/api/mapping/elements?limit=20" -Method GET | ConvertTo-Json -Depth 6`

### Избежание частых отказов LLM
- Переменные окружения для контроля частоты:
  - `LLM_REQUEST_DELAY_MS` — задержка перед каждым вызовом LLM в миллисекундах (например, `500`).
  - `LLM_MAX_RETRIES` — число повторов при ответах `429/5xx`.
- Пример установки на время текущей сессии:
  - `\$env:LLM_REQUEST_DELAY_MS='500' ; \$env:LLM_MAX_RETRIES='2'`
- Просмотр хвоста логов LLM:
  - `Invoke-RestMethod -Uri "http://localhost:3001/api/debug/logs/llm?limit=200" -Method GET | ConvertTo-Json -Depth 3`

## Применение в MVP
- Этап 1: наполнение БД базовыми стоимостями: `POST /api/prices/scrape` → `GET /api/prices`.
- Этап 1.1: переранжирование (при наличии ключей LLM): `POST /api/debug/llm/rerank`.
- Этап 2: конвертация матрицы в CMWC: `POST /api/mapping/suggest`, `POST /api/mapping/elements/suggest`, затем чтение через соответствующие `GET`.
- Этап 3: визуализация и отчёты — клиент читает `/api/matrix`, `/api/mapping`, `/api/mapping/elements` и строит тепловые карты/CSV.

## Тесты
- Запуск: `npm run test`.
- Тесты покрывают: матрицу, парсер цен, базовые операции БД, базовые API, поведение LLM без ключей.

## Примечания
- Эндпоинты рассчитаны на локальную разработку; CORS разрешает `http://localhost:*`.
- Скрейпер использует `undici` и `cheerio`; в проде рекомендуется кеш/ограничение запросов.
