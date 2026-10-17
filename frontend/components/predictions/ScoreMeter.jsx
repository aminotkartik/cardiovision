'use client';

import { formatPercent, scoreColor } from '../../lib/predictions';
import { SAFETY_DISCLAIMER } from '../../lib/report';

export function ScoreTrack({ value, threshold = null, label, accessibleLabel }) {
  const color = scoreColor(value);
  const percent = value === null || value === undefined ? 0 : Math.max(0, Math.min(1, Number(value))) * 100;
  return (
    <div
      className="probability-track"
      role="meter"
      aria-label={accessibleLabel || label || 'Unvalidated model score'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null || value === undefined ? undefined : Math.round(Number(value) * 100)}
    >
      {threshold !== null && <span className="threshold-marker" style={{ left: `${Math.max(0, Math.min(1, Number(threshold))) * 100}%` }} title={`Classifier threshold ${formatPercent(threshold)}`} />}
      {value !== null && value !== undefined && <div className="probability-fill" style={{ width: `${percent}%`, background: color }} />}
    </div>
  );
}

export default function PredictionSummary({ prediction }) {
  const output = prediction?.cad;
  return (
    <section className="panel cad-card" aria-label="Overall CAD model output">
      <div className="cad-card-top">
        <span className="cad-card-label">Overall CAD classifier</span>
        <span className="target-tag">Independent model</span>
      </div>
      <div className="cad-value-row">
        <span className={`cad-value ${output ? '' : 'cad-value-placeholder'}`}>{output ? formatPercent(output.positive_probability) : '—'}</span>
        <span className="cad-value-caption">positive-class score</span>
      </div>
      <ScoreTrack value={output?.positive_probability ?? null} threshold={output?.threshold ?? null} accessibleLabel="Overall CAD positive-class model score" />
      <div className="probability-meta">
        <span>Classifier threshold {output ? formatPercent(output.threshold) : 'not loaded'}</span>
        <span>0–100%</span>
      </div>
      {output ? (
        <div className="probability-class"><i className="mini-dot" /> Output class: <strong>{output.predicted_class}</strong></div>
      ) : (
        <div className="probability-class" style={{ color: '#b3a58f' }}><i className="mini-dot" /> No backend prediction returned</div>
      )}
      <p className="safety-inline" style={{ margin: '11px 0 0' }}>{SAFETY_DISCLAIMER}</p>
      <p className="safety-inline" style={{ margin: '7px 0 0' }}>
        The CAD score comes from its own classifier; it is not averaged from LAD, LCX, or RCA. Outputs are uncalibrated model scores, not validated absolute risk.
      </p>
    </section>
  );
}

export function VesselProbabilityList({ prediction, onSelect, selectedVessel }) {
  const vessels = [
    ['LAD', 'Left anterior descending'],
    ['LCX', 'Left circumflex'],
    ['RCA', 'Right coronary artery'],
  ];
  return (
    <div className="vessel-mini-list">
      {vessels.map(([key, name]) => {
        const output = prediction?.vessels?.[key];
        return (
          <button
            type="button"
            className="vessel-mini-row"
            key={key}
            onClick={() => onSelect?.(key)}
            aria-label={`Select ${key}, ${output ? formatPercent(output.positive_probability) : 'no model score'}`}
            style={{ width: '100%', padding: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: onSelect ? 'pointer' : 'default', outline: selectedVessel === key ? '1px solid rgba(224,169,92,.22)' : 'none', outlineOffset: '4px', borderRadius: 3 }}
          >
            <span className="vessel-code">{key}<span className="vessel-name">{name}</span></span>
            <ScoreTrack value={output?.positive_probability ?? null} threshold={output?.threshold ?? null} accessibleLabel={`${key} model score`} />
            <span className="vessel-mini-value">{formatPercent(output?.positive_probability)}</span>
          </button>
        );
      })}
    </div>
  );
}
