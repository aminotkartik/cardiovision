import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PatientForm from './PatientForm';

afterEach(() => cleanup());

const schema = {
  available: true,
  fields: [
    { name: 'Age', label: 'Age', type: 'numeric', unit: 'years', group: 'demographics', options: [], observed_range: { min: 30, max: 86 }, missing_supported: true },
    { name: 'Sex', label: 'Sex', type: 'categorical', group: 'demographics', options: ['Female', 'Male'], observed_range: null, missing_supported: true },
  ],
};

function renderForm(overrides = {}) {
  const props = {
    schema,
    values: { Age: null, Sex: null },
    onChange: vi.fn(),
    onReset: vi.fn(),
    onValidate: vi.fn(),
    onAnalyze: vi.fn(),
    onUseDemo: vi.fn(),
    loading: false,
    demoLoading: false,
    demoMode: false,
    inferenceAvailable: false,
    validation: { valid: true, errors: {} },
    validationMessage: '',
    ...overrides,
  };
  return { ...render(<PatientForm {...props} />), props };
}

describe('PatientForm', () => {
  it('shows unknown values as blank, not zero, and keeps a demo button', () => {
    renderForm();
    expect(screen.getByLabelText('Age')).toHaveValue(null);
    expect(screen.getByLabelText('Sex')).toHaveValue('');
    expect(screen.getByRole('button', { name: /load synthetic demo/i })).toBeEnabled();
  });

  it('routes validate, demo, reset and analyze actions to their handlers', () => {
    const { props } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /validate patient/i }));
    fireEvent.click(screen.getByRole('button', { name: /load synthetic demo/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset values/i }));
    fireEvent.click(screen.getByRole('button', { name: /analyze patient/i }));
    expect(props.onValidate).toHaveBeenCalledOnce();
    expect(props.onUseDemo).toHaveBeenCalledOnce();
    expect(props.onReset).toHaveBeenCalledOnce();
    expect(props.onAnalyze).toHaveBeenCalledOnce();
  });

  it('exposes field errors and blocks submission during a real request', () => {
    renderForm({
      validation: { valid: false, errors: { Age: 'Enter a finite numeric value.' } },
      loading: true,
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a finite numeric value');
    expect(screen.getByRole('button', { name: /analyzing/i })).toBeDisabled();
  });
});
