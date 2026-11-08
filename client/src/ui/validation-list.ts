/**
 * Validation results in spec §3.5 order, in words. Errors reject the load and show their JSON-pointer path;
 * warnings offer their fix; privacy notices go in a details view, never a dialog (D2 handoff).
 */
import type { ValidationCheckId, ValidationFix, ValidationResult } from '../contracts';
import { h } from './dom';

const ORDER: ValidationCheckId[] = ['schema', 'units', 'axes', 'graph', 'radii', 'mesh_budget', 'privacy', 'physics'];

const AXIS_NAME: Record<'R' | 'A' | 'S', string> = { R: 'left–right', A: 'front–back', S: 'head–foot' };

export function fixLabel(fix: ValidationFix): string {
  switch (fix.kind) {
    case 'rescale':
      return fix.factor === 1000 ? 'Rescale ×1000' : 'Rescale ÷1000';
    case 'flip_axes':
      return `Flip the ${AXIS_NAME[fix.axis]} axis`;
    case 'decimate':
      return `Simplify to ${fix.targetTriangles.toLocaleString('en-US')} triangles`;
  }
}

export function inSpecOrder(results: readonly ValidationResult[]): ValidationResult[] {
  return [...results].sort((a, b) => ORDER.indexOf(a.check) - ORDER.indexOf(b.check));
}

const SEVERITY: Record<ValidationResult['severity'], { label: string; pill: string }> = {
  error: { label: 'Rejected', pill: 'pill-negative' },
  warning: { label: 'Warning', pill: 'pill-warning' },
  notice: { label: 'Notice', pill: 'pill-neutral' },
};

function item(r: ValidationResult, onFix?: (fix: ValidationFix) => void): HTMLLIElement {
  const s = SEVERITY[r.severity];
  const fixButton =
    r.fix && onFix
      ? h('button', { type: 'button', class: 'btn btn-secondary btn-small', 'data-fix': r.fix.kind }, fixLabel(r.fix))
      : null;
  if (fixButton && r.fix) {
    const fix = r.fix;
    fixButton.addEventListener('click', () => {
      fixButton.setAttribute('disabled', '');
      fixButton.textContent = 'Applying…';
      onFix?.(fix);
    });
  }
  return h(
    'li',
    { class: `check check-${r.severity}`, 'data-check': r.check },
    h('span', { class: `pill ${s.pill}` }, s.label),
    h('div', { class: 'check-body' }, h('p', { class: 'check-message' }, r.message), r.path ? h('code', { class: 'check-path' }, r.path) : null),
    fixButton,
  );
}

/** Renders results; `onFix` is called with a warning's fix when the player accepts it. */
export function validationList(results: readonly ValidationResult[], onFix?: (fix: ValidationFix) => void): HTMLElement | null {
  const ordered = inSpecOrder(results);
  const shown = ordered.filter((r) => r.severity !== 'notice');
  const notices = ordered.filter((r) => r.severity === 'notice');
  if (!shown.length && !notices.length) return null;
  return h(
    'div',
    { class: 'checks' },
    shown.length ? h('ul', { class: 'check-list' }, shown.map((r) => item(r, onFix))) : null,
    notices.length
      ? h(
          'details',
          { class: 'notices' },
          h('summary', {}, `${notices.length} ${notices.length === 1 ? 'notice' : 'notices'} from the checks`),
          h('ul', { class: 'check-list' }, notices.map((r) => item(r))),
        )
      : null,
  );
}
