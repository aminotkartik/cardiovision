export function validateFeatures(schema, values) {
  const errors = {};
  const warnings = [];
  const fields = schema?.fields || [];
  if (!fields.length) {
    return { valid: false, errors: { _schema: 'No audited dataset schema is available yet.' }, warnings };
  }

  for (const field of fields) {
    const value = values?.[field.name];
    if (value === null || value === undefined || value === '') continue;
    if (field.type === 'numeric') {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(number)) {
        errors[field.name] = 'Enter a finite numeric value or leave this measurement unknown.';
        continue;
      }
      const range = field.observed_range;
      if (range && (number < range.min || number > range.max)) {
        warnings.push(`${field.label || field.name} is outside the source cohort observed range (${range.min}–${range.max}); this is not a clinical reference range.`);
      }
    } else if (field.options?.length) {
      const valid = field.options.some((option) => String(option).trim().toLowerCase() === String(value).trim().toLowerCase());
      if (!valid) errors[field.name] = 'Choose a category represented by the inspected dataset.';
    }
  }
  return { valid: Object.keys(errors).length === 0, errors, warnings };
}

export function coerceFeatures(schema, values) {
  const result = {};
  for (const field of schema?.fields || []) {
    const value = values?.[field.name];
    if (value === null || value === undefined || value === '') {
      result[field.name] = null;
    } else if (field.type === 'numeric') {
      result[field.name] = Number(value);
    } else {
      const option = field.options?.find((item) => String(item).trim().toLowerCase() === String(value).trim().toLowerCase());
      result[field.name] = option === undefined ? value : option;
    }
  }
  return result;
}
