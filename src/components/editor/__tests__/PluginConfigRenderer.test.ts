import { describe, it, expect } from 'vitest';
import { inferWidget, isFieldVisible } from '../PluginConfigRenderer';


describe('inferWidget', () => {
  it('infers toggle for boolean', () => {
    expect(inferWidget({ type: 'boolean' })).toBe('toggle');
  });

  it('infers select for enum', () => {
    expect(inferWidget({ type: 'string', enum: ['a', 'b'] })).toBe('select');
  });

  it('infers slider for number with min and max', () => {
    expect(inferWidget({ type: 'number', minimum: 0, maximum: 100 })).toBe('slider');
  });

  it('infers number for number without bounds', () => {
    expect(inferWidget({ type: 'number' })).toBe('number');
  });

  it('infers number for number with only min', () => {
    expect(inferWidget({ type: 'number', minimum: 0 })).toBe('number');
  });

  it('infers text for string', () => {
    expect(inferWidget({ type: 'string' })).toBe('text');
  });

  it('infers array for type array', () => {
    expect(inferWidget({ type: 'array', items: { type: 'string' } })).toBe('array');
  });

  it('infers object for type object', () => {
    expect(inferWidget({ type: 'object', properties: { name: { type: 'string' } } })).toBe('object');
  });

  it('prefers enum over number range (select wins)', () => {
    expect(inferWidget({ type: 'number', enum: [1, 2, 3], minimum: 1, maximum: 3 })).toBe('select');
  });
});

describe('isFieldVisible', () => {
  const schemaProperties = {
    view: { type: 'string' as const, default: 'dashboard' },
    showMap: {
      type: 'boolean' as const,
      'ui:showWhen': { field: 'view', equals: 'latest-hero' },
    },
    units: { type: 'string' as const },
  };

  it('is visible without a ui:showWhen condition', () => {
    expect(isFieldVisible(schemaProperties.units, {}, schemaProperties)).toBe(true);
  });

  it('is visible when the config value matches', () => {
    expect(
      isFieldVisible(schemaProperties.showMap, { view: 'latest-hero' }, schemaProperties),
    ).toBe(true);
  });

  it('is hidden when the config value differs', () => {
    expect(
      isFieldVisible(schemaProperties.showMap, { view: 'heatmap' }, schemaProperties),
    ).toBe(false);
  });

  it('falls back to the controlling field schema default when config is unset', () => {
    expect(isFieldVisible(schemaProperties.showMap, {}, schemaProperties)).toBe(false);
    const showOnDefault = {
      type: 'boolean' as const,
      'ui:showWhen': { field: 'view', equals: 'dashboard' },
    };
    expect(isFieldVisible(showOnDefault, {}, schemaProperties)).toBe(true);
  });

  it('is hidden when the condition references an unknown field', () => {
    const orphan = {
      type: 'boolean' as const,
      'ui:showWhen': { field: 'missing', equals: 'x' },
    };
    expect(isFieldVisible(orphan, {}, schemaProperties)).toBe(false);
  });
});
