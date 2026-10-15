# LM Eval Result Diff validation — 2026-10-15

23 Node test groups passed, including parsing limits, metric/filter identity, typed missing values, metadata states, exports and injection handling. The rename from EvalDiff retained JSON/CSV comparison behavior on all three synthetic demo pairs after fixing timestamps.

Actual Microsoft Edge checks on a Mac used localhost: demo comparison and baseline switching; filters and condition details; file chooser import; six files; malformed, non-results and oversized input rejection; unknown metadata; literal hostile text; CSV formula-prefix protection; actual HTML/CSV downloads; script-free standalone report; 390px viewport without page-level overflow. Offline simulation in the loaded tab allowed local import/export with no HTTP(S) requests. Exported CSV contained all rows despite filtering.

The final name and unofficial-product notice were checked in the app and downloaded report. The included `lm-eval-result-diff-*.jpg` screenshots and reports use original synthetic data, not real model scores. Screenshots precede the public-release badge wording change from PRIVATE to OFFLINE PROTOTYPE. The source comparison logic is unchanged.

Not tested: direct `file:` double-click, physical phones, physical network disconnection, Safari/Firefox, Excel/Numbers formula execution, all historical harness versions, real model results or large browser stress workloads. No significance test, confidence interval or global winner is produced.
