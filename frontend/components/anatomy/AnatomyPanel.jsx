'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { Focus, RotateCcw, ZoomIn, ZoomOut, CircleDot, Info, Search } from 'lucide-react';
import { VESSELS, formatPercent, scoreColor, vesselOutput, vesselScores } from '../../lib/predictions';
import PredictionSummary, { ScoreTrack, VesselProbabilityList } from '../predictions/ScoreMeter';

const HeartScene = dynamic(() => import('./HeartScene'), {
  ssr: false,
  loading: () => <div className="canvas-fallback"><div className="canvas-fallback-card"><div className="spinner" style={{ margin: '0 auto 12px' }} /><strong>Preparing procedural anatomy</strong><p>Loading the lightweight interactive heart scene.</p></div></div>,
});

class SceneErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return <div className="canvas-fallback"><div className="canvas-fallback-card"><strong>3D scene could not be rendered</strong><p>The rest of CardioVision remains available. Check browser WebGL support or use the vessel controls and model outputs without the 3D canvas.</p></div></div>;
    }
    return this.props.children;
  }
}

export default function AnatomyPanel({
  prediction,
  selectedVessel = 'LAD',
  onSelectVessel,
  command,
  onCameraCommand,
  onExplain,
  explanationLoading = false,
  explanationError = '',
  compact = false,
}) {
  const selectedOutput = vesselOutput(prediction, selectedVessel);
  const targetKey = selectedVessel.toLowerCase();
  const version = prediction?.model_versions?.[targetKey];
  const scores = vesselScores(prediction);

  function selectVessel(vessel) {
    onSelectVessel?.(vessel);
  }

  return (
    <div className={compact ? 'overview-layout' : 'explorer-grid'}>
      <section className={`panel ${compact ? 'overview-viewer' : 'explorer-canvas'}`} aria-label="Interactive 3D heart and coronary vessel model">
        <div className={compact ? 'viewer-heading' : 'explorer-viewer-label'}>
          <h2>Coronary anatomy · schematic</h2>
          <p>Drag to orbit · scroll to zoom · select a vessel</p>
        </div>
        <div className="canvas-wrap">
          <SceneErrorBoundary>
            <HeartScene
              vesselScores={scores}
              selectedVessel={selectedVessel}
              onSelect={selectVessel}
              command={command}
            />
          </SceneErrorBoundary>
        </div>
        <div className={compact ? 'viewer-control-row' : 'explorer-bottom-controls'}>
          <div className="viewer-legend" aria-label="Display-only model score color scale">
            <span className="legend-item"><i className="legend-swatch" style={{ background: '#78b79e' }} />Lower score</span>
            <span className="legend-item"><i className="legend-swatch" style={{ background: '#e2ad59' }} />Intermediate</span>
            <span className="legend-item"><i className="legend-swatch" style={{ background: '#df796a' }} />Higher score</span>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button type="button" className="btn btn-small" onClick={() => onCameraCommand?.('zoom-out')} aria-label="Zoom out" title="Zoom out"><ZoomOut size={13} /></button>
            <button type="button" className="btn btn-small" onClick={() => onCameraCommand?.('zoom-in')} aria-label="Zoom in" title="Zoom in"><ZoomIn size={13} /></button>
            <button type="button" className="btn btn-small" onClick={() => onCameraCommand?.('front')} aria-label="Front view" title="Front view"><Focus size={13} /></button>
            <button type="button" className="btn btn-small" onClick={() => onCameraCommand?.('reset')} aria-label="Reset camera" title="Reset view"><RotateCcw size={13} /></button>
          </div>
        </div>
      </section>

      <aside className={compact ? 'overview-rail' : 'anatomy-side'} aria-label="Vessel selection and selected prediction details">
        {compact ? (
          <>
            <PredictionSummary prediction={prediction} />
            <section className="panel">
              <div className="panel-body">
                <div className="card-heading-row"><h3>Vessel-specific models</h3><span>separate outputs</span></div>
                <VesselProbabilityList prediction={prediction} onSelect={selectVessel} selectedVessel={selectedVessel} />
                <div className="safety-inline" style={{ marginTop: 12 }}>Each vessel probability comes from its own classifier. No average is used to construct the CAD output.</div>
              </div>
            </section>
            <section className="panel readiness-card">
              <div className="readiness-heading"><Info size={14} /> Model score, not lesion geometry</div>
              <p className="readiness-message">The heart is a stylized procedural illustration. The colored coronary paths represent returned scores only; they do not show stenosis severity or plaque location.</p>
            </section>
          </>
        ) : (
          <>
        <section className="panel">
          <div className="panel-header">
            <div className="panel-title-group"><h2 className="panel-title">Select a vessel</h2><p className="panel-kicker">Each value comes from its own fitted classifier.</p></div>
            <CircleDot size={15} color="#86bea7" aria-hidden="true" />
          </div>
          <div className="panel-body">
            <div className="vessel-picker" role="group" aria-label="Choose a coronary vessel">
              {VESSELS.map(({ key, name }) => {
                const output = vesselOutput(prediction, key);
                return (
                  <button
                    type="button"
                    className={`vessel-picker-btn ${selectedVessel === key ? 'active' : ''}`}
                    key={key}
                    onClick={() => selectVessel(key)}
                    aria-pressed={selectedVessel === key}
                    aria-label={`Select ${key} ${name}`}
                  >
                    <strong>{key}</strong>
                    <span>{formatPercent(output?.positive_probability)}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div className="vessel-detail-label">{selectedVessel} · positive-class score</div>
                <div className="vessel-detail-value" style={{ color: selectedOutput ? scoreColor(selectedOutput.positive_probability) : '#958775' }}>
                  {formatPercent(selectedOutput?.positive_probability)}
                </div>
                <div className="vessel-detail-class">{selectedOutput ? `Output class · ${selectedOutput.predicted_class}` : 'Awaiting an actual backend prediction'}</div>
              </div>
              <span className="target-tag">{selectedOutput ? `Cutoff ${formatPercent(selectedOutput.threshold)}` : 'No result'}</span>
            </div>
            <div style={{ marginTop: 13 }}>
              <ScoreTrack value={selectedOutput?.positive_probability ?? null} threshold={selectedOutput?.threshold ?? null} accessibleLabel={`${selectedVessel} positive-class model score`} />
              <div className="probability-meta"><span>Model threshold marker</span><span>{selectedOutput ? selectedOutput.positive_class : 'No score'}</span></div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div className="panel-title-group"><h2 className="panel-title">Selected model output</h2><p className="panel-kicker">{selectedOutput ? `Model ${version || 'version not reported'}` : 'Prediction values appear only after the API responds.'}</p></div>
          </div>
          <div className="panel-body">
            {selectedOutput ? (
              <>
                <div className="info-notice">The vessel color is a display-only mapping of this classifier&apos;s uncalibrated predicted probability. It does not depict measured narrowing, plaque, or lesion location.</div>
                <button type="button" className="btn btn-small" style={{ marginTop: 11 }} onClick={() => onExplain?.(targetKey)} disabled={!onExplain || explanationLoading}>
                  {explanationLoading ? <span className="spinner" /> : <Search size={12} />}
                  Explain {selectedVessel} output
                </button>
                {explanationError && <div className="error-notice" style={{ marginTop: 9 }} role="alert">{explanationError}</div>}
              </>
            ) : (
              <div className="chart-empty" style={{ minHeight: 70, padding: 5 }}>Run inference to color each vessel from its own returned output. Neutral teal indicates no prediction is loaded.</div>
            )}
            <div className="explanation-caveat" style={{ marginTop: 12 }}>
              The anatomy is a stylized procedural illustration. Risk-score color thresholds are display settings only, not clinical cutoffs. No artery is physically narrowed as a score rises.
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><div className="panel-title-group"><h2 className="panel-title">Color interpretation</h2><p className="panel-kicker">Configurable boundaries · display only</p></div><Info size={14} color="#e0a95c" /></div>
          <div className="panel-body">
            <div className="viewer-legend" style={{ gap: 11 }}>
              <span className="legend-item"><i className="legend-swatch" style={{ background: '#78b79e' }} />&lt; 34%</span>
              <span className="legend-item"><i className="legend-swatch" style={{ background: '#e2ad59' }} />34–66%</span>
              <span className="legend-item"><i className="legend-swatch" style={{ background: '#df796a' }} />≥ 67%</span>
            </div>
            <p className="safety-inline" style={{ marginBottom: 0 }}>Score bands are configurable in <code>frontend/lib/predictions.js</code>. They describe predicted model scores only, not confirmed stenosis severity.</p>
          </div>
        </section>
          </>
        )}
      </aside>
    </div>
  );
}
