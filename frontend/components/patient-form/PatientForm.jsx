'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity, ChevronDown, ChevronRight, ClipboardCheck, FlaskConical, HeartPulse, RotateCcw,
  Stethoscope, UserRound, Waves,
} from 'lucide-react';
import { formatPercent } from '../../lib/predictions';

const EMPTY_FIELDS = [];

const GROUP_META = {
  demographics: { label: 'Demographics', icon: UserRound },
  vitals: { label: 'Vitals & examination', icon: HeartPulse },
  clinical: { label: 'Symptoms & clinical findings', icon: Stethoscope },
  laboratory: { label: 'Laboratory measurements', icon: FlaskConical },
  ecg: { label: 'Electrocardiography', icon: Activity },
  echocardiography: { label: 'Echocardiography', icon: Waves },
  other: { label: 'Other dataset features', icon: ClipboardCheck },
};

function formatObservedRange(range) {
  if (!range) return null;
  const compact = (value) => Number.isInteger(value) ? value : Number(value).toPrecision(4).replace(/\.?0+$/, '');
  return `${compact(range.min)}–${compact(range.max)}`;
}

export default function PatientForm({
  schema,
  values,
  onChange,
  onReset,
  onValidate,
  validation,
  onAnalyze,
  loading,
  onUseDemo,
  demoLoading,
  demoMode,
  inferenceAvailable,
  validationMessage,
}) {
  const [collapsed, setCollapsed] = useState({});
  const fields = schema?.fields ?? EMPTY_FIELDS;
  const grouped = useMemo(() => {
    const groups = new Map();
    fields.forEach((field) => {
      const key = GROUP_META[field.group] ? field.group : 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(field);
    });
    return groups;
  }, [fields]);
  const missingCount = fields.filter((field) => values?.[field.name] === null || values?.[field.name] === undefined || values?.[field.name] === '').length;

  function updateCategory(field, rawValue) {
    if (rawValue === '') {
      onChange(field.name, null);
      return;
    }
    const option = field.options?.find((value) => String(value) === rawValue);
    onChange(field.name, option === undefined ? rawValue : option);
  }

  function renderField(field) {
    const value = values?.[field.name];
    const error = validation?.errors?.[field.name];
    const range = formatObservedRange(field.observed_range);
    const isOutOfObservedRange = field.type === 'numeric' && value !== null && value !== undefined && value !== '' && field.observed_range && (Number(value) < field.observed_range.min || Number(value) > field.observed_range.max);
    return (
      <div className="field-control" key={field.name}>
        <div className="field-label-row">
          <label className="field-label" htmlFor={`feature-${field.name}`}>{field.label || field.name}</label>
          {field.unit && <span className="field-unit">{field.unit}</span>}
        </div>
        {field.type === 'numeric' ? (
          <input
            className="field-input"
            id={`feature-${field.name}`}
            type="number"
            step="any"
            value={value === null || value === undefined ? '' : value}
            onChange={(event) => onChange(field.name, event.target.value === '' ? null : event.target.value)}
            placeholder="Unknown"
            aria-invalid={Boolean(error)}
            aria-describedby={`help-${field.name}`}
          />
        ) : (
          <select
            className="field-select"
            id={`feature-${field.name}`}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(event) => updateCategory(field, event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={`help-${field.name}`}
          >
            <option value="">Unknown / not provided</option>
            {(field.options || []).map((option, index) => (
              <option key={`${String(option)}-${index}`} value={String(option)}>{String(option)}</option>
            ))}
          </select>
        )}
        <div className="field-help" id={`help-${field.name}`}>
          <span>{range ? `Observed source cohort: ${range}${field.unit ? ` ${field.unit}` : ''}` : 'Leave blank if not available'}</span>
          <span>{field.missing_supported ? 'Optional' : 'Required'}</span>
        </div>
        {error && <div className="field-error" role="alert">{error}</div>}
        {!error && isOutOfObservedRange && <div className="field-warning">Outside the observed cohort range; this is not a clinical reference limit.</div>}
      </div>
    );
  }

  return (
    <section className="panel form-panel" aria-label="Patient feature input form">
      <div className="panel-header form-toolbar">
        <div className="panel-title-group">
          <h2 className="panel-title">Patient feature input</h2>
          <p className="panel-kicker">
            {fields.length ? `${fields.length} fields generated from the audited dataset schema · ${missingCount} currently unknown` : 'Dataset columns will be shown here after a local schema audit.'}
          </p>
        </div>
        <button type="button" className="btn btn-small" onClick={onUseDemo} disabled={!schema?.available || demoLoading}>
          {demoLoading ? <span className="spinner" /> : null} Load synthetic demo
        </button>
      </div>

      {!fields.length ? (
        <div className="report-empty">
          <div>
            <strong>No inspected feature schema yet</strong>
            <div>The application intentionally does not guess patient fields. Place the licensed dataset in <code>data/</code>, run the audit command, then reload this view. The API will generate the form and synthetic profile from those actual columns.</div>
          </div>
        </div>
      ) : (
        <div>
          {Array.from(grouped.entries()).map(([groupKey, groupFields]) => {
            const group = GROUP_META[groupKey];
            const Icon = group.icon;
            const isCollapsed = Boolean(collapsed[groupKey]);
            return (
              <div className="field-group" key={groupKey}>
                <button
                  type="button"
                  className="field-group-toggle"
                  onClick={() => setCollapsed((current) => ({ ...current, [groupKey]: !current[groupKey] }))}
                  aria-expanded={!isCollapsed}
                >
                  <span className="field-group-title"><Icon size={14} /> {group.label}<span className="field-group-count">{groupFields.length}</span></span>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                {!isCollapsed && <div className="field-grid">{groupFields.map(renderField)}</div>}
              </div>
            );
          })}
          <div className="form-actions">
            <div className="form-actions-left">
              <button type="button" className="btn btn-small" onClick={onReset}><RotateCcw size={12} /> Reset values</button>
              <span className="form-state">{demoMode ? 'Synthetic profile loaded · no ground-truth labels' : `${missingCount} unknown value${missingCount === 1 ? '' : 's'} will use pipeline imputation`}</span>
            </div>
            <div className="form-actions-right">
              <button type="button" className="btn" onClick={onValidate}><ClipboardCheck size={13} /> Validate patient</button>
              <button type="button" className="btn btn-primary" onClick={onAnalyze} disabled={loading || !fields.length}>
                {loading ? <><span className="spinner" /> Analyzing</> : <><Activity size={13} /> Analyze patient</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {validationMessage && <div style={{ padding: '0 16px 13px', color: validation?.valid ? '#8ac9ad' : '#e8968c', fontSize: 10 }} role="status">{validationMessage}</div>}
      {!inferenceAvailable && fields.length > 0 && (
        <div style={{ padding: '0 16px 13px' }}>
          <div className="info-notice">The inspected input schema is available, but real inference is disabled until all four trained model artifacts are installed. Analysis requests will return a clear backend setup error.</div>
        </div>
      )}
    </section>
  );
}
