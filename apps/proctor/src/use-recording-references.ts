import { useEffect, useState } from "react";
import {
  type RecordingSelection,
  referenceKey,
} from "./RecordingCitationPicker";
import type { ProctorKey } from "./i18n/index.ts";
export function useRecordingReferences(canReview: boolean) {
  const [recordingSelections, setRecordingSelections] = useState<
      RecordingSelection[]
    >([]),
    [recordingProblem, setRecordingProblem] = useState<ProctorKey | "">("");
  useEffect(() => {
    if (!canReview) {
      setRecordingSelections([]);
      setRecordingProblem("");
    }
  }, [canReview]);
  function prepareReference(value: RecordingSelection) {
    if (!canReview) return;
    setRecordingProblem("");
    if (
      recordingSelections.some((entry) =>
        referenceKey(entry.reference) === referenceKey(value.reference)
      )
    ) return;
    if (recordingSelections.length >= 25) {
      setRecordingProblem("prepared.limit");
      return;
    }
    setRecordingSelections((current) => [...current, value]);
  }
  return {
    recordingSelections,
    setRecordingSelections,
    recordingProblem,
    prepareReference,
  };
}
