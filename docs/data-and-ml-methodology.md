# Data and ML methodology

## Dataset and schema

The expected starting point is the UCI Z-Alizadeh Sani dataset (DOI 10.24432/C5Q31T, CC BY 4.0) or a documented extension containing CAD/Cath and LAD, LCX, RCA labels. The cohort is small (about 303 records). No dataset is included here. The training/audit commands require a local CSV or Excel workbook and inspect its real headers before the interface schema is created.

Header normalization trims and collapses whitespace but preserves punctuation and spelling. A comparison-only key removes case, whitespace and punctuation to identify forbidden columns and target aliases. Normalized collisions are rejected. The audit reports record count, exact columns, per-column missingness, duplicate rows and non-finite numeric values. Infinite values are recorded and converted to missing; no arbitrary value is substituted in the UI.

Feature groups and units are attached only to fields actually found. Numeric and categorical encodings are inferred from observed data plus a small, documented list of source-dictionary binary/coded features. Dataset-observed ranges are displayed as cohort context, never as clinical reference limits. Unobserved values remain `null`; fitted imputers handle missing inputs.

## Targets and leakage safeguards

Targets are four independent binary models: overall CAD (prefer a documented `CAD` target, otherwise `Cath`) and LAD, LCX and RCA. Positive labels may be inferred from unambiguous semantic text labels (for example `CAD`, `Yes`, `true`, `stenosis`). Numeric codes such as 0/1 are never assumed: training stops until an explicit CLI positive-label mapping is supplied after checking the data dictionary. The selected positive and negative raw class labels are saved and the pipeline's probability for encoded class `1` is used.

Before making any model feature matrix, normalized `LAD`, `LCX`, `RCA`, and `Cath` are removed for **every** target. A `CAD` column is also removed when present because it is a documented direct alias for the overall outcome in some extensions. Every target source column is excluded from all feature matrices. A saved and printed per-target audit records the exact final input columns and verifies no forbidden predictors remain. No target is passed to imputation, scaling, encoding, model selection, or attribution.

## Training and evaluation

The deterministic split is stratified 80/20 per target where class counts permit. Logistic regression, random forest and gradient boosting are compared using repeated stratified CV on the training partition only. Selection uses the highest mean CV ROC-AUC; stable model-family order resolves ties. Preprocessing lives inside each scikit-learn pipeline: median imputation and scaling for numeric variables, most-frequent imputation and one-hot encoding for categories. All transformations are fit inside CV folds. Logistic regression and random forest use class weights; there is no pre-split oversampling or feature selection.

The held-out test threshold is fixed at 0.50 before evaluation, not tuned on the test labels. The trainer saves accuracy, precision, recall, F1, ROC-AUC when both classes exist, a fixed-label confusion matrix, test and train class distributions, sample counts, ROC and precision–recall points where meaningful, CV means/standard deviations, selected family, versions, threshold, class mappings, feature schema and excluded-column audit. Nonfinite metrics become unavailable rather than being represented as a score. A one-class evaluation omits ROC-AUC and curves.

Permutation importance is measured against the held-out test partition and is descriptive, not causal. The report calls probability outputs **uncalibrated model scores**; there is no calibration claim, threshold optimization, external validation, confidence interval, clinical validation or general-population claim. Because the cohort is small and site-specific, estimates may be unstable and should not be used for clinical decisions.

## Current execution status

No dataset was present in the repository at implementation time. Consequently, no real training run has occurred, no model performance figures are available, and the model readiness endpoint correctly reports unavailable. The test suite trains on isolated synthetic test fixtures only; those results are not application artifacts and are not reported as clinical performance.
