'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const TARGETS = [
  { key: 'cad', label: 'Overall CAD' },
  { key: 'lad', label: 'LAD' },
  { key: 'lcx', label: 'LCX' },
  { key: 'rca', label: 'RCA' },
];
const SERIES = ['accuracy', 'precision', 'recall', 'f1', 'roc_auc'];

function metricValue(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${(Number(value) * 100).toFixed(1)}%`;
}

function linePoints(curve, xName, yName) {
  if (!curve) return [];
  return curve[xName].map((x, index) => ({ x, y: curve[yName][index] }));
}

export default function PerformanceView({ metrics, schema, health }) {
  const [selectedTarget, setSelectedTarget] = useState('cad');
  const targetData = metrics?.targets?.[selectedTarget];
  const evaluation = targetData?.evaluation;
  const cv = targetData?.cross_validation || {};
  const rocPoints = useMemo(() => linePoints(evaluation?.roc_curve, 'fpr', 'tpr'), [evaluation]);
  const prPoints = useMemo(() => linePoints(evaluation?.precision_recall_curve, 'recall', 'precision'), [evaluation]);
  const audit = targetData?.leakage_audit;
  const excluded = targetData?.excluded_columns || [];

  if (!metrics?.available) {
    return (
      <div className="fade-in">
        <div className="view-heading">
          <div><p className="view-eyebrow">Model evaluation · 04</p><h1 className="view-title">Evaluation & methodology</h1><p className="view-description">Metrics are loaded from executed model-training outputs; the interface will not substitute example performance values.</p></div>
        </div>
        <div className="panel">
          <div className="panel-header"><div className="panel-title-group"><h2 className="panel-title">Evaluation results pending</h2><p className="panel-kicker">No metrics.json from an executed training run is available to this API.</p></div><AlertTriangle size={16} color="#e0a95c" /></div>
          <div className="panel-body">
            <div className="info-notice">{metrics?.message || 'No saved evaluation metrics were returned. Supply the licensed local dataset and run the training command to populate this view.'}</div>
            <div className="performance-lower">
              <section className="panel chart-panel">
                <h3 className="chart-title">Model artifacts</h3>
                <p className="methodology-text">Inference availability: <strong>{health?.inference_available ? 'available' : 'unavailable'}</strong>. Loaded model files: <strong>{health?.loaded_model_count ?? 'not checked'}</strong> of 4.</p>
                <p className="methodology-text">Dataset schema: <strong>{schema?.available ? `${schema.fields?.length || 0} inspected input fields` : 'not available'}</strong>.</p>
                <p className="methodology-text">Metrics appear only after a local training run saves per-target test evaluation JSON.</p>
              </section>
              <section className="panel chart-panel">
                <h3 className="chart-title">What will be reported</h3>
                <p className="methodology-text">Accuracy, precision, recall, F1, ROC-AUC when both test classes are present, confusion matrix, class counts, evaluation sample size, repeated training-only CV variability, selected model family, and feature schema.</p>
                <p className="methodology-text">No scores or dataset cohort counts are hardcoded into this screen.</p>
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cvAuc = cv.roc_auc;
  const positiveCount = evaluation?.class_distribution?.positive;
  const negativeCount = evaluation?.class_distribution?.negative;
  const matrix = evaluation?.confusion_matrix || [[0, 0], [0, 0]];

  return (
    <div className="fade-in">
      <div className="view-heading">
        <div><p className="view-eyebrow">Model evaluation · 04</p><h1 className="view-title">Evaluation & methodology</h1><p className="view-description">Saved held-out test results and training-only model comparison. Each target has its own label mapping, threshold, pipeline and model version.</p></div>
        <div className="status-pill ready"><i className="status-dot" /> Metrics loaded from artifacts</div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div className="panel-title-group"><h2 className="panel-title">Target evaluation</h2><p className="panel-kicker">Choose one of the four independently trained classifiers.</p></div>
          <div className="metrics-toolbar" role="tablist" aria-label="Evaluation target">
            {TARGETS.map((target) => (
              <button key={target.key} type="button" className={`btn btn-small ${selectedTarget === target.key ? 'btn-primary' : ''}`} role="tab" aria-selected={selectedTarget === target.key} onClick={() => setSelectedTarget(target.key)}>{target.label}</button>
            ))}
          </div>
        </div>
        {targetData ? (
          <div className="panel-body">
            <div className="metric-grid">
              {SERIES.map((metric) => (
                <div className="metric-box" key={metric}>
                  <span className="metric-box-label">{metric.replace('_', ' ')}</span>
                  <strong className="metric-box-value">{metricValue(evaluation?.[metric])}</strong>
                  <span className="metric-box-sub">{metric === 'roc_auc' && evaluation?.[metric] == null ? 'not defined for this sample' : 'held-out test'}</span>
                </div>
              ))}
            </div>
            <div className="performance-charts">
              <section className="panel chart-panel">
                <h3 className="chart-title">ROC curve</h3>
                <p className="chart-subtitle">Held-out partition · area {metricValue(evaluation?.roc_auc)}{evaluation?.roc_auc == null ? ' · both classes required' : ''}</p>
                {rocPoints.length ? (
                  <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={rocPoints} margin={{ top: 10, right: 14, bottom: 8, left: 2 }}>
                    <CartesianGrid strokeDasharray="2 5" /><XAxis dataKey="x" type="number" domain={[0, 1]} tickFormatter={(v) => Number(v).toFixed(1)} label={{ value: 'False positive rate', position: 'insideBottom', offset: -3, fill: '#b0a38f', fontSize: 8 }} /><YAxis dataKey="y" type="number" domain={[0, 1]} tickFormatter={(v) => Number(v).toFixed(1)} label={{ value: 'True positive rate', angle: -90, position: 'insideLeft', fill: '#b0a38f', fontSize: 8 }} /><Tooltip formatter={(value) => Number(value).toFixed(3)} /><Line type="monotone" dataKey="y" stroke="#78b79e" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart></ResponsiveContainer></div>
                ) : <div className="chart-empty">ROC curve not available for the saved test partition.</div>}
              </section>
              <section className="panel chart-panel">
                <h3 className="chart-title">Precision–recall curve</h3>
                <p className="chart-subtitle">Computed from held-out class scores; no test-threshold tuning is performed.</p>
                {prPoints.length ? (
                  <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={prPoints} margin={{ top: 10, right: 14, bottom: 8, left: 2 }}>
                    <CartesianGrid strokeDasharray="2 5" /><XAxis dataKey="x" type="number" domain={[0, 1]} tickFormatter={(v) => Number(v).toFixed(1)} label={{ value: 'Recall', position: 'insideBottom', offset: -3, fill: '#b0a38f', fontSize: 8 }} /><YAxis dataKey="y" type="number" domain={[0, 1]} tickFormatter={(v) => Number(v).toFixed(1)} label={{ value: 'Precision', angle: -90, position: 'insideLeft', fill: '#b0a38f', fontSize: 8 }} /><Tooltip formatter={(value) => Number(value).toFixed(3)} /><Line type="monotone" dataKey="y" stroke="#e0a95c" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart></ResponsiveContainer></div>
                ) : <div className="chart-empty">Precision–recall curve not available for the saved evaluation.</div>}
              </section>
            </div>
            <div className="performance-lower">
              <section className="panel chart-panel">
                <h3 className="chart-title">Confusion matrix · threshold {metricValue(targetData.threshold)}</h3>
                <p className="chart-subtitle">Rows = observed; columns = predicted. Positive class: {targetData.positive_class}; negative class: {targetData.negative_class}.</p>
                <div className="matrix" role="table" aria-label="Confusion matrix">
                  <span className="matrix-head" />
                  <span className="matrix-head">Pred. negative</span><span className="matrix-head">Pred. positive</span>
                  <span className="matrix-row-label">Actual negative</span><span className="matrix-cell">{matrix[0]?.[0] ?? '—'}</span><span className="matrix-cell positive-cell">{matrix[0]?.[1] ?? '—'}</span>
                  <span className="matrix-row-label">Actual positive</span><span className="matrix-cell">{matrix[1]?.[0] ?? '—'}</span><span className="matrix-cell positive-cell">{matrix[1]?.[1] ?? '—'}</span>
                </div>
                <p className="matrix-note">{evaluation?.sample_count ?? 0} held-out records · observed negatives {negativeCount ?? '—'} / positives {positiveCount ?? '—'}.</p>
              </section>
              <section className="panel chart-panel">
                <h3 className="chart-title">Training protocol</h3>
                <p className="methodology-text"><strong>{targetData.selected_model_family}</strong> selected by mean training-only repeated stratified cross-validation ROC-AUC.</p>
                <p className="methodology-text">Training CV ROC-AUC: {cvAuc ? `${(cvAuc.mean * 100).toFixed(1)}% ± ${(cvAuc.std * 100).toFixed(1)} percentage points` : 'not available'}.</p>
                <p className="methodology-text">Train / test: {targetData.training_rows ?? '—'} / {targetData.test_rows ?? evaluation?.sample_count ?? '—'} records. Fixed threshold: {targetData.threshold ?? '—'}; the held-out set is not used to tune it.</p>
                <p className="methodology-text">Positive label: <strong>{targetData.positive_class}</strong>. Probability calibration: <strong>not validated</strong>. Scores should not be described as clinical absolute risk.</p>
                <p className="methodology-text">Model version: <code>{targetData.model_version || 'not reported'}</code></p>
              </section>
            </div>
            <div className="performance-lower">
              <section className="panel chart-panel">
                <h3 className="chart-title">Leakage prevention audit</h3>
                {audit?.passed ? <div className="audit-badge"><ShieldCheck size={13} /> Passed · forbidden columns absent from final inputs</div> : <div className="audit-badge" style={{ color: '#df8275' }}><AlertTriangle size={13} /> Audit status unavailable or failed</div>}
                {audit?.forbidden_columns_remaining?.length > 0 && <p className="methodology-text">Remaining forbidden columns: {audit.forbidden_columns_remaining.join(', ')}</p>}
                {excluded.length > 0 && <p className="methodology-text">Excluded target/direct-outcome fields: {excluded.join(', ')}</p>}
                <ol className="audit-columns">{(audit?.final_input_columns || []).map((field) => <li key={field}>{field}</li>)}</ol>
                <p className="methodology-text">CAD, Cath, LAD, LCX and RCA are excluded as direct diagnostic outcomes/targets wherever present. No target labels enter imputers, scaling, encoding, feature selection or attribution.</p>
              </section>
              <section className="panel chart-panel">
                <h3 className="chart-title">Evaluation notes</h3>
                <p className="methodology-text">Preprocessing is inside each scikit-learn pipeline: numeric median imputation and scaling; categorical most-frequent imputation and one-hot encoding. Transformations are fit within CV folds.</p>
                <p className="methodology-text">Logistic regression and random forest use class weighting; gradient boosting is compared with the same preprocessing. The 0.50 threshold is fixed before held-out test evaluation.</p>
                <p className="methodology-text">The cohort is small and site-specific. Cross-validation and one holdout do not establish transportability or clinical validity; confidence intervals and external validation are not implied.</p>
                <p className="methodology-text">Dataset class counts: {targetData.class_distribution ? `${targetData.class_distribution.negative} negative, ${targetData.class_distribution.positive} positive` : 'not saved'}.</p>
                <p className="methodology-text"><Database size={12} style={{ verticalAlign: '-2px', marginRight: 4, color: '#86bea7' }} />Full input schema: {schema?.fields?.length ?? 0} inspected fields.</p>
              </section>
            </div>
          </div>
        ) : <div className="chart-empty">No evaluation was saved for this target.</div>}
      </section>
    </div>
  );
}
