# Visualization, explainability and safety

## Procedural anatomy

The scene is an original procedural Three.js/R3F illustration: beveled heart silhouette, soft chamber cues, aortic/pulmonary outflow curves and three selectable coronary paths. It requires no third-party mesh, external runtime download or attribution-bearing anatomical asset. The mesh is intentionally labeled **stylized / schematic** and is not a segmented anatomical model. A faint thorax silhouette is contextual only.

LAD, LCX and RCA remain separately named from their input curves through the server response and `vessels` mapping. Each line's material color reads that exact vessel probability from the API response. Teal/amber/coral boundaries (default 0.34 and 0.67; `frontend/lib/predictions.js`) are display settings only. They do not represent validated risk strata. Lines never shrink, narrow, or draw a lesion when scores increase. If no prediction exists or WebGL is unavailable, the scene stays neutral or displays a fallback while the rest of the UI continues to work.

Orbit, pan, zoom, front and reset camera controls, accessible external vessel-selection buttons, click-to-select paths and selected-vessel detail panels are synchronized. Lower device pixel ratio, simple geometry, no post-processing and a low-power renderer limit GPU load. Reduced-motion preferences are respected by CSS transitions.

## Explainability

SHAP is not installed as a required dependency; its compatibility and cost are not assumed. The prototype uses a genuine, model-specific **local single-feature baseline perturbation**: for each supplied feature, replace that feature with the selected model's training-partition median/mode, keep other submitted values fixed, and recompute positive-class score. The difference is approximate, non-additive and sensitive to correlated features. Missing input or missing baseline yields unavailable attribution, not a made-up value. Global importance is permutation importance computed on held-out data when that metric is supported.

The UI separates local from global output, displays the observed input, training baseline, score direction, model target, and caveats. Feature attribution is not causal evidence; it neither identifies lesion location nor establishes biological mechanism. An explanation from one target model is never labeled as explaining another.

## Clinical safety

Persistent and result-adjacent language identifies this as an educational/decision-support prototype, not a diagnosis or treatment tool. Probabilities are uncalibrated model scores from a small source cohort. The 3D scene is not patient-specific, the dataset has no pixel-level or 3D lesion annotations, and no clinical measurement is mapped onto anatomical coordinates. The product does not claim regulatory status or clinical validation and does not provide treatment recommendations.

No external service receives feature inputs. Reports are generated locally and should not include direct identifiers. Do not use identifiable real patient records in a hackathon demo. Before any clinical research use, establish legal basis and consent, IRB/ethics oversight as applicable, data minimization, access control, retention, security, external validation, calibration, prospective evaluation and regulatory review.
