# IELTS Practice and English Hub responsive navigation

Both headers now use a 44px burger/close control with an explicit accessible name and associated navigation panel. The existing 760px breakpoint and routes are preserved. Closed mobile links stay outside the accessibility and keyboard trees; desktop links remain visible.

Escape closes the menu and restores focus. Moving focus out of the header or clicking elsewhere closes it. Changing between phone and desktop layouts resets the disclosure and moves focus to a visible control when CSS hides the previously focused link. The implementation remembers header focus because browsers can move focus to the page body before delivering the breakpoint event. Clicking the current English Hub route also closes the menu and restores focus.

Local production-format builds passed for both affected apps. A real Chromium browser passed 23 checks across 320, 390, 760, 761, 980 and 1440px: touch targets, controlled panels, keyboard entry, Escape, outside click, focus departure, resize recovery, current-route navigation and no page/header overflow. Six scoped WCAG 2.1 A/AA checks of closed/open mobile and desktop headers found no violations. The 390px and 1440px screenshots were visually inspected. External fonts and APIs were blocked or replaced with local fixtures; these checks cover the public navigation and do not qualify signed-in learning or payment workflows.

This release changes only two frontend headers/styles. It requires no schema, function, worker, secret or payment activation. Baseline: f8b7c5d1a6f6806b59920b9de00570dbb372ea8e. Publish only after the exact reviewed-head CI passes, through a protected PR and tracked Pages deployment. Verify the published menus afterwards. Roll back through a tracked revert PR or the Pages dashboard.

The independently merged payment backend remains unactivated; this navigation release does not depend on its new transaction commands.
