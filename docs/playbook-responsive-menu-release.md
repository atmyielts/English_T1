# Playbook responsive navigation

SAT and TOEFL Playbook headers previously kept their complete link bars visible on small screens. They now collapse navigation behind a 44px menu button at widths up to980px. Desktop retains the full link bar. The menu exposes its expanded state and controlled panel, supports Enter/Tab and Escape with focus restoration, and closes after navigation, outside pointer/focus movement, or a breakpoint change. Closed links leave the accessibility and keyboard trees.

This frontend-only release changes those two headers and their styles. It uses the existing routes and requires no backend, content, payment, secret or workflow deployment. Previous production baseline:151df74f62cf3dfc59febf0c4a6eaabd1858a792.

Verification: both app builds, production/release checks and eight real browser cases pass. Local browser APIs are synthetic and isolated; external fonts are deliberately blocked and the fallback rendering is inspected. Both menus fit320,390,768,1024 and1440px, with zero scoped header accessibility violations and no unhandled browser errors. Mobile and desktop screenshots were visually inspected. This evidence verifies menu behavior, not entitlement, payment or learning-content readiness.

Production sequence: exact reviewed-head full CI, normal PR merge, tracked Pages deployment, provider source confirmation and published public-page menu checks. Use tracked CI or the Pages dashboard for a frontend rollback. No manual backend follow-up.
