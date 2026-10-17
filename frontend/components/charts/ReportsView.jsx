'use client';

import { useState } from 'react';
import { AlertTriangle, Download, FileDown, FileJson2, FileText, Printer, ShieldCheck } from 'lucide-react';
import { formatPercent } from '../../lib/predictions';

function safeFilename(value) {
  return String(value || 'analysis').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
}

export default function ReportsView({ report, prediction, sessionId, onExportJson }) {
  const [pdfStatus, setPdfStatus] = useState('');
  const outputs = [
    ['Overall CAD', prediction?.cad],
    ['LAD', prediction?.vessels?.LAD],
    ['LCX', prediction?.vessels?.LCX],
    ['RCA', prediction?.vessels?.RCA],
  ];

  async function exportPdf() {
    if (!prediction) return;
    setPdfStatus('Preparing a local PDF…');
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 17;
      const width = 176;
      let y = 20;
      const write = (text, size = 10, color = [40, 54, 63], weight = 'normal') => {
        pdf.setFont('helvetica', weight);
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(String(text), width);
        if (y + lines.length * (size * 0.48) > 278) { pdf.addPage(); y = 20; }
        pdf.text(lines, margin, y);
        y += lines.length * (size * 0.48) + 3;
      };
      write('CARDIOVISION 3D · MODEL-GENERATED RESEARCH PROTOTYPE', 13, [20, 44, 55], 'bold');
      write(`Analysis ${sessionId} · ${new Date(prediction.created_at).toLocaleString()}`, 9, [91, 109, 118]);
      write(`Status: ${report.synthetic_demo ? 'synthetic demonstration profile' : 'user-entered feature record'} · real API inference completed`, 9, [91, 109, 118]);
      write('MODEL OUTPUTS', 10, [154, 112, 37], 'bold');
      outputs.forEach(([name, value]) => {
        if (!value) return;
        write(`${name}: ${formatPercent(value.positive_probability)} positive-class score · class ${value.predicted_class} · cutoff ${formatPercent(value.threshold)}`, 10);
      });
      write(`Model version: ${prediction.model_version}`, 9);
      write(`Probability semantics: ${prediction.probability_semantics}`, 9);
      write('SUBMITTED INPUTS', 10, [154, 112, 37], 'bold');
      const featureEntries = report.input_measurements || [];
      featureEntries.forEach((field) => write(`${field.label}: ${field.missing ? 'Unknown / not provided' : field.value}${field.unit && !field.missing ? ` ${field.unit}` : ''}`, 8, [49, 63, 70]));
      if (!featureEntries.length) write('No input values were recorded.', 9);
      const contributions = report.selected_target_explanation?.contributions?.filter((item) => item.contribution !== null).slice(0, 8) || [];
      if (contributions.length) {
        write('LOCAL ATTRIBUTION · SELECTED MODEL', 10, [154, 112, 37], 'bold');
        contributions.forEach((item) => write(`${item.feature}: ${item.contribution > 0 ? '+' : ''}${Number(item.contribution).toFixed(4)} score change vs training baseline`, 8, [49, 63, 70]));
        write('Attribution is approximate, non-additive and non-causal.', 8, [93, 104, 109]);
      }
      if (report.warnings?.length) {
        write('INPUT / MODEL WARNINGS', 10, [154, 112, 37], 'bold');
        report.warnings.forEach((item) => write(`• ${item}`, 8, [70, 78, 82]));
      }
      write('LIMITATIONS', 10, [154, 112, 37], 'bold');
      (report.limitations || []).forEach((item) => write(`• ${item}`, 8, [70, 78, 82]));
      write(report.disclaimer, 8, [142, 61, 53], 'bold');
      pdf.save(`cardiovision-${safeFilename(sessionId)}.pdf`);
      setPdfStatus('PDF saved locally.');
    } catch (error) {
      setPdfStatus(`PDF export failed: ${error.message || 'use the browser print dialog instead.'}`);
    }
  }

  return (
    <div className="fade-in">
      <div className="view-heading">
        <div><p className="view-eyebrow">Analysis exports · 05</p><h1 className="view-title">Report & project notes</h1><p className="view-description">Export is performed in the browser. Patient inputs are not sent to third-party reporting services.</p></div>
        <div className="heading-actions">
          <button type="button" className="btn" onClick={onExportJson} disabled={!report}><FileJson2 size={13} /> Export JSON</button>
          <button type="button" className="btn btn-primary" onClick={exportPdf} disabled={!prediction}><FileDown size={13} /> Export PDF</button>
        </div>
      </div>
      {pdfStatus && <div className="info-notice" style={{ marginBottom: 12 }} role="status">{pdfStatus}</div>}

      <div className="report-grid">
        <section className="panel">
          <div className="panel-header"><div className="panel-title-group"><h2 className="panel-title">Analysis summary</h2><p className="panel-kicker">{prediction ? 'Actual response captured from the inference API.' : 'A report can include inputs now; model outputs appear only after inference succeeds.'}</p></div><FileText size={14} color="#e0a95c" /></div>
          <div className="panel-body">
            <div className="report-kv"><span className="report-key">Analysis identifier</span><span className="report-value">{sessionId}</span></div>
            <div className="report-kv"><span className="report-key">Record type</span><span className="report-value">{report?.synthetic_demo ? 'Synthetic demonstration profile' : 'User-entered features'}</span></div>
            <div className="report-kv"><span className="report-key">Inference status</span><span className="report-value">{prediction ? 'Completed by backend model artifacts' : 'No successful inference in this session'}</span></div>
            <div className="report-kv"><span className="report-key">Model version</span><span className="report-value">{prediction?.model_version || 'Not available'}</span></div>
            {prediction ? (
              <div className="report-output-grid">
                {outputs.map(([name, result]) => <div className="report-output" key={name}><span>{name} · {result?.predicted_class || '—'}</span><strong>{formatPercent(result?.positive_probability)}</strong></div>)}
              </div>
            ) : (
              <div className="report-empty"><div><strong>No prediction report yet</strong>Model results are not invented. Complete a real backend inference to include prediction values in a PDF.</div></div>
            )}
            <div style={{ marginTop: 13 }} className="info-notice"><Download size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Export files are assembled locally in the browser. The default report uses a synthetic session identifier and includes no unnecessary personal identifiers.</div>
          </div>
        </section>

        <div style={{ display: 'grid', gap: 13, alignContent: 'start' }}>
          <section className="panel">
            <div className="panel-header"><div className="panel-title-group"><h2 className="panel-title">Input snapshot</h2><p className="panel-kicker">{Object.keys(report?.input_values || {}).length} dataset-derived fields</p></div></div>
            <div className="panel-body">
              {Object.keys(report?.input_values || {}).length ? (
                <div className="field-summary-list" style={{ maxHeight: 250 }}>
                  {Object.entries(report.input_values).slice(0, 16).map(([name, value]) => <div className="summary-measurement" key={name}><span className="summary-measurement-name">{name}</span><span className="summary-measurement-value">{value === null || value === '' ? <i className="measurement-missing">Unknown</i> : String(value)}</span></div>)}
                  {Object.keys(report.input_values).length > 16 && <p className="safety-inline">The JSON export contains the complete feature record.</p>}
                </div>
              ) : <div className="chart-empty" style={{ minHeight: 70 }}>No inspected patient schema loaded.</div>}
            </div>
          </section>
          <section className="panel">
            <div className="panel-header"><div className="panel-title-group"><h2 className="panel-title">Report integrity</h2><p className="panel-kicker">Prototype output, not diagnostic documentation</p></div><ShieldCheck size={14} color="#e0a95c" /></div>
            <div className="panel-body">
              <p className="methodology-text">The report identifies synthetic-demo status, API model versions, input values, four independent predictions, available attribution, warnings, and known limitations.</p>
              <p className="methodology-text">PDF export is intended for hackathon research review. It does not establish a diagnosis, treatment plan, angiographic finding, or clinical risk category.</p>
              <div className="safety-banner" style={{ marginTop: 12 }}><AlertTriangle size={13} /><span><strong>Not for clinical decision-making.</strong> Use appropriate professional assessment and investigations.</span></div>
              <button type="button" className="btn btn-small" style={{ marginTop: 12 }} onClick={() => window.print()}><Printer size={12} /> Browser print / save as PDF</button>
            </div>
          </section>
        </div>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-header"><div className="panel-title-group"><h2 className="panel-title">Project limitations & interpretation</h2><p className="panel-kicker">Visible alongside exported analysis summaries.</p></div></div>
        <div className="panel-body"><ul className="methodology-text" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 7 }}>
          {(report?.limitations || ['Small source cohort; no external clinical validation.', 'The procedural heart model is schematic rather than patient-specific.', 'Attribution is approximate and not evidence of causality.']).map((item) => <li key={item}>{item}</li>)}
        </ul></div>
      </section>
    </div>
  );
}
