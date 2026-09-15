# Home layout verification — 2026-09-15

## Reference and implementation

- Accepted reference: `C:/Users/user/.codex/generated_images/01a0a315-7df1-7113-8a29-65aa3f1912ec/exec-f0402728-cbbc-4a5c-ad54-5d6a89aabbff.png` (1488 × 1058).
- Implementation: local isolated QA server at `http://127.0.0.1:4317/`.
- Final desktop evidence: `C:/Users/user/OneDrive/ドキュメント/New project/task-revolution-review/home-desktop-final.png`.
- Mobile evidence: `C:/Users/user/OneDrive/ドキュメント/New project/task-revolution-review/home-mobile.png`.
- Desktop CSS viewport: 1488 × 1058; mobile: 390 × 844. Full-page screenshots include content beyond the viewport and exclude the scrollbar gutter. Source and implementation were emitted together for visual comparison.

## Visual iterations

1. Initial comparison found excess row height from persistent assignment controls and HELP controls. Moved these controls behind each task's detail button, retaining the task's full label and deadline in the main row.
2. Added compact handover summaries, a direct completion checkbox for the displayed pending item, visible sender → recipient and deadlines. Kept all individual items and existing editing controls in details.
3. Final comparison: three simultaneous columns, mint background, pink handovers, collapsed task categories and service-by-store table match the selected direction. No time-of-day tabs. Mobile stacks the columns without horizontal page overflow.

Intentional differences: real operational labels and categories are retained verbatim instead of the shortened examples in the mockup. The QA date has 26 active tasks rather than the reference's 24. Morning store checks, the extra AtInn link, gray-cell editing and existing task administration controls remain accessible. The resulting full page is taller than the illustrative reference. Handovers in screenshots are fictional QA records.

## Functional verification

- TypeScript check and Vite production build passed. Existing analytics-placeholder and large-bundle warnings remain.
- 47 tests passed across home layout, task router, monthly visibility and task safety suites.
- Expanded all categories: all 26 active tasks available, including 7 Omori tasks. Definitions contain 27 records; existing date/active rules determine today's visible set.
- Checked LINE and Raccoon independently; unchecked one LINE store. Local persisted payloads contained only `line_afternoon` and `raccoon`; morning LINE, POS and voicemail were unaffected.
- Completed and restored a task through the bottom completed list; total count stayed constant. Confirmed completed category collapses and assignment filter works.
- Set handover author and recipient to the same name; changed importance; reloaded and verified persistence.
- Local browser console: no errors after final reload.
- Source comparison against `dbb1604`: task definitions, scheduling/date filtering and autosave sections unchanged. No changes to the three protected pages, routes, authentication, server API or database migrations.
- Production data was not used for mutation tests. Local QA reads task definitions once and handles all test writes in memory; QA server and fixtures are ignored by Git.

## Final result

**passed** — no unresolved P0/P1/P2 visual or interaction issues identified in the tested scope.
