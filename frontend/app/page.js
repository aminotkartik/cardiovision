'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Database, HeartPulse, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import AppShell, { VIEW_META } from '../components/layout/AppShell';
import AnatomyPanel from '../components/anatomy/AnatomyPanel';
import ExplanationPanel from '../components/explanations/ExplanationPanel';
import PerformanceView from '../components/charts/PerformanceView';
import ReportsView from '../components/charts/ReportsView';
import PatientForm from '../components/patient-form/PatientForm';
import MeasurementPanel from '../components/patient-form/MeasurementPanel';
import PredictionSummary, { VesselProbabilityList } from '../components/predictions/ScoreMeter';
import { apiRequest, ApiError } from '../lib/api';
import { coerceFeatures, validateFeatures } from '../lib/validation';
import { formatPercent } from '../lib/predictions';
import { buildReport, SAFETY_DISCLAIMER } from '../lib/report';

const TARGETS = [
  { key: 'cad', label: 'Overall CAD' },
  { key: 'lad', label: 'LAD' },
  { key: 'lcx', label: 'LCX' },
  { key: 'rca', label: 'RCA' },
];

function makeSessionId() {
  const token = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
  return `CV-${token.toUpperCase()}`;
}

function emptyValues(schema) {
  return Object.fromEntries((schema?.fields || []).map((field) => [field.name, null]));
}

function errorMessage(error) {
  if (error instanceof ApiError) {
    const detail = error.detail;
    const missing = detail && typeof detail === 'object' ? detail.missing_artifacts : null;
    const fields = detail && typeof detail === 'object' ? detail.fields : null;
    let suffix = '';
    if (Array.isArray(missing) && missing.length) suffix = ` Missing: ${missing.join(', ')}.`;
    if (Array.isArray(fields) && fields.length) suffix = ` Fields: ${fields.map((field) => typeof field === 'string' ? field : `${field.field}: ${field.message}`).join('; ')}.`;
    return `${error.message}${suffix}`;
  }
  return error?.message || 'An unexpected error occurred.';
}

