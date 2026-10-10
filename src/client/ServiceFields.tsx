import type { ServiceAnswers, ServiceAnswer } from '../shared/types';
import { visibleServiceFields, type ServiceForm } from '../shared/serviceForms';

export interface ServiceFieldIssue {
  fieldId: string;
  message: string;
}

export default function ServiceFields({
  form,
  answers,
  issues,
  onChange,
}: {
  form: ServiceForm;
  answers: ServiceAnswers;
  issues: ServiceFieldIssue[];
  onChange: (fieldId: string, value: ServiceAnswer) => void;
}) {
  return (
    <div className="field-grid service-fields">
      {visibleServiceFields(form, answers).map((field) => {
        const value = answers[field.id];
        const issue = issues.find((item) => item.fieldId === field.id);
        const controlId = 'service-' + field.id;
        const helpId = controlId + '-help';
        const props = {
          id: controlId,
          name: field.id,
          'aria-invalid': !!issue,
          'aria-describedby': field.hint || issue ? helpId : undefined,
          required: field.required,
        };
        const help = (field.hint || issue) && (
          <div id={helpId} className="service-field-help">
            {field.hint && <small>{field.hint}</small>}
            {issue && (
              <p className="service-field-error" role="alert">
                {issue.message}
              </p>
            )}
          </div>
        );
        if (field.type === 'multiselect') {
          return (
            <div className="field field-span" key={field.id}>
              <fieldset
                id={controlId}
                className="service-multiselect"
                aria-invalid={!!issue}
                aria-describedby={field.hint || issue ? helpId : undefined}
              >
                <legend>
                  {field.label}
                  {field.required && <span aria-hidden="true"> *</span>}
                </legend>
                <div className="service-options">
                  {field.options?.map((option) => (
                    <label key={option.value} className="checkbox">
                      <input
                        type="checkbox"
                        name={field.id}
                        value={option.value}
                        checked={Array.isArray(value) && value.includes(option.value)}
                        aria-invalid={!!issue}
                        aria-describedby={issue ? helpId : undefined}
                        onChange={(event) => {
                          const selected = Array.isArray(value) ? value : [];
                          onChange(
                            field.id,
                            event.target.checked
                              ? [...selected, option.value]
                              : selected.filter((item) => item !== option.value),
                          );
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {help}
            </div>
          );
        }
        if (field.type === 'checkbox') {
          return (
            <div className="field service-checkbox-field" key={field.id}>
              <label className="checkbox" htmlFor={controlId}>
                <input
                  {...props}
                  type="checkbox"
                  checked={value === true}
                  onChange={(event) => onChange(field.id, event.target.checked)}
                />
                <span>{field.label}</span>
              </label>
              {help}
            </div>
          );
        }
        return (
          <div
            className={'field' + (field.type === 'textarea' ? ' field-span' : '')}
            key={field.id}
          >
            <label htmlFor={controlId}>
              {field.label}
              {field.required && <span aria-hidden="true"> *</span>}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                {...props}
                value={typeof value === 'string' ? value : ''}
                rows={4}
                maxLength={field.max}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            ) : field.type === 'select' ? (
              <select
                {...props}
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(field.id, event.target.value)}
              >
                <option value="">Vali…</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                {...props}
                type={field.type}
                value={typeof value === 'string' || typeof value === 'number' ? value : ''}
                min={field.min}
                max={field.type === 'number' ? field.max : undefined}
                step={field.step}
                maxLength={field.type === 'text' ? field.max : undefined}
                onChange={(event) =>
                  onChange(
                    field.id,
                    field.type === 'number' && event.target.value !== ''
                      ? Number(event.target.value)
                      : event.target.value,
                  )
                }
              />
            )}
            {help}
          </div>
        );
      })}
    </div>
  );
}
