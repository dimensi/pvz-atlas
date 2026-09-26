"use client";

import { Info } from "lucide-react";
import { useSyncOverview } from "./SyncOverviewProvider";

function pointCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? "пунктов"
    : last === 1 ? "пункт"
      : last >= 2 && last <= 4 ? "пункта" : "пунктов";
  return `${count} ${word}`;
}

export function SyncReplacementNotice() {
  const { replacementNotice, heldCount, acknowledgeReplacement } = useSyncOverview();
  if (!replacementNotice) return null;

  return (
    <section className="sync-replacement-notice" role="status" aria-label="Данные обновлены">
      <Info size={20} aria-hidden="true" />
      <div>
        <strong>{replacementNotice.kind === "source-changed"
          ? "Подключена другая таблица" : "В таблице удалены записи"}</strong>
        <p>Данные на устройстве обновились: сейчас {pointCount(replacementNotice.afterPoints)},
          было {pointCount(replacementNotice.beforePoints)}.</p>
        {replacementNotice.removedOwners > 0 || replacementNotice.removedVisits > 0 ? (
          <p>Из таблицы убраны: владельцы — {replacementNotice.removedOwners},
            посещения — {replacementNotice.removedVisits}.</p>
        ) : null}
        {heldCount > 0 ? <p>Старые локальные правки сохранены в разделе «Данные и связь».</p> : null}
      </div>
      <button className="button secondary" type="button" onClick={() => void acknowledgeReplacement(replacementNotice.at)}>
        Понятно
      </button>
    </section>
  );
}
