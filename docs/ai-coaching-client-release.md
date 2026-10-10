# AI coaching draft and result recovery

Writing and Speaking now share one request lifecycle. Each normalized draft retains a request reference; duplicate clicks are blocked while the result is unresolved. Checking a saved result does not grade again. A pending reference survives a reload, while private essay/transcript text is kept only on the current page. The interface explains this before a reload can lose the draft.

Quota and history failures are explicit and retryable. The pages do not present a history outage as an empty history or an unrelated product purchase as an AI upgrade. Version 1 handlers keep new grading disabled with an update message. Version 2 availability and quota must be confirmed before submission.

Speaking reviews the transcript's ideas, vocabulary and grammar. Its screen and history do not display unsupported pronunciation, fluency or IELTS Speaking bands. Browser dictation appends final text, bounds duration/text length, preserves existing text on microphone denial and releases the microphone/timers on exit. Account changes clear personal drafts, tasks, history and feedback, cancel stale network requests and detach delayed dictation before it can restore old text.

Actual mobile screenshots revealed the floating Updates button obscuring save errors. These two focused routes now use the existing Updates suppression rule, as Peer Review and Marketplace already do. Updates elsewhere remain available.

Local validation passed: Platform build with synthetic public configuration; strict lint of the four changed screen/hook files; 18 real Chromium scenarios (seven Writing, eight Speaking and three account-change cases); overflow checks at 320/390/768/1024/1440px; Writing-page and Speaking-main scoped WCAG 2.1 A/AA checks with zero violations. Screenshots were visually inspected. Synthetic service, speech and auth fixtures do not prove real microphone support, provider quality or hosted customer journeys; external fonts were blocked in these local checks. Runtime dependency audit reports zero vulnerabilities. Broader Platform lint exposes existing issues outside these screens/hooks and is not claimed green.

Backend source dependency is PR 223, merged as `88dffd7bafef1d5e38c9dfe79ac8ff7be0cba74a`; its full CI and all 13 Pages deployments passed. Its three AI migrations and two Edge Functions are not yet activated. Financial activation remains separate.

Keep this client PR in draft until full exact-head CI passes and the AI schema, isolated function bundles, configuration and owned hosted checks are ready for the coordinated transition. The old functions are still version 1, so publishing this client alone temporarily disables feedback. Follow `docs/ai-coaching-boundary-release.md`; never include the nine pending payment migrations in an AI rollout. After publication, verify actual signed-in feedback, quota/replay, interrupted-save recovery, privacy on account changes and mobile layout.

Use a checked fix-forward or Pages rollback to the dependency commit if needed. An old-client rollback after version 2 function activation requires temporarily disabling provider dispatch. Do not restore the old unlimited scorer or general-purchase premium rule.
