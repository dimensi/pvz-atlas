export default function AddPage() {
  return (
    <div className="page-stack">
      <section>
        <h2 className="page-title">Добавить ПВЗ</h2>
        <p className="lead">
          Новая точка сначала сохранится локально, а затем попадет в очередь
          синхронизации.
        </p>
      </section>

      <form className="card form">
        <div className="field">
          <label htmlFor="brand">Бренд</label>
          <input id="brand" name="brand" placeholder="Ozon, WB, Яндекс" />
        </div>
        <div className="field">
          <label htmlFor="city">Город</label>
          <input id="city" name="city" placeholder="Город" />
        </div>
        <div className="field">
          <label htmlFor="address">Адрес</label>
          <input id="address" name="address" placeholder="Улица и дом" />
        </div>
        <div className="field">
          <label htmlFor="comment">Комментарий</label>
          <textarea id="comment" name="comment" placeholder="Приватная заметка" />
        </div>
        <div className="action-row">
          <button className="button secondary" type="button">
            Геокодировать
          </button>
          <button className="button" type="button">
            Сохранить локально
          </button>
        </div>
      </form>
    </div>
  );
}
