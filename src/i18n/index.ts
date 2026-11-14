/**
 * Translation, with no new dependency.
 *
 * The brief for this project says no unused dependencies, and an i18n library
 * would earn its weight only with plurals, dates and lazy-loaded catalogues.
 * This console needs a lookup and `{placeholder}` substitution, which is the
 * twenty lines below.
 *
 * English is the default: the Space Apps judges are international, so the
 * published link opens in English and Turkish is one click away. The choice is
 * remembered per browser.
 */

import { en } from './en';
import type { MessageKey, Messages } from './en';
import { tr } from './tr';

export type Locale = 'en' | 'tr';
export type { MessageKey };

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'tr', label: 'TR' },
];

const CATALOGUES: Record<Locale, Messages> = { en, tr };

const STORAGE_KEY = 'marswalk.locale';

/** What the browser remembered, or English. */
export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'tr') return saved;
  } catch {
    // Private windows and blocked site data both throw here. English is fine.
  }
  return 'en';
}

export function rememberLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not being able to remember the choice is not a reason to fail the switch.
  }
  if (typeof document !== 'undefined') {
    // Screen readers pick pronunciation from this, so it has to follow.
    document.documentElement.lang = locale;
  }
}

/**
 * Look up `key` and substitute `{name}` placeholders.
 *
 * A missing placeholder is left in the string rather than blanked, so the gap
 * is obvious in the UI instead of producing a sentence with a hole in it.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const text = CATALOGUES[locale][key] ?? en[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export type Translator = (key: MessageKey, vars?: Record<string, string | number>) => string;
