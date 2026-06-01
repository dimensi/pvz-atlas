const steps = [
  "Загрузить удаленные изменения",
  "Отправить локальные патчи",
  "Загрузить объединенное состояние"
];

export default function SyncPage() {
  return (
    <div className="page-stack">
      <section>
        <h2 className="page-title">Синхронизация</h2>
        <p className="lead">
          Синхронизация идет по схеме pull, push, pull, чтобы ручные правки в
          Google Sheets учитывались до и после отправки локальных патчей.
        </p>
      </section>

      <section className="card">
        <h3>Очередь</h3>
        <p>Локальных изменений в очереди нет.</p>
        <button className="button" type="button">
          Запустить синхронизацию
        </button>
      </section>

      <section className="section">
        <h3 className="section-title">Процесс</h3>
        {steps.map((step, index) => (
          <article className="card" key={step}>
            <h3>
              {index + 1}. {step}
            </h3>
            <p>Шаг-заглушка для MVP sync engine.</p>
          </article>
        ))}
      </section>
    </div>
  );
}
