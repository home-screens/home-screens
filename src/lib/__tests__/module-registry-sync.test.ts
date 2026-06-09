// @vitest-environment jsdom
//
// Guards the module registration chain: every builtin module must be present
// in the registry (module-registry.ts), the component map (module-components.ts),
// and the editor config sections (PropertyPanel.tsx). The component map and
// CONFIG_SECTIONS are typed Record<BuiltinModuleType, ...>, so TypeScript
// already enforces them against the union — this test closes the remaining
// gap (the registry is a plain array the compiler can't check for coverage)
// and catches drift at runtime even if a future refactor loosens the types.

import { describe, it, expect } from 'vitest';
import { getAllModuleDefinitions } from '@/lib/module-registry';
import { BUILTIN_COMPONENT_TYPES } from '@/lib/module-components';
import { CONFIG_SECTIONS } from '@/components/editor/PropertyPanel';

const registryTypes = getAllModuleDefinitions()
  .map((d) => d.type)
  .filter((t) => !t.startsWith('plugin:'))
  .sort();
const componentTypes = [...BUILTIN_COMPONENT_TYPES].sort();
const configSectionTypes = Object.keys(CONFIG_SECTIONS).sort();

describe('module registry sync', () => {
  it('has no duplicate registry entries', () => {
    expect(new Set(registryTypes).size).toBe(registryTypes.length);
  });

  it('registers a component for every registry entry (and nothing extra)', () => {
    expect(componentTypes).toEqual(registryTypes);
  });

  it('has an editor config section for every registry entry (and nothing extra)', () => {
    expect(configSectionTypes).toEqual(registryTypes);
  });
});
