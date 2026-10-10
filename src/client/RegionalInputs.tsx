import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  formatDateInput,
  formatDateTimeInput,
  number,
  parseDateInput,
  parseDateTimeInput,
  parseDecimal,
  parseEuroCents,
  utcDateTime,
} from './api';
import type { ServiceAnswers } from '../shared/types';
import { visibleServiceFields, type ServiceForm } from '../shared/serviceForms';

type BaseProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step'
>;
type NumberProps = BaseProps & {
  value?: string | number;
  defaultValue?: string | number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  decimalPlaces?: number;
  onValueChange?: (value: string) => void;
};
const numberText = (value: string | number | undefined) =>
  typeof value === 'number' ? number(value) : (value ?? '');

function normalizedNumberText(text: string, decimalPlaces?: number) {
  const [integer, fraction] = text
    .trim()
    .replace(/[ \u00a0\u202f]/g, '')
    .replace(',', '.')
    .split('.');
  const grouped = integer
    .replace(/^([+-]?)0+(?=\d)/, '$1')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return (
    grouped +
    (decimalPlaces === 2
      ? ',' + (fraction ?? '').padEnd(2, '0')
      : fraction === undefined
        ? ''
        : ',' + fraction)
  );
}

export function RegionalNumberInput({
  value,
  defaultValue,
  min,
  max,
  step,
  decimalPlaces,
  onValueChange,
  onBlur,
  onInvalid,
  ...props
}: NumberProps) {
  const [internal, setInternal] = useState(() => numberText(defaultValue));
  const input = useRef<HTMLInputElement>(null);
  const raw = value === undefined ? internal : numberText(value);
  const problem = (text: string) => {
    if (!text.trim()) return props.required ? 'Sisesta arv.' : '';
    try {
      const parsed = parseDecimal(text);
      if (decimalPlaces === 2) parseEuroCents(text);
      if (min !== undefined && parsed < Number(min))
        return `Sisesta vähemalt ${number(Number(min))}.`;
      if (max !== undefined && parsed > Number(max)) return `Sisesta kuni ${number(Number(max))}.`;
      if (step !== undefined && step !== 'any') {
        const quotient = (parsed - Number(min ?? 0)) / Number(step);
        if (Math.abs(quotient - Math.round(quotient)) > 1e-7)
          return Number(step) === 1
            ? 'Sisesta täisarv.'
            : `Sisesta arv sammuga ${number(Number(step))}.`;
      }
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : 'Sisesta korrektne arv.';
    }
  };
  useEffect(() => {
    input.current?.setCustomValidity(problem(raw));
  });
  const update = (text: string) => {
    setInternal(text);
    onValueChange?.(text);
    input.current?.setCustomValidity(problem(text));
  };
  return (
    <input
      {...props}
      ref={input}
      type="text"
      inputMode={step === 1 || step === '1' ? 'numeric' : 'decimal'}
      maxLength={props.maxLength ?? 96}
      value={raw}
      onChange={(event) => update(event.target.value)}
      onBlur={(event) => {
        if (raw.trim() && !problem(raw)) update(normalizedNumberText(raw, decimalPlaces));
        onBlur?.(event);
      }}
      onInvalid={(event) => {
        event.currentTarget.setCustomValidity(problem(event.currentTarget.value));
        onInvalid?.(event);
      }}
    />
  );
}

type DateProps = BaseProps & {
  mode?: 'date' | 'datetime';
  value?: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  calendarLabel?: string;
  onValueChange?: (value: string) => void;
};

export function RegionalDateInput({
  mode = 'date',
  value,
  defaultValue,
  min,
  max,
  calendarLabel,
  onValueChange,
  onBlur,
  onInvalid,
  className = '',
  ...props
}: DateProps) {
  const format = mode === 'datetime' ? formatDateTimeInput : formatDateInput;
  const parse = mode === 'datetime' ? parseDateTimeInput : parseDateInput;
  const display = (text: string) => {
    try {
      return format(text);
    } catch {
      return text;
    }
  };
  const [internal, setInternal] = useState(() => display(defaultValue ?? ''));
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const raw = value === undefined ? internal : /^\d{4}-/.test(value) ? display(value) : value;
  const problem = (text: string) => {
    if (!text.trim()) return props.required ? 'Sisesta kuupäev.' : '';
    try {
      const canonical = parse(text);
      if (mode === 'datetime') utcDateTime(canonical);
      if (min && canonical < min) return `Vali kuupäev alates ${format(min)}.`;
      if (max && canonical > max) return `Vali kuupäev kuni ${format(max)}.`;
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : 'Sisesta korrektne kuupäev.';
    }
  };
  useEffect(() => {
    input.current?.setCustomValidity(problem(raw));
  });
  const update = (text: string) => {
    setInternal(text);
    onValueChange?.(text);
    input.current?.setCustomValidity(problem(text));
  };
  let canonical = '';
  try {
    canonical = parse(raw);
  } catch {
    // Partial text remains editable and is validated before submission.
  }
  return (
    <div className="regional-date-input">
      <input
        {...props}
        className={'regional-date-text ' + className}
        ref={input}
        type="text"
        placeholder={props.placeholder ?? (mode === 'datetime' ? 'pp.kk.aaaa hh:mm' : 'pp.kk.aaaa')}
        autoComplete="off"
        maxLength={32}
        value={raw}
        onChange={(event) => update(event.target.value)}
        onBlur={(event) => {
          if (raw.trim() && !problem(raw)) update(format(raw));
          onBlur?.(event);
        }}
        onInvalid={(event) => {
          event.currentTarget.setCustomValidity(problem(event.currentTarget.value));
          onInvalid?.(event);
        }}
      />
      {!props.readOnly && (
        <button
          type="button"
          className="regional-calendar-button"
          aria-label={
            calendarLabel
              ? `${calendarLabel}: vali kalendrist`
              : mode === 'datetime'
                ? 'Vali kuupäev ja kellaaeg kalendrist'
                : 'Vali kuupäev kalendrist'
          }
          disabled={props.disabled}
          onClick={() => {
            if (!picker.current) return;
            if (typeof picker.current.showPicker === 'function') picker.current.showPicker();
            else picker.current.click();
          }}
        >
          <CalendarDays size={18} aria-hidden="true" />
        </button>
      )}
      <input
        ref={picker}
        className="regional-native-picker"
        type={mode === 'datetime' ? 'datetime-local' : 'date'}
        aria-hidden="true"
        tabIndex={-1}
        disabled={props.disabled}
        min={min}
        max={max}
        value={canonical}
        onChange={(event) => update(event.target.value ? format(event.target.value) : '')}
      />
    </div>
  );
}

/** Keep regional text out of the typed numeric/date REST specification. */
export function normalizeServiceInputAnswers(form: ServiceForm, source: ServiceAnswers) {
  const answers = { ...source };
  const issues: Array<{ fieldId: string; message: string }> = [];
  for (const field of visibleServiceFields(form, source)) {
    const value = source[field.id];
    if (typeof value !== 'string' || !value.trim() || !['number', 'date'].includes(field.type))
      continue;
    try {
      answers[field.id] = field.type === 'number' ? parseDecimal(value) : parseDateInput(value);
    } catch (error) {
      issues.push({
        fieldId: field.id,
        message:
          field.label + ': ' + (error instanceof Error ? error.message : 'Kontrolli väärtust.'),
      });
    }
  }
  return { answers, issues };
}
