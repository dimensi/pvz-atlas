export default function MapPage() {
  return (
    <div className="page-stack">
      <section>
        <h2 className="page-title">Карта</h2>
        <p className="lead">
          Сохраненные координаты будут показаны маркерами Яндекс Карт. Маршрут
          к ПВЗ открывается через deeplink в Яндекс Картах.
        </p>
      </section>

      <section className="map-placeholder" aria-label="Заглушка карты">
        <div>
          <h3>Интеграция с Яндекс Картами еще не подключена</h3>
          <p className="lead">
            Геокодирование останется на сервере, а координаты не будут
            пересчитываться при каждом рендере.
          </p>
        </div>
      </section>
    </div>
  );
}
