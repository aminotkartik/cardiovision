export const VESSELS = [
  { key: 'LAD', name: 'Left anterior descending' },
  { key: 'LCX', name: 'Left circumflex' },
  { key: 'RCA', name: 'Right coronary artery' },
];

// Display-only boundaries for model-score color mapping, not clinical risk categories.
export const SCORE_COLOR_THRESHOLDS = {
  intermediateFrom: Number(process.env.NEXT_PUBLIC_SCORE_INTERMEDIATE_FROM || 0.34),
  higherFrom: Number(process.env.NEXT_PUBLIC_SCORE_HIGHER_FROM || 0.67),
};

export function scoreColor(probability) {
  if (probability === null || probability === undefined || !Number.isFinite(Number(probability))) return '#78b79e';
  const value = Number(probability);
  if (value < SCORE_COLOR_THRESHOLDS.intermediateFrom) return '#78b79e';
  if (value < SCORE_COLOR_THRESHOLDS.higherFrom) return '#e2ad59';
  return '#df796a';
}

export function vesselOutput(prediction, vessel) {
  if (!prediction?.vessels) return null;
  return prediction.vessels[vessel] || null;
}

export function vesselScores(prediction) {
  return Object.fromEntries(VESSELS.map(({ key }) => [key, vesselOutput(prediction, key)?.positive_probability ?? null]));
}

export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(decimals)}%`;
}
