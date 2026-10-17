# Local dataset placement

No clinical dataset is bundled with this repository. The API and form schema are generated only after a local dataset is inspected; the application deliberately does not guess or hardcode the source columns.

## Primary source

- **Z-Alizadeh Sani CAD dataset**, UCI Machine Learning Repository, DOI: [10.24432/C5Q31T](https://doi.org/10.24432/C5Q31T).
- UCI dataset page: <https://archive.ics.uci.edu/dataset/412/z+alizadeh+sani>.
- The repository page describes 303 records, clinical/demographic/ECG/lab/echo variables and labels CAD/Normal at a diameter narrowing threshold of 50%.
- UCI lists the dataset under **CC BY 4.0**; cite the authors and verify the license and attribution for any extension or separately sourced vessel labels.

Download the official dataset from UCI using your normal browser and place it in this directory. For all four targets, the supplied table must include the documented overall outcome and separate LAD, LCX and RCA labels. The base UCI file may not include every vessel label required by the prototype; use a documented extension with a compatible license, or explicitly map documented target columns using the training CLI. Do not infer vessel labels from other measurements.

Example local paths (not committed):

```text
data/z_alizadeh_sani_extension.csv
data/z_alizadeh_sani_extension.xlsx
```

Before model training, inspect the actual headers and class encodings:

```bash
cd backend
.venv/bin/python -m training.audit_dataset --data ../data/z_alizadeh_sani_extension.csv
```

The audit prints and saves the exact schema, missing-value counts, duplicate-record count, invalid non-finite values and leakage audit under `backend/artifacts/`. These outputs are local and ignored by Git. Do not put names, contact details, hospital IDs, or any other direct identifiers in this application.
