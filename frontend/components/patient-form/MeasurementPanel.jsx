'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardList } from 'lucide-react';

const GROUP_ORDER = ['demographics', 'vitals', 'clinical', 'laboratory', 'ecg', 'echocardiography', 'other'];
const EMPTY_FIELDS = [];
const GROUP_LABELS = {
  demographics: 'Demographics', vitals: 'Vitals & examination', clinical: 'Symptoms & clinical findings',
  laboratory: 'Laboratory', ecg: 'ECG', echocardiography: 'Echocardiography', other: 'Other',
};

function display(value) {
  if (value === null || value === undefined || value === '') return 'Unknown';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toPrecision(5).replace(/\.?0+$/, '');
  return String(value);
}

export default function MeasurementPanel({ schema, values, explanation, selectedFeature, onSelectFeature, target }) {
  const [collapsed, setCollapsed] = useState({});
  const fields = schema?.fields ?? EMPTY_FIELDS;
  const contributionMap = useMemo(() => new Map((explanation?.contributions || []).map((item) => [item.feature, item])), [explanation]);
  const selectedField = fields.find((field) => field.name === selectedFeature);
  const selectedContribution = contributionMap.get(selectedFeature);
  const groups = useMemo(() => {
    const collection = new Map();
    fields.forEach((field) => {
      const group = GROUP_LABELS[field.group] ? field.group : 'other';
      if (!collection.has(group)) collection.set(group, []);
      collection.get(group).push(field);
    });
    return GROUP_ORDER.filter((key) => collection.has(key)).map((key) => [key, collection.get(key)]);
  }, [fields]);

  return (
    <section className="panel" aria-label="Submitted physiological measurements">
      <div className="panel-header">
        <div className="panel-title-group"><h2 className="panel-title">Submitted measurements</h2><p className="panel-kicker">Actual inputs · contribution is shown only when the selected model returned it</p></div>
        <ClipboardList size={14} color="#86bea7" />
      </div>
      {!fields.length ? (
        <div className="report-empty" style={{ minHeight: 115 }}>An audited dataset schema is needed to describe measurements.</div>
      ) : (
        <div>
          {groups.map(([key, groupFields]) => {
            const isCollapsed = Boolean(collapsed[key]);
            return (
              <div className="field-group" key={key}>
                <button type="button" className="field-group-toggle" onClick={() => setCollapsed((current) => ({ ...current, [key]: !current[key] }))} aria-expanded={!isCollapsed}>
                  <span className="field-group-title">{GROUP_LABELS[key]}<span className="field-group-count">{groupFields.length}</span></span>
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
                {!isCollapsed && (
                  <div className="panel-body" style={{ paddingTop: 4, paddingBottom: 7 }}>
                    <div className="field-summary-list">
                      {groupFields.map((field) => {
                        const attribution = contributionMap.get(field.name);
                        const value = values?.[field.name];
                        return (
                          <button
                            type="button"
                            className="summary-measurement"
                            key={field.name}
                            onClick={() => onSelectFeature?.(field.name)}
                            style={{ width: '100%', padding: '0 0 8px', borderTop: 0, borderLeft: 0, borderRight: 0, background: selectedFeature === field.name ? 'rgba(224,169,92,.05)' : 'transparent', textAlign: 'left', cursor: onSelectFeature ? 'pointer' : 'default' }}
                            aria-label={`${field.label || field.name}: ${display(value)}${field.unit ? ` ${field.unit}` : ''}`}
                          >
                            <span className="summary-measurement-name">{field.label || field.name}{field.unit ? ` · ${field.unit}` : ''}</span>
                            <span className={`summary-measurement-value ${value === null || value === undefined || value === '' ? 'measurement-missing' : ''}`}>
                              {display(value)}
                              {attribution?.contribution !== null && attribution?.contribution !== undefined ? ` · ${attribution.contribution > 0 ? '+' : ''}${attribution.contribution.toFixed(3)} ${target?.toUpperCase() || ''}` : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {selectedField && (
            <div className="panel-body" style={{ paddingTop: 7, paddingBottom: 3 }}>
              <div className="selected-feature">
                <strong>{selectedField.label || selectedField.name} · {GROUP_LABELS[selectedField.group] || 'Other'}</strong>
                <p>{selectedField.description || 'Meaning and coding should be checked against the source dataset data dictionary.'}</p>
                <p>Submitted value: <b>{display(values?.[selectedField.name])}{selectedField.unit && values?.[selectedField.name] !== null && values?.[selectedField.name] !== undefined ? ` ${selectedField.unit}` : ''}</b>{selectedContribution?.contribution !== null && selectedContribution?.contribution !== undefined ? ` · ${target?.toUpperCase()} score contribution ${selectedContribution.contribution > 0 ? '+' : ''}${selectedContribution.contribution.toFixed(4)}` : ' · No local contribution returned for this feature.'}</p>
              </div>
            </div>
          )}
          <div className="panel-body" style={{ paddingTop: 10 }}>
            <p className="safety-inline" style={{ margin: 0 }}>Clinical reference ranges are not inferred from model outputs. Source-cohort observed ranges are descriptive only; attribution is not causal evidence.</p>
          </div>
        </div>
      )}
    </section>
  );
}
