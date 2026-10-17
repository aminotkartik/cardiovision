# Demonstration script (7–8 minutes)

**Recording note:** This is a proposed recording sequence. No demonstration video has been recorded or uploaded. Use only synthetic data in a public recording.

## Before recording (operator checklist)

1. Obtain the UCI source file or a license-verified extension locally; inspect its data dictionary and confirm that CAD/Cath, LAD, LCX and RCA labels have correct positive-class meanings.
2. Run the audit and four-target training commands in the README. Confirm `GET /health` reports all four models loaded, `/api/schema` contains the actual inspected fields and `/api/model-metrics` has executed metrics.
3. Start the API and frontend. In the browser, confirm the relative `/backend` proxy works. Check that the header readiness indicator matches `/health` and the demo profile is clearly synthetic.
4. Do not display source patient rows, identifiers or raw files. Verify that prediction outputs and explanations came from this API run; do not narrate test-fixture metrics as clinical results.

## Recording sequence and suggested narration

### 0:00–0:45 · Overview and safety

Show the overview, persistent prototype badge, model readiness, schema availability, and safety note. Say: “CardioVision 3D is an educational research prototype. Its outputs are uncalibrated scores, not a diagnosis; they cannot replace professional clinical assessment, ECG or imaging interpretation, angiography, or other appropriate care. The heart is schematic.” Point out that no real performance values appear until training outputs exist.

### 0:45–1:30 · Load a synthetic profile

Select **Demonstration patient**. Confirm the banner says synthetic and that no ground-truth labels are supplied. Say: “This profile is generated from feature-wise medians and modes in the audited schema; it is not a person or a reference case.” If the schema/artifacts are not present, show the setup message honestly instead of entering invented fields.

### 1:30–2:40 · Review and validate inputs

Open Patient analysis. Walk through the sections generated from the actual dataset: demographics, clinical/vitals, lab values, ECG and echocardiography where those columns exist. Highlight one unit, an observed source-cohort range and an unknown field; explain that the range is descriptive, not a clinical cutoff, and unknowns remain null for pipeline imputation. Press **Validate patient** and show any field validation feedback.

### 2:40–3:35 · Real backend inference

Press **Analyze patient**. Show the loading state, then the returned prediction ID, model version, thresholds, uncalibrated-score label and backend warnings. Say: “These are four independent classifiers. Overall CAD is not averaged from vessel scores, and they may disagree.” If no models are loaded, show the 503 missing-artifact response and stop short of claiming inference.

### 3:35–5:00 · Explore the 3D model

Open Anatomy explorer. Rotate with drag, zoom with scroll/buttons, reset/front view, then click LAD, LCX and RCA in turn. For each, point to the selected vessel name, its model-specific probability and the matching color. Say: “Color follows this vessel's own API probability; the artery geometry is unchanged. This is not measured stenosis severity, plaque, or a lesion map.”

### 5:00–6:00 · Attribution and physiological context

Request a feature explanation for one target, then switch to another target. Inspect positive/negative single-feature perturbations and the observed measurement/baseline. Point out the method is approximate and non-additive, not causal. Expand the submitted-measurement panel to show the actual inputs and missing-value state; do not describe any attribution as a medical cause.

### 6:00–7:00 · Model evaluation and leakage audit

Open Model performance. Select CAD, LAD, LCX and RCA. Show only values loaded from the saved training evaluation, held-out test partition, fixed 0.50 threshold, repeated training-only CV variation and class counts. Scroll to the audit and name the exclusion of normalized Cath/LAD/LCX/RCA for every model and CAD alias when present. Say: “Small, site-specific cohort; these estimates are unstable and do not establish clinical validity or transportability.”

### 7:00–7:45 · Report and architecture

Open Reports and export JSON/PDF for the synthetic analysis. Show the synthetic status, target outputs, model versions, warnings and disclaimer. Briefly point to `backend/training`, `backend/app`, the Next same-origin proxy, and procedural `HeartScene.jsx`. Close with the dataset provenance, missing-data policy and clinical-safety limitation.

## Practical capture

Use a 1440×900 desktop viewport, zoom browser to 100%, keep cursor movements deliberate, and wait for the health and prediction responses before narrating them. Record the API and frontend terminal logs only if they contain no submitted values. Avoid asserting result values that were not generated in the recorded session.
