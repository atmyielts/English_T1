# Academy inbox and shared-classroom response ownership

Release scope: frontend inbox conversations and the shared classroom landing hub. This change does not alter backend authorization, payment configuration, schemas or customer records.

## Customer behavior

- Changing inbox contacts immediately clears the previous thread and its private draft. Conversation reads can overlap; only the current actor, Academy, thread and latest request may publish a response or finish its loading state.
- An inbox send locks its selected recipient. A failed send preserves the draft; successful or failed completions from an obsolete actor or Academy cannot change the new workspace. Reads use a separate loading state and show an announced loading message.
- Initial, manual and automatic classroom reads share the same request-ownership checks. Classroom data and drafts reset when actor, Academy or classroom changes. Returning to the same classroom starts a new generation, so an earlier send cannot erase its new draft.
- Discussion sends, resource saves/uploads, removals and completion changes keep their captured destination. Their later refresh, feedback, form resets and busy-state changes apply only while that visit remains current. Background reads cannot supersede a foreground action.
- Failed classroom opening shows an alert and leaves refresh available. Discussion submission requires a loaded room; refresh can recover when there is no room yet.

## Verification before merge

Five browser regressions reproduce failures against the previously published Academy frontend with synthetic sessions and all real backend calls mocked or blocked:

1. An obsolete conversation read retains the first contact's private contents.
2. A delayed classroom refresh replaces the next classroom.
3. A pending inbox send leaves another recipient selectable.
4. A delayed classroom send erases a draft after leaving and returning.
5. A failed classroom opening has no visible error alert.

All five pass locally after the fix. The full Academy route suite passes 80 scenarios; the optional startup benchmark is explicitly skipped. Academy TypeScript/production build, lint, localization coverage, production-readiness verifier and whitespace checks pass.

## Production qualification

Required after normal PR merge: all frontend deployments at the exact merge commit, the five regressions against the newly published frontend, and the automatic credentialed Academy live smoke workflow. Published regression fixtures establish frontend behavior; they do not establish real server authorization or representative signed-in loading time. The credentialed smoke workflow qualifies separate backend reads.

Rollback reference before this release: `c3390c0469260d23a85aeff162d73f07f5a2fee2`. Use the prior Cloudflare Pages deployment for the Academy project if release qualification fails. No manual backend release belongs to this change.

Other root-office mutation handlers and representative authenticated performance remain separate audit work; this release does not certify every Academy asynchronous flow.
