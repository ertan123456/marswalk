/**
 * The translator hook.
 *
 * Kept apart from `index.ts` so the pipeline-side and test-side code can use
 * `translate()` without pulling React or the store in with it.
 */

import { useMission } from '../store/useMission';
import { translate } from './index';
import type { MessageKey } from './en';

export function useT() {
  const locale = useMission((s) => s.locale);
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
}

export function useLocale() {
  return useMission((s) => s.locale);
}