function ViewHeading({ view, actions }) {
  const meta = VIEW_META[view];
  return (
    <div className="view-heading">
      <div><p className="view-eyebrow">{meta.eyebrow}</p><h1 className="view-title">{meta.title}</h1><p className="view-description">{meta.description}</p></div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

function Notice({ children, error = false }) {
  return <div className={error ? 'error-notice' : 'info-notice'} role={error ? 'alert' : 'status'}>{children}</div>;
}

export default function HomePage() {
  const [activeView, setActiveView] = useState('overview');
  const [sessionId, setSessionId] = useState('CV-SESSION');
  const [health, setHealth] = useState(null);
  const [schema, setSchema] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [values, setValues] = useState({});
  const [prediction, setPrediction] = useState(null);
  const [explanations, setExplanations] = useState({});
  const [selectedVessel, setSelectedVessel] = useState('LAD');
  const [explanationTarget, setExplanationTarget] = useState('cad');
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [cameraCommand, setCameraCommand] = useState({ id: 0, action: 'reset' });
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [explanationLoading, setExplanationLoading] = useState(null);
  const [explanationErrors, setExplanationErrors] = useState({});
  const [demoMode, setDemoMode] = useState(false);
  const [formValidation, setFormValidation] = useState(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [backendError, setBackendError] = useState('');
  const [demoError, setDemoError] = useState('');
  const [validationWarnings, setValidationWarnings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const activeExplanation = explanations[explanationTarget] || null;
  const selectedVesselTarget = selectedVessel.toLowerCase();
  const selectedVesselExplanation = explanations[selectedVesselTarget] || null;
  const fields = schema?.fields || [];
  const report = useMemo(() => buildReport({
    sessionId,
    features: coerceFeatures(schema, values),
    prediction,
    explanation: activeExplanation,
    demoMode,
    schema,
    health,
  }), [sessionId, schema, values, prediction, activeExplanation, demoMode, health]);

  const loadBackendState = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    setBackendError('');
    const [healthResult, schemaResult, metricsResult] = await Promise.allSettled([
      apiRequest('/health', { timeoutMs: 9000 }),
      apiRequest('/api/schema', { timeoutMs: 9000 }),
      apiRequest('/api/model-metrics', { timeoutMs: 9000 }),
    ]);
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
    else {
      setHealth(null);
      setBackendError(errorMessage(healthResult.reason));
    }
    if (schemaResult.status === 'fulfilled') {
      const nextSchema = schemaResult.value;
      setSchema(nextSchema);
      if (nextSchema?.fields?.length) {
        setValues((current) => {
          const next = {};
          nextSchema.fields.forEach((field) => { next[field.name] = Object.prototype.hasOwnProperty.call(current, field.name) ? current[field.name] : null; });
          return next;
        });
      }
    } else {
      setSchema(null);
      setBackendError((current) => current || errorMessage(schemaResult.reason));
    }
    if (metricsResult.status === 'fulfilled') setMetrics(metricsResult.value);
    else setMetrics(null);
    if (!quiet) setRefreshing(false);
  }, []);

  useEffect(() => {
    setSessionId(makeSessionId());
    loadBackendState();
  }, [loadBackendState]);

  const hasSchema = Boolean(schema?.available && fields.length);
  const inferenceAvailable = health?.inference_available === true;

  function clearResultForEditedInput() {
    if (prediction) {
      setPrediction(null);
      setExplanations({});
      setAnalysisError('Inputs changed. Run analysis again to refresh model outputs for this feature record.');
    }
    setFormValidation(null);
    setValidationMessage('');
    setValidationWarnings([]);
    setExplanationErrors({});
  }

  function changeFeature(name, value) {
    clearResultForEditedInput();
    setValues((current) => ({ ...current, [name]: value }));
  }

  function resetAnalysis() {
    setSessionId(makeSessionId());
    setValues(emptyValues(schema));
    setPrediction(null);
    setExplanations({});
    setDemoMode(false);
    setFormValidation(null);
    setValidationMessage('');
    setValidationWarnings([]);
    setAnalysisError('');
    setDemoError('');
    setExplanationErrors({});
    setSelectedFeature(null);
    setSelectedVessel('LAD');
    setExplanationTarget('cad');
    setActiveView('analysis');
  }

  function resetForm() {
    setValues(emptyValues(schema));
    setDemoMode(false);
    setPrediction(null);
    setExplanations({});
    setFormValidation(null);
    setValidationMessage('Patient values reset.');
    setValidationWarnings([]);
    setAnalysisError('');
    setExplanationErrors({});
  }

  function validatePatient() {
    const result = validateFeatures(schema, values);
    setFormValidation(result);
    setValidationWarnings(result.warnings);
    if (result.valid) {
      setValidationMessage(`Validation passed · ${result.warnings.length} data-range note${result.warnings.length === 1 ? '' : 's'} · unknown values remain missing for pipeline imputation.`);
    } else {
      setValidationMessage(`Validation found ${Object.keys(result.errors).length} issue${Object.keys(result.errors).length === 1 ? '' : 's'}. Review highlighted fields.`);
    }
  }

  async function loadDemoPatient() {
    setDemoLoading(true);
    setDemoError('');
    setAnalysisError('');
    try {
      const result = await apiRequest('/api/demo-patient', { timeoutMs: 12000 });
      if (result?.synthetic !== true || !result?.features) throw new Error('The backend did not return a clearly labeled synthetic profile.');
      setValues(result.features);
      setDemoMode(true);
      setPrediction(null);
      setExplanations({});
      setFormValidation({ valid: true, errors: {}, warnings: [] });
      setValidationWarnings([]);
      setValidationMessage('Synthetic demonstration profile loaded. No ground-truth labels are supplied.');
      setActiveView('analysis');
    } catch (error) {
      setDemoError(errorMessage(error));
    } finally {
      setDemoLoading(false);
    }
  }

  async function runAnalysis() {
    const result = validateFeatures(schema, values);
    setFormValidation(result);
    setValidationWarnings(result.warnings);
    if (!result.valid) {
      setValidationMessage(`Validation found ${Object.keys(result.errors).length} issue${Object.keys(result.errors).length === 1 ? '' : 's'}. Review highlighted fields.`);
      return;
    }
    if (!hasSchema) {
      setAnalysisError('No inspected dataset schema is available. The form cannot submit guessed fields.');
      return;
    }
    setLoading(true);
    setAnalysisError('');
    setValidationMessage('Submitting verified input fields to the FastAPI model service…');
    setExplanations({});
    try {
      const response = await apiRequest('/api/predict', {
        method: 'POST',
        timeoutMs: 30000,
        body: JSON.stringify({ features: coerceFeatures(schema, values), demo_mode: demoMode }),
      });
      setPrediction(response);
      setSelectedVessel('LAD');
      setExplanationTarget('cad');
      setSelectedFeature(null);
      setAnalysisError('');
      setValidationMessage('Four independent model predictions returned by the backend.');
      await loadBackendState(true);
    } catch (error) {
      setAnalysisError(errorMessage(error));
      setValidationMessage('No new prediction was received. Existing model outputs are not fabricated.');
    } finally {
      setLoading(false);
    }
  }

  async function requestExplanation(target) {
    if (!prediction) {
      setExplanationErrors((current) => ({ ...current, [target]: 'Run an actual backend prediction before requesting attribution.' }));
      return;
    }
    setExplanationLoading(target);
    setExplanationErrors((current) => ({ ...current, [target]: '' }));
    try {
      const response = await apiRequest('/api/explain', {
        method: 'POST',
        timeoutMs: 30000,
        body: JSON.stringify({
          target,
          features: coerceFeatures(schema, values),
          model_version: prediction.model_versions?.[target],
        }),
      });
      setExplanations((current) => ({ ...current, [target]: response }));
    } catch (error) {
      setExplanationErrors((current) => ({ ...current, [target]: errorMessage(error) }));
    } finally {
      setExplanationLoading(null);
    }
  }

  function issueCameraCommand(action) {
    setCameraCommand((current) => ({ id: current.id + 1, action }));
  }

  function selectVessel(vessel) {
    setSelectedVessel(vessel);
    setExplanationTarget(vessel.toLowerCase());
  }

  function exportJson() {
    if (!report) return;
    const data = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cardiovision-${sessionId.toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell activeView={activeView} setActiveView={setActiveView} sessionId={sessionId} health={health} onNewAnalysis={resetAnalysis}>
      {activeView === 'overview' && (
        <div className="fade-in">
          <ViewHeading
            view="overview"
            actions={(
              <>
                <button type="button" className="btn" onClick={loadDemoPatient} disabled={!hasSchema || demoLoading} title={!hasSchema ? 'Run a local dataset schema audit to enable a dataset-compatible synthetic profile.' : 'Load a clearly labeled synthetic feature-wise profile'}>
                  {demoLoading ? <span className="spinner" /> : <Sparkles size={13} />} Demonstration patient
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setActiveView('analysis')}><HeartPulse size={13} /> Start analysis <ArrowRight size={13} /></button>
              </>
            )}
          />
          {demoError && <div style={{ marginBottom: 12 }}><Notice error>{demoError}</Notice></div>}
          {backendError && <div style={{ marginBottom: 12 }}><Notice error>Backend connection status is unavailable: {backendError}</Notice></div>}
          <AnatomyPanel
            compact
            prediction={prediction}
            selectedVessel={selectedVessel}
            onSelectVessel={selectVessel}
            command={cameraCommand}
            onCameraCommand={issueCameraCommand}
            onExplain={(target) => { setExplanationTarget(target); setActiveView('analysis'); requestExplanation(target); }}
            explanationLoading={Boolean(explanationLoading)}
          />

          <div className="overview-foot-grid">
            <section className="panel readiness-card">
              <div className="readiness-heading"><HeartPulse size={14} /> Inference service</div>
              <p className="readiness-message">{inferenceAvailable ? `${health.loaded_model_count} target pipelines are loaded by the backend.` : 'Real prediction requires all four trained model artifacts. The frontend does not substitute demo scores.'}</p>
              <span className={`readiness-status ${inferenceAvailable ? 'available' : ''}`}><i className="status-dot" />{health ? (inferenceAvailable ? 'Backend confirmed ready' : `${health.loaded_model_count} of 4 models loaded`) : 'Health check pending'}</span>
            </section>
            <section className="panel readiness-card">
              <div className="readiness-heading"><Database size={14} /> Dataset schema</div>
              <p className="readiness-message">{hasSchema ? `${fields.length} actual input fields loaded from the local dataset audit.` : 'No source columns are bundled or guessed. Run the dataset audit to generate the patient form.'}</p>
              <span className={`readiness-status ${hasSchema ? 'available' : ''}`}><i className="status-dot" />{hasSchema ? 'Schema inspected' : 'Dataset schema pending'}</span>
            </section>
            <section className="panel readiness-card">
              <div className="readiness-heading"><ShieldAlert size={14} /> Evaluation summary</div>
              {metrics?.available ? (
                <>
                  <p className="readiness-message">CAD test ROC-AUC: <strong>{metrics.targets?.cad?.evaluation?.roc_auc == null ? 'not available' : formatPercent(metrics.targets.cad.evaluation.roc_auc)}</strong>. Selected family: {metrics.targets?.cad?.selected_model_family || 'not reported'}.</p>
                  <p className="target-count">{metrics.targets?.cad?.training_rows ?? '—'} training / {metrics.targets?.cad?.test_rows ?? '—'} held-out samples · all metrics sourced from saved training output.</p>
                </>
              ) : (
                <p className="readiness-message">Pending executed training. No accuracy, ROC-AUC, cohort counts, or readiness claims are fabricated.</p>
              )}
            </section>
          </div>

          <div className="overview-foot-grid" style={{ gridTemplateColumns: '1fr 1fr 1.4fr' }}>
            <section className="panel target-card">
              <div className="readiness-heading">Four independent prediction targets</div>
              <p className="target-count">Overall CAD plus LAD, LCX and RCA vessel-status classifiers. Each uses its own fitted target model and threshold.</p>
              <div className="target-symbols">{TARGETS.map((target) => <span className="target-symbol" key={target.key}>{target.label}</span>)}</div>
            </section>
            <section className="panel target-card">
              <div className="readiness-heading">Model output semantics</div>
              <p className="target-count">Scores are uncalibrated model outputs. The anatomy maps color only; it does not model arterial narrowing or locate plaque.</p>
            </section>
            <section className="panel disclaimer-card">
              <div className="safety-banner"><ShieldAlert size={14} /><span><strong>Medical safety disclaimer.</strong> {SAFETY_DISCLAIMER}</span></div>
            </section>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => loadBackendState()} disabled={refreshing}>
              {refreshing ? <span className="spinner" /> : <RefreshCw size={12} />} Refresh model & dataset status
            </button>
          </div>
        </div>
      )}

      {activeView === 'analysis' && (
        <div className="fade-in">
          <ViewHeading
            view="analysis"
            actions={(
              <>
                <select className="select-compact" value={explanationTarget} onChange={(event) => setExplanationTarget(event.target.value)} aria-label="Choose model target for attribution">
                  {TARGETS.map((target) => <option value={target.key} key={target.key}>{target.label} explanation</option>)}
                </select>
                <button type="button" className="btn" onClick={loadDemoPatient} disabled={!hasSchema || demoLoading}>{demoLoading ? <span className="spinner" /> : <Sparkles size={13} />} Load synthetic demo</button>
              </>
            )}
          />
          {(analysisError || demoError) && <div style={{ marginBottom: 12 }}><Notice error><AlertCircle size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />{analysisError || demoError}</Notice></div>}
          {validationWarnings.length > 0 && <div style={{ marginBottom: 12 }}><Notice>{validationWarnings.slice(0, 3).join(' ')}</Notice></div>}
          <div className="form-view-grid">
            <div>
              <PatientForm
                schema={schema}
                values={values}
                onChange={changeFeature}
                onReset={resetForm}
                onValidate={validatePatient}
                validation={formValidation}
                validationMessage={validationMessage}
                onAnalyze={runAnalysis}
                loading={loading}
                onUseDemo={loadDemoPatient}
                demoLoading={demoLoading}
                demoMode={demoMode}
                inferenceAvailable={inferenceAvailable}
              />
              <div style={{ marginTop: 13 }}>
                <ExplanationPanel
                  explanation={activeExplanation}
                  loading={explanationLoading === explanationTarget}
                  error={explanationErrors[explanationTarget]}
                  target={explanationTarget}
                  onExplain={prediction ? () => requestExplanation(explanationTarget) : null}
                  selectedFeature={selectedFeature}
                  onSelectFeature={setSelectedFeature}
                  schema={schema}
                />
              </div>
            </div>
            <aside className="analysis-side">
              <PredictionSummary prediction={prediction} />
              <section className="panel">
                <div className="panel-header"><div className="panel-title-group"><h2 className="panel-title">Vessel-specific outputs</h2><p className="panel-kicker">Tap a vessel to inspect its independent model.</p></div></div>
                <div className="panel-body"><VesselProbabilityList prediction={prediction} selectedVessel={selectedVessel} onSelect={selectVessel} /></div>
              </section>
              {prediction && (
                <section className="panel result-status-card">
                  <div className="panel-title">Prediction receipt</div>
                  <div className="report-kv"><span className="report-key">Identifier</span><span className="report-value">{prediction.prediction_id}</span></div>
                  <div className="report-kv"><span className="report-key">Model version</span><span className="report-value">{prediction.model_version}</span></div>
                  <div className="report-kv"><span className="report-key">Generated</span><span className="report-value">{new Date(prediction.created_at).toLocaleString()}</span></div>
                  <p className="safety-inline">{prediction.probability_semantics}</p>
                  {prediction.warnings?.map((warning) => <div className="field-warning" key={warning}>{warning}</div>)}
                  <div className="safety-banner" style={{ marginTop: 10 }}><ShieldAlert size={13} /><span><strong>Not a diagnosis.</strong> Independent model outputs can differ; interpret with qualified clinicians and appropriate investigations.</span></div>
                </section>
              )}
              <MeasurementPanel
                schema={schema}
                values={coerceFeatures(schema, values)}
                explanation={activeExplanation}
                selectedFeature={selectedFeature}
                onSelectFeature={setSelectedFeature}
                target={explanationTarget}
              />
            </aside>
          </div>
        </div>
      )}

      {activeView === 'anatomy' && (
        <div className="fade-in">
          <ViewHeading view="anatomy" actions={<span className="status-pill"><i className="status-dot" />{prediction ? 'Scores from backend response' : 'Neutral anatomy · no prediction'}</span>} />
          <AnatomyPanel
            prediction={prediction}
            selectedVessel={selectedVessel}
            onSelectVessel={selectVessel}
            command={cameraCommand}
            onCameraCommand={issueCameraCommand}
            onExplain={(target) => requestExplanation(target)}
            explanationLoading={Boolean(explanationLoading)}
            explanationError={explanationErrors[selectedVesselTarget]}
          />
          <div style={{ marginTop: 14 }}>
            {selectedVesselExplanation || explanationErrors[selectedVesselTarget] ? (
              <ExplanationPanel
                explanation={selectedVesselExplanation}
                loading={explanationLoading === selectedVesselTarget}
                error={explanationErrors[selectedVesselTarget]}
                target={selectedVesselTarget}
                onExplain={prediction ? () => requestExplanation(selectedVesselTarget) : null}
                selectedFeature={selectedFeature}
                onSelectFeature={setSelectedFeature}
                schema={schema}
              />
            ) : (
              <section className="panel"><div className="panel-body"><div className="info-notice">{prediction ? `Request an explanation for ${selectedVessel} to compute real local feature perturbations from that vessel model.` : 'No explanation is available until a successful backend prediction is returned.'}</div></div></section>
            )}
          </div>
        </div>
      )}

      {activeView === 'performance' && <PerformanceView metrics={metrics} schema={schema} health={health} />}

      {activeView === 'reports' && <ReportsView report={report} prediction={prediction} sessionId={sessionId} onExportJson={exportJson} />}
    </AppShell>
  );
}
