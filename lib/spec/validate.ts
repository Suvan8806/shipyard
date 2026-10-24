// W0 STUB (Lane A implements). Parses spec YAML + scenario YAMLs and validates against the library.
import type { ValidateSpecFn } from '../types';

export const validateSpec: ValidateSpecFn = (specYaml, scenarios) => {
  if (!specYaml.trim()) return { ok: false, errors: [{ path: 'spec', message: 'spec is empty' }] };
  if (Object.keys(scenarios).length === 0) {
    return { ok: false, errors: [{ path: 'scenarios', message: 'at least one scenario is required' }] };
  }
  // Stub: accept everything else. Lane A returns the parsed spec + scenarios too.
  return { ok: true, errors: [] };
};
