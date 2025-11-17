export default function ElementsTab({ genMsg, onGenerate }: { genMsg: string; onGenerate: () => Promise<void> | void }) {
  return (
    <div className="panel">
      <div className="actions">
        <button title="Сгенерировать предложения цен по всем элементам" onClick={onGenerate}>Сгенерировать предложения (элементы)</button>
        <span className="save-msg">{genMsg}</span>
      </div>
      <div className="sub">Выберите строку в матрице, чтобы загрузить ранжирование прайса по элементу</div>
    </div>
  )
}

