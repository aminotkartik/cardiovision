# CardioVision 3D · Six-page project brief

> Hackathon research prototype. Results remain pending until the licensed local dataset is actually audited and trained.

## Page 1 — Problem, goal and architecture

**Problem.** Tabular cardiovascular model outputs are difficult to interpret when separated from clinical context and anatomy. CardioVision 3D brings a transparent model-output workflow into one demonstrable interface: inspected clinical features → validated request → four independent model predictions → target-specific explanation → interactive schematic coronary anatomy → exportable analysis.

**Goal.** Build a reproducible educational prototype, not a diagnostic system. The UI distinguishes overall CAD from LAD/LCX/RCA output, shows actual backend status and measurements, and labels uncertainty and limitations.

**Architecture.** Next.js/React/JavaScript and Tailwind power a responsive workbench. React Three Fiber/Drei render an original procedural heart and arteries. Recharts display actual saved evaluation outputs. The Python 3.11 FastAPI/Pydantic service loads scikit-learn/joblib pipelines once on startup. Offline training creates model, schema, metadata, evaluation and leakage-audit artifacts. The browser talks through a relative `/backend` path; Next rewrites server-side to `BACKEND_URL`.

## Page 2 — Data provenance, schema and leakage

**Provenance.** Intended primary source: UCI Z-Alizadeh Sani CAD dataset, DOI 10.24432/C5Q31T, CC BY 4.0. The repository includes no patient table. A compatible extension with documented CAD/Cath plus LAD, LCX and RCA labels is required for all four target models. Verify its provenance, label definitions, license and consent/privacy terms before use.

**Schema.** Audit/training read local CSV/XLSX headers, normalize whitespace conservatively, reject normalized collisions, infer field type and display only actual columns. Missingness, duplicates and non-finite entries are audited. Unknown inputs remain null; training-fold imputers handle missing values. Unit labels are limited to documented fields. Cohort-observed ranges are not clinical reference intervals.

**Leakage.** Whitespace/case/punctuation-normalized Cath, LAD, LCX and RCA are excluded from every predictor matrix. CAD is excluded when present as a direct Cath/outcome alias; all selected target columns are also excluded. A printed and saved per-target audit contains the exact input field list and verifies the forbidden set is absent. The target never enters preprocessing, tuning or attribution.

## Page 3 — Training and evaluation

**Training.** Four separate binary pipelines compare scaled logistic regression, random forest and gradient boosting. Numeric median imputation/scaling and categorical most-frequent imputation/one-hot encoding remain inside sklearn pipelines. Class weights are applied within estimators where supported; no pre-split oversampling or feature selection is used. Deterministic seeds are saved.

**Evaluation strategy.** Each target uses a stratified 80/20 holdout when class counts permit. Highest mean ROC-AUC from repeated stratified CV on the training partition chooses the family. The held-out threshold is predeclared as 0.50. Accuracy, precision, recall, F1, ROC-AUC when both classes exist, confusion matrix, class counts, sample count, ROC/PR curves and CV variability are serialized to JSON. One-class metrics are explicitly unavailable.

**Calibration and current results.** No calibration or independent clinical validation is claimed. Probabilities are labeled uncalibrated model scores. **Pending:** no dataset was supplied in the repository; no real training or evaluation has run. The synthetic fixtures used by automated tests are not application results and are excluded from this brief's performance claims.

## Page 4 — Explainable AI

SHAP is not a required runtime dependency. Local explanations use a genuine model-specific single-feature perturbation fallback: replace one submitted field with its training-partition median/mode, hold all other fields fixed and recompute the selected classifier's positive score. The resulting change is approximate and non-additive. Missing values/baselines can yield unavailable attribution. Global permutation importance is computed on the held-out partition where supported.

The interface distinguishes target model, local contribution, global importance, supplied value, training baseline and score direction. Attribution is not causal evidence. It cannot identify plaque, lesion geometry or biological mechanisms. Explanation values from one vessel model are never presented as those of another target.

## Page 5 — 3D visualization and interaction

The procedural heart silhouette, chamber cues, outflow curves and selectable LAD/LCX/RCA paths are original low-poly Three.js geometry; no external mesh is downloaded. The model is explicitly schematic, not a patient-specific segmentation. Orbit/pan/zoom/front/reset controls, keyboard-accessible vessel buttons, selected-output panel and score legend update from the same backend response.

Teal/amber/coral score colors use configurable display boundaries (defaults 0.34/0.67). They are not clinical risk classes. Probabilities change material color only; arteries do not physically narrow and no feature is mapped into a lesion location. Reduced pixel density and simple geometry support ordinary laptops; WebGL fallback leaves other screens functional.

## Page 6 — Setup, reproducibility and safety

**Setup.** Install backend dependencies, place the licensed table locally, run `training.audit_dataset`, then `training.train_models`; start FastAPI and Next.js per README. `CARDIOVISION_ARTIFACT_DIR`, `BACKEND_URL`, `CORS_ORIGINS`, and optional `NEXT_PUBLIC_API_BASE_URL` are documented. Model files and datasets are ignored by Git. Vercel can host Next.js; a Python container/PaaS can host FastAPI and mount trusted artifacts.

**Limitations.** Small/site-specific cohort; potential class imbalance; one holdout and CV may be unstable; no calibration, external validation, imaging/lesion annotations, regulatory review or clinical utility evidence. Models may disagree. Do not use outputs for diagnosis or treatment.

**Safety.** “EDUCATIONAL / DECISION-SUPPORT PROTOTYPE — Predictions are generated by machine-learning models and are not a diagnosis. They must not replace professional clinical assessment, ECG or imaging interpretation, coronary angiography, or other appropriate medical evaluation. These outputs are not validated for clinical decision-making.” No third-party service receives patient inputs. Avoid identifiers and real patient data in public demos; obtain appropriate consent/oversight and security review before any research or deployment use.
