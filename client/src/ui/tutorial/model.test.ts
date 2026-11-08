import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LoadedCase } from '../../contracts';
import { advance, shouldStart, STEP_SCREEN, STEPS, stepText, tutorialCase, visible, type View } from './model';

const at = (screen: View['screen'], over: Partial<View> = {}): View => ({ screen, onTutorialCase: true, routeComplete: false, targetReached: false, ...over });

describe('tutorial steps', () => {
  it('walks Plan → Compare → Drive on real actions only', () => {
    let s = advance('open-case', at('library', { onTutorialCase: false }));
    expect(s).toBe('open-case');
    s = advance(s, at('brief'));
    expect(s).toBe('start-planning');
    s = advance(s, at('plan'));
    expect(s).toBe('build-route');
    s = advance(s, at('plan')); // nothing happened: no timer moves it on
    expect(s).toBe('build-route');
    s = advance(s, at('plan', { routeComplete: true }));
    expect(s).toBe('compare');
    s = advance(s, at('compare'));
    expect(s).toBe('start-drive');
    s = advance(s, at('drive'));
    expect(s).toBe('drive');
    s = advance(s, at('drive', { targetReached: true }));
    expect(s).toBe('finish');
    expect(advance(s, at('results'))).toBe('done');
  });

  it('never advances on another case, and undoing the route goes back to building it', () => {
    expect(advance('build-route', at('plan', { onTutorialCase: false, routeComplete: true }))).toBe('build-route');
    expect(advance('compare', at('plan', { routeComplete: false }))).toBe('build-route');
    expect(advance('done', at('plan'))).toBe('done');
  });

  it('opening the Plan straight from the Library catches up through the brief step', () => {
    expect(advance('open-case', at('plan'))).toBe('build-route');
  });

  it('shows each step only on its own screen and case', () => {
    for (const s of STEPS) {
      expect(visible(s, at(STEP_SCREEN[s]))).toBe(true);
      expect(visible(s, at(STEP_SCREEN[s] === 'results' ? 'library' : 'results'))).toBe(false);
    }
    expect(visible('open-case', at('library', { onTutorialCase: false }))).toBe(true);
    expect(visible('build-route', at('plan', { onTutorialCase: false }))).toBe(false);
  });

  it('has no numbers in its words', () => {
    for (const s of STEPS) expect(stepText(s, 'A case')).not.toMatch(/\d/);
  });

  it('starts only for a first-time trainee', () => {
    expect(shouldStart(0, false)).toBe(true);
    expect(shouldStart(1, false)).toBe(false);
    expect(shouldStart(0, true)).toBe(false);
  });
});

describe('the tutorial case', () => {
  const meta = (id: string): LoadedCase => {
    const json = JSON.parse(readFileSync(join(process.cwd(), 'client', 'public', 'cases', id, 'case.json'), 'utf8')) as { anatomy?: LoadedCase['anatomy'] };
    return { id, anatomy: json.anatomy } as LoadedCase;
  };

  it('is the lowest ladder tier among the bundled cases: the low-tortuosity arch', () => {
    expect(tutorialCase(['fixture-y', 'type-iii', 'low-tort'].map(meta))?.id).toBe('low-tort');
  });

  it('is none when no case is on the ladder', () => {
    expect(tutorialCase([{ id: 'x' } as LoadedCase])).toBeNull();
  });
});
