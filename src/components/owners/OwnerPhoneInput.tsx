"use client";

import { IMaskInput } from "react-imask";
import { cn } from "@/lib/utils";

interface OwnerPhoneInputProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}

export function OwnerPhoneInput({ id, onValueChange, value }: OwnerPhoneInputProps) {
  return (
    <IMaskInput
      id={id}
      data-slot="input"
      inputMode="tel"
      mask="+{7} (000) 000-00-00"
      placeholder="+7 (999) 123-45-67"
      prepare={(appended, masked) => {
        // Обрабатываем только самое начало ввода (когда поле пустое)
        if (masked.value === "") {
          // Если ввод (или вставка) начинается с 8, отрезаем её
          if (appended.startsWith("8")) return appended.slice(1);
        }
        return appended;
      }}
      value={value}
      unmask={false}
      onAccept={(nextValue) => onValueChange(String(nextValue))}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      )}
    />
  );
}
