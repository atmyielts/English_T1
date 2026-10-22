import { useEffect, useState } from "react";
import {
  type RecordingSelection,
  referenceKey,
} from "./RecordingCitationPicker";
export function useRecordingReferences(canReview: boolean) {
  const [recordingSelections, setRecordingSelections] = useState<
      RecordingSelection[]
    >([]),
    [recordingProblem, setRecordingProblem] = useState("");
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
      setRecordingProblem(
        "At most 25 recording intervals can be prepared. Remove an interval before adding another.",
      );
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
