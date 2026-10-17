'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Search, Sparkles } from 'lucide-react';

const EMPTY_ITEMS = [];

function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'Unknown / not provided';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toPrecision(5).replace(/\.?0+$/, '');
  return String(value);
}

export default function ExplanationPanel({ explanation, loading, error, target, onExplain, selectedFeature, onSelectFeature, schema }) {
  const [mode, setMode] = useState('local');
  const contributions = explanation?.contributions ?? EMPTY_ITEMS;
  const visible = useMemo(() => contributions.filter((item) => item.contribution !== null).slice(0, 12), [contributions]);
  const maxMagnitude = Math.max(0.000001, ...visible.map((item) => Math.abs(item.contribution)));
  const selected = contributions.find((item) => item.feature === selectedFeature) || visible[0];
  const selectedField = schema?.fields?.find((field) => field.name === selected?.feature);
  const global = explanation?.global_feature_importance || [];
  const maxGlobal = Math.max(0.000001, ...global.map((item) => Math.abs(item.mean_decrease_score || 0)));

  return (
    <section className="panel" aria-label="Model feature attribution">
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="panel-title">Feature attribution · {target?.toUpperCase() || 'CAD'}</h2>
          <p className="panel-kicker">Model-specific explanation · approximate, non-causal</p>
        </div>
        <button type="button" className="btn btn-small" onClick={onExplain} disabled={!onExplain || loading}>
          {loading ? <span className="spinner" /> : <Search size={12} />}
          {explanation ? 'Refresh explanation' : 'Explain this output'}
        </button>
      </div>
      <div className="panel-body">
        {error && <div className="error-notice" role="alert">{error}</div>}
        {!explanation && !loading && !error && (
          <div className="chart-empty" style={{ minHeight: 115 }}>
            <div><Sparkles size={17} style={{ marginBottom: 7, color: '#e0b56e' }} /><br />A local explanation is computed only after the backend receives this feature record. No manually authored or placeholder contribution values are shown.</div>
          </div>
        )}
        {loading && <div className="chart-empty"><span className="loading-overlay"><span className="spinner" /> Computing model-specific feature perturbations…</span></div>}
        {explanation && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 13 }} role="tablist" aria-label="Attribution type">
              <button type="button" className={`btn btn-small ${mode === 'local' ? 'btn-primary' : ''}`} onClick={() => setMode('local')} role="tab" aria-selected={mode === 'local'}>Local contribution</button>
              <button type="button" className={`btn btn-small ${mode === 'global' ? 'btn-primary' : ''}`} onClick={() => setMode('global')} role="tab" aria-selected={mode === 'global'}><BarChart3 size={12} /> Global importance</button>
            </div>
            {mode === 'local' ? (
              <>
                <p className="chart-subtitle" style={{ margin: '0 0 9px' }}>Change in the selected model&apos;s positive-class score when one supplied feature is replaced by its training-partition baseline. These values are not additive.</p>
                {visible.length ? (
                  <div className="contribution-list">
                    {visible.map((item) => {
                      const magnitude = Math.abs(item.contribution) / maxMagnitude * 49;
                      const positive = item.contribution >= 0;
                      return (
                        <button type="button" className="contribution-row" key={item.feature} onClick={() => onSelectFeature?.(item.feature)} aria-label={`${item.feature}, ${item.direction}, ${item.contribution.toFixed(4)}`}>
                          <span className="contribution-name">{item.feature}</span>
                          <span className="diverging-track">
                            <i className="diverging-center" />
                            <i className={`diverging-fill ${positive ? 'contribution-positive' : 'contribution-negative'}`} style={{ left: positive ? '50%' : `${50 - magnitude}%`, width: `${magnitude}%` }} />
                          </span>
                          <span className="contribution-value">{item.contribution > 0 ? '+' : ''}{item.contribution.toFixed(3)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : <div className="chart-empty" style={{ minHeight: 75 }}>No local contributions can be computed for the supplied feature values and training baselines.</div>}
                {selected && (
                  <div className="selected-feature">
                    <strong>{selected.feature} · selected {target?.toUpperCase()} model</strong>
                    <p>{selectedField?.description || 'Meaning and coding should be checked against the source dataset data dictionary.'}</p>
                    <p>Supplied value: <b>{displayValue(selected.observed_value)}</b> · Training baseline: <b>{displayValue(selected.baseline_value)}</b></p>
                    <p>Relative score change: <b>{selected.contribution === null ? 'Unavailable' : `${selected.contribution > 0 ? '+' : ''}${selected.contribution.toFixed(4)}`}</b> · {selected.direction}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="chart-subtitle" style={{ margin: '0 0 9px' }}>Permutation importance computed on held-out data for this selected model. It describes score sensitivity, not causal influence.</p>
                {global.length ? (
                  <div className="contribution-list">
                    {global.slice(0, 10).map((item) => (
                      <div className="contribution-row" key={item.feature}>
                        <span className="contribution-name">{item.feature}</span>
                        <span className="diverging-track"><i className="diverging-fill contribution-negative" style={{ left: 0, width: `${Math.max(0, item.mean_decrease_score) / maxGlobal * 100}%` }} /></span>
                        <span className="contribution-value">{Number(item.mean_decrease_score).toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="chart-empty" style={{ minHeight: 75 }}>{explanation.global_feature_importance_status || 'Global importance was unavailable in the saved evaluation.'}</div>}
              </>
            )}
            <div className="explanation-caveat" style={{ marginTop: 12 }}>
              Attribution is model-specific, approximate and non-causal. Correlated features and interactions affect interpretation. It does not identify a plaque, lesion, or biological cause.
            </div>
          </>
        )}
      </div>
    </section>
  );
}
