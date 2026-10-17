import { describe, expect, it } from 'vitest';
import { coerceFeatures, validateFeatures } from './validation';
import { vesselOutput, vesselScores } from './predictions';

const schema = {
  fields: [
    { name: 'Age', type: 'numeric', observed_range: { min: 30, max: 86 }, options: [] },
    { name: 'Sex', type: 'categorical', options: ['Male', 'Female'] },
  ],
};

describe('patient schema helpers', () => {
  it('accepts known measurements and missing values without treating missing as zero', () => {
    const result = validateFeatures(schema, { Age: 0, Sex: null });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(coerceFeatures(schema, { Age: '', Sex: null })).toEqual({ Age: null, Sex: null });
  });

  it('returns field-level errors for malformed values and invalid categories', () => {
    const result = validateFeatures(schema, { Age: 'unknown', Sex: 'Other' });
    expect(result.valid).toBe(false);
    expect(result.errors.Age).toBeTruthy();
    expect(result.errors.Sex).toBeTruthy();
  });

  it('marks observed cohort range separately from clinical reference ranges', () => {
    const result = validateFeatures(schema, { Age: 120, Sex: 'Male' });
    expect(result.valid).toBe(true);
    expect(result.warnings[0]).toContain('not a clinical reference range');
  });
});

describe('vessel output mapping', () => {
  it('keeps returned LAD, LCX and RCA probabilities attached to the matching names', () => {
    const prediction = { vessels: {
      LAD: { positive_probability: 0.17 },
      LCX: { positive_probability: 0.42 },
      RCA: { positive_probability: 0.83 },
    } };
    expect(vesselOutput(prediction, 'LAD').positive_probability).toBe(0.17);
    expect(vesselScores(prediction)).toEqual({ LAD: 0.17, LCX: 0.42, RCA: 0.83 });
  });
});
