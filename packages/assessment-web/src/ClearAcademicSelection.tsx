import React, { useEffect, useRef, useState } from "react";
/** Confirmation is pinned to the reviewed selection, not any later device copy. */
export function ClearAcademicSelection(
  { selected, disabled, clear }: {
    selected: string;
    disabled: boolean;
    clear: () => void;
  },
) {
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
        Clear selected answer
      </button>
    );
  }
  return (
    <fieldset disabled={disabled}>
      <legend>Confirm clearing the selected answer</legend>
      <p>
        This question will have no selected answer. Your device copies, uploaded
        files and prior answer history are not deleted. You can select a sealed
        copy again only while this question remains open.
      </p>
      <button
        type="button"
        ref={confirm}
        onClick={() => {
          setReviewed("");
          clear();
        }}
      >
        Confirm clearing selected answer
      </button>
      <button
        type="button"
        className="quiet"
        onClick={() => {
          restore.current = true;
          setReviewed("");
        }}
      >
        Keep selected answer
      </button>
    </fieldset>
  );
}
