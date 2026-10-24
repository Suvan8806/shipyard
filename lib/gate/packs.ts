// W0 STUB (Lane B implements template filling from {{account}}/{{member}}/{{own_email}} and requires_tools filtering).
import type { ExpandTestPacksFn, Scenario } from '../types';
import { PACKS } from '../library';

export const expandTestPacks: ExpandTestPacksFn = (spec) => {
  const out: Scenario[] = [];
  for (const packName of spec.test_packs) {
    const pack = PACKS.find((p) => p.name === packName);
    if (!pack) continue;
    for (const { requires_tools, ...t } of pack.templates) {
      if (!requires_tools.every((tool) => spec.tools.includes(tool))) continue;
      out.push({ ...t, name: `${pack.name}/${t.name}`, source: 'pack', pack: pack.name });
    }
  }
  return out;
};
