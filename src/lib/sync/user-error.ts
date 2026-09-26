import { ApiError } from "@/lib/api/client";

export function syncErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "sync_source_mismatch" || error.code === "sync_change_source_mismatch") {
      return "Таблица изменилась. Обновите данные, прежде чем продолжать.";
    }
    if (error.code === "sheets_not_configured") {
      return "Таблица сейчас недоступна. Данные на устройстве сохранены.";
    }
    return "Не удалось связаться с таблицей. Данные на устройстве сохранены.";
  }
  if (error instanceof TypeError) {
    return "Нет связи с сервером. Данные на устройстве сохранены.";
  }
  if (error instanceof Error && error.message.startsWith("Некоторые строки таблицы повреждены")) {
    return error.message;
  }
  return "Не удалось обновить данные. Данные на устройстве сохранены.";
}
