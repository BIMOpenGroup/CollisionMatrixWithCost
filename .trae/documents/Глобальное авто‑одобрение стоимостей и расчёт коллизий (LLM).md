## Проблемы
- Кнопки «Синхронизировать ячейки»/«Обновить сводку» не дают обратной связи.
- Клик по ячейке не инициирует понятный процесс; пер‑ячейковый одобрительный сценарий не нужен.
- Требуется: одна кнопка авто‑одобрения стоимостей по элементам (LLM), статус‑бар фоновых задач, и расчёт коллизий (LLM) на матрице со стоимостью (пересечение строки и колонки).

## Backend: инфраструктура задач и логов
1) Таблица `tasks`
- Поля: `id, type, status (queued|running|done|error), progress (0..100), message, started_at, finished_at`.
- Логи: `task_logs(task_id, ts, level, message, data?)`.

2) Эндпоинты задач
- `POST /api/tasks/start` body `{type:'sync_cells'|'auto_approve_elements'|'build_cell_suggestions_all'|'compute_collisions_all'}` → возвращает `task_id`.
- `GET /api/tasks/:id` → статус/прогресс.
- `GET /api/tasks/:id/logs?limit=...` → хвост логов.
- `GET /api/tasks` → список последних задач.

3) Авто‑одобрение по элементам (вместо ячейки)
- Использовать `element_suggestions`: собрать предложения по каждому `{grp, element}`.
- LLM‑решение: новая функция `llmDecideElement(grp, element, candidates)` возвращает `[{id|price_id, action, quantity?, unit_price?}]`.
- Массовая задача `auto_approve_elements`: для каждого элемента отметить `accepted/rejected`; при `accepted` можно сохранять принятые позиции в отдельной таблице `element_items` (или оставить в `element_suggestions` со статусом `accepted`).

4) Расчёт коллизий и диапазона стоимости
- Задача `compute_collisions_all`: для каждой ячейки `(row×col)` собрать принятые стоимости по элементу строки и по элементу колонки.
- LLM‑оценка: новая функция `llmCollisionEstimate(context, rowItems[], colItems[])` → `[{scenario, unit:'м/м²/м³', price_min, price_max, rationale}]`.
- Сохранение результата: таблица `collision_costs(cell_id, unit, min, max, scenarios_json, created_at)`.

5) Статусы ячеек
- Сводка статусов предложений уже есть; добавим `collision_costs` чтение в `GET /api/cells/summary` (выводить диапазон из расчёта, если есть).

## Frontend: статус‑бар и кнопки
1) Статус‑бар фоновых задач
- Новый верхний блок показывает последнюю активную задачу: тип, прогресс, сообщение; кнопка «показать логи».
- Пуллинг `GET /api/tasks` и `GET /api/tasks/:id`.

2) Матрица (исходная)
- Одна кнопка «Авто‑одобрить стоимости (Элементы, LLM)» → `POST /api/tasks/start {type:'auto_approve_elements'}`.
- Параметры (позже): лимит кандидатов, порог score.

3) Матрица со стоимостью
- Кнопка «Запустить расчёт коллизий (LLM)» → `POST /api/tasks/start {type:'compute_collisions_all'}`.
- Ячейки:
  - Если есть `collision_costs` → отображать диапазон `min–max`.
  - Подсветка: `all_accepted` (зелёный), `all_rejected` (красный), `mixed` (без подсветки).
  - Карточка ячейки: список сценариев коллизий из LLM с пояснениями.

## LLM (единый источник)
- Все вызовы через `LLM_*` env.
- Новые промпты:
  - `llmDecideElement`: принять/отклонить предложения стоимости для элемента.
  - `llmCollisionEstimate`: оценка коллизий и диапазона стоимости для `row×col` с учётом принятых позиций.

## Верификация
- Запуск задач с логами; статус‑бар показывает прогресс.
- После `auto_approve_elements` — ячейки подсвечиваются по итоговым статусам.
- После `compute_collisions_all` — на «Матрице со стоимостью» виден рассчитанный диапазон.

## Поэтапно
1) Добавить таблицы/эндпоинты задач + логи; внедрить статус‑бар на фронте.
2) Реализовать `auto_approve_elements` + `llmDecideElement`.
3) Реализовать `compute_collisions_all` + `llmCollisionEstimate` и сохранение.
4) Обновить UI матриц: кнопки запуска, подсветка, показ диапазонов и сценариев.

Подтвердите план — сразу начну реализацию (с минимумом визуальных изменений вне описанного).