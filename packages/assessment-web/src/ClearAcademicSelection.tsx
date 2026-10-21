import React, { useEffect, useRef, useState } from "react";
import { useWebT } from "./i18n/useWebT.ts";
/** Confirmation is pinned to the reviewed selection, not any later device copy. */
export function ClearAcademicSelection(
  { selected, disabled, clear }: {
    selected: string;
    disabled: boolean;
    clear: () => void;
  },
) {
  const t = useWebT();
  const [reviewed, setReviewed] = useState(""),
    confirm = useRef<HTMLButtonElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    restore = useRef(false);
  useEffect(() => {
    setReviewed("");
  }, [selected]);
  useEffect(() => {
    if (reviewed === selected) confirm.current?.focus();
    else if (restore.current) {
      restore.current = false;
      trigger.current?.focus();
    }
  }, [reviewed, selected]);
  if (reviewed !== selected) {
    return (
      <button
        type="button"
        className="quiet"
        ref={trigger}
        disabled={disabled}
        onClick={() => setReviewed(selected)}
      >
        {t("clearSelection.clear")}
      </button>
    );
  }
  return (
    <fieldset disabled={disabled}>
      <legend>{t("clearSelection.legend")}</legend>
      <p>{t("clearSelection.explain")}</p>
      <button
        type="button"
        ref={confirm}
        onClick={() => {
          setReviewed("");
          clear();
        }}
      >
        {t("clearSelection.confirm")}
      </button>
      <button
        type="button"
        className="quiet"
        onClick={() => {
          restore.current = true;
          setReviewed("");
        }}
      >
        {t("clearSelection.keep")}
      </button>
    </fieldset>
  );
}
