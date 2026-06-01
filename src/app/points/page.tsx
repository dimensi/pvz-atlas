const filters = ["Без владельца", "Рядом", "Бренд", "Статус"];

export default function PointsPage() {
  return (
    <div className="page-stack">
      <section>
        <h2 className="page-title">Пункты выдачи</h2>
        <p className="lead">
          Точки без владельца всегда сверху, чтобы назначить ответственного во
          время обхода.
        </p>
      </section>

      <div className="toolbar" aria-label="Point filters">
        {filters.map((filter) => (
          <button className="filter-chip" key={filter} type="button">
            {filter}
          </button>
        ))}
      </div>

      <section className="section" aria-labelledby="no-owner-heading">
        <h3 className="section-title" id="no-owner-heading">
          <span>Без владельца</span>
          <span>0</span>
        </h3>
        <article className="card">
          <h3>Пока нет ПВЗ без владельца</h3>
          <p>
            Импортированные или добавленные вручную точки без владельца
            появятся здесь первыми.
          </p>
          <div className="action-row">
            <a className="button" href="/add">
              Добавить ПВЗ
            </a>
            <a className="button secondary" href="/sync">
              Синхронизировать
            </a>
          </div>
        </article>
      </section>

      <section className="section" aria-labelledby="owners-heading">
        <h3 className="section-title" id="owners-heading">
          <span>Владельцы</span>
          <span>0</span>
        </h3>
        <article className="card">
          <h3>Групп владельцев пока нет</h3>
          <p>
            Группы владельцев появятся из локальных данных IndexedDB после
            первого импорта или ручного назначения.
          </p>
        </article>
      </section>
    </div>
  );
}
