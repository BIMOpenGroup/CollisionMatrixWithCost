## Цели
- Настроить минимальный, быстрый тестовый контур для бэкенда без внешних зависимостей.
- Покрыть ключевые модули: парсинг CSV матрицы, парсинг HTML цен, базовые операции БД, базовые API-эндпоинты.
- Обеспечить воспроизводимость: тесты не трогают рабочую БД, не ходят в сеть.

## Выбор инструментария
- Тест-раннер: Vitest (лёгкий, быстрый, первый выбор для TypeScript).
- Тестирование HTTP: Supertest (интеграционные тесты Express без запуска реального сервера).
- Моки сети: встроенные средства Vitest (`vi.mock`) для замены `undici.fetch`.

## Небольшие изменения коду (для тестируемости)
- `db.ts`: добавить поддержку `process.env.SQLITE_DB_PATH`; при `':memory:'` — использовать in‑memory БД.
- `index.ts`: вынести создание `app` в `createApp()` и экспортировать его; запуск слушателя перенести в отдельную ветку `if (require.main === module)` или в `server.ts`. Это позволит тестам импортировать `app` без старта сервера.

## Структура тестов
- Папка `backend/tests` с фикстурами и тестами.
- Скрипт в `backend/package.json`: `"test": "vitest"`.

## Набор тестов (первая итерация)
- `tests/matrix.test.ts`
  - Загружает маленький CSV‑фикстуру, проверяет `loadMatrixFromCsv` и `extractDisciplineGroups` на корректные колонки/строки/грид.
- `tests/scrapeGarant.test.ts`
  - Мок `undici.fetch`, подсовывает HTML с одной таблицей; проверяет извлечение `[PriceRow]`, нормализацию цены и дедупликацию.
- `tests/db.test.ts`
  - Устанавливает `process.env.SQLITE_DB_PATH=':memory:'` до импорта `db.ts`.
  - Проверяет `initDB`, `insertPrice`/`getPrices`, `bulkInsertMappingSuggestions`/`getMappingSuggestions`, `bulkInsertElementSuggestions`/`getElementSuggestions`.
- `tests/llm.test.ts`
  - Без API‑ключей: проверяет, что `llmRerank(...)` возвращает `null` и не падает.
- `tests/api.test.ts`
  - Импортирует `createApp()`; инициализирует БД `:memory:`; прогоняет Supertest против `/api/matrix`, `/api/disciplines/save`, `/api/disciplines`, `/api/debug/db/counts`.
  - Для `/api/prices` вставляет несколько цен напрямую через `db` и проверяет выдачу.

## Фикстуры
- `tests/fixtures/matrix.csv`: минимальный CSV (2 строки заголовков + 2–3 строки данных) с понятными группами/лейблами.
- `tests/fixtures/garant.html`: HTML‑страница с одной таблицей и заголовком, имитирующая структуру источника.

## Запуск
- Команды: `cd backend` → `npm i` (добавит Vitest/Supertest) → `npm run test`.
- Тесты быстрые, без сети и без записи в рабочую БД.

## Критерии готовности
- Все тесты проходят на чистом окружении Windows.
- Запуск `npm run dev` не изменяется (сервер работает как ранее).
- Тесты детерминированы: нет обращений к внешним ресурсам и состоянию прод‑БД.

## Дальше
- По мере реализации Шага 2 добавить тесты для `/api/mapping/suggest` и `/api/mapping/elements/suggest` с контролируемыми данными.
- Включить smoke‑тест для `/api/prices/scrape` с полным мок‑HTML нескольких таблиц, покрывающим краевые случаи (отсутствие `thead`, разный порядок столбцов).