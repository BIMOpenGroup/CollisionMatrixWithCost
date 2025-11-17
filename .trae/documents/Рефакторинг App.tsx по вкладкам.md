## Цель
- Разделить `src/App.tsx` на независимые компоненты по существующим вкладкам: `Матрица`, `Матрица со стоимостью`, `Элементы`, `Дисциплины`, `LLM`, `Журнал`.
- Сохранить текущий UI, поведение и API‑взаимодействия.

## Текущее состояние
- Переключение вкладок локальным состоянием `tab` (строки 368–375 в `src/App.tsx`).
- Разделы для вкладок находятся в одном файле:
  - `Матрица`: строки 376–512
  - `Матрица со стоимостью`: строки 514–879
  - `Элементы`: строки 881–889
  - `Дисциплины`: строки 890–951
  - `LLM`: строки 952–981
  - `Журнал`: строки 982–1031
- Блок задач/логов над вкладками: строки 334–367.
- Тип `MatrixResponse` импортируется из отсутствующего файла `./data/loadMatrix` (строка 3).

## Новая структура файлов
- `src/tabs/MatrixTab.tsx` — матрица исходных значений и панель ранжирования по элементу.
- `src/tabs/CostMatrixTab.tsx` — матрица со стоимостью, панель ячейки, сценарии, принятые позиции.
- `src/tabs/ElementsTab.tsx` — генерация предложений по элементам.
- `src/tabs/DisciplinesTab.tsx` — список дисциплин, предложения, принятие/отклонение.
- `src/tabs/LlmTab.tsx` — провайдеры и пинг.
- `src/tabs/EventsTab.tsx` — журнал событий.
- `src/components/TasksBar.tsx` — панель последней задачи и логи.
- `src/utils/matrix.ts` — `valueColor`, `cellCategory`.
- `src/data/loadMatrix.ts` — восстановить лоадер и тип `MatrixResponse` (источник: `assets/baked-matrix.json` или API).

## Распределение состояния и пропсов
- Останется в `App.tsx`:
  - `data: MatrixResponse | null`, `tab`, поллинг задач (`lastTask`, `activeLogs`).
- Перейдёт в компоненты вкладок:
  - `MatrixTab`: `selected`, `suggestions`, `loadingSug`, `elementStatuses`, `onSaveDisciplines`.
  - `CostMatrixTab`: `cellSummary`, `cellSummaryUnits`, `cellSummaryHazard`, `cellStatuses`, `cellPanel`, `cellWorkType`, `cellSug`, `cellItems`, `calcItems`, `collisionInfo`, `scenariosUi`, `editMode`, `addSel`.
  - `ElementsTab`: `genMsg`, `onGenerateElementSuggestions`.
  - `DisciplinesTab`: `disciplines`, `selectedDiscipline`, `discSuggestions`, `loadingDisc`, `onGenerateDisciplineSuggestions`.
  - `LlmTab`: `providers`, `llmPing`, `llmPingMsg`.
  - `EventsTab`: `events`, `loadingEvents`.

## Контракты компонентов
- `MatrixTab` props: `data`, `elementStatuses`, `onSaveDisciplines`.
- `CostMatrixTab` props: `data`.
- `ElementsTab` props: `genMsg`, `onGenerateElementSuggestions`.
- `DisciplinesTab` props: `disciplines`, `genMsg`, `onGenerateDisciplineSuggestions`.
- `LlmTab` props: нет, внутренняя загрузка провайдеров и пинг.
- `EventsTab` props: нет, внутренняя загрузка событий.
- `TasksBar` props: `lastTask`, `activeLogs`, `onShowLogs()`, `onStop()`.

## Перенос логики (по разделам файла)
- Вырезать JSX/эффекты каждого раздела и переместить в соответствующий компонент, сохранив оригинальные API‑вызовы и CSS‑классы из `App.css`.
- Вынести `valueColor` и `cellCategory` в `src/utils/matrix.ts`, переиспользовать в `MatrixTab`/`CostMatrixTab`.
- Сегменты `colSegments`/`rowSegments` оставить вычисляться в компоненте, где используется (по `data`).

## Обновление `App.tsx`
- Оставить шапку, таб‑бар и рендер компонентов по `tab`.
- Заменить большие блоки JSX на рендер отдельных компонентов:
  - `tab==='matrix'` → `<MatrixTab />`
  - `tab==='cost'` → `<CostMatrixTab />`
  - и т.д.
- Панель задач/логов вынести в `<TasksBar />` над вкладками.

## Восстановление загрузчика матрицы
- Создать `src/data/loadMatrix.ts` с экспортом `loadMatrixAuto()` и типа `MatrixResponse`.
- Реализация: если доступен API — грузить с сервера; иначе — читать `assets/baked-matrix.json`.

## Шаги выполнения
1. Добавить каталоги `src/tabs`, `src/components`, `src/utils`, `src/data` и соответствующие файлы.
2. Перенести код из `App.tsx` по вкладкам, настроить пропсы/состояние.
3. Вынести утилиты (`valueColor`, `cellCategory`).
4. Реализовать `data/loadMatrix.ts` для текущего импорта.
5. Упростить `App.tsx` до оркестратора.
6. Запустить локально фронтенд, проверить все вкладки.
7. При наличии тестов — запустить `npm run test:ci --silent`.

## Критерии приёмки
- Визуально и функционально UI идентичен текущему.
- Все API‑операции на вкладках работают как прежде.
- Код разделён и читаем: каждый компонент ≤300–400 строк.
- Импорт `loadMatrixAuto` и `MatrixResponse` корректен.

Готов выполнить рефакторинг согласно плану после подтверждения.