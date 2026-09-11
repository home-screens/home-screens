import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  extractDocsSchema,
  serializeDocsSchema,
  SCHEMA_OUTPUT,
  type DocsField,
  type DocsSchema,
} from '../../../scripts/extract-docs-schema';

/**
 * The docs' Module Reference, Configuration and API pages render their tables
 * from website/content/generated/schema.json (see scripts/extract-docs-schema.ts).
 * These tests keep that file in step with the code and every documented field
 * described, so drift fails here instead of on the website.
 */

const CONFIGURATION_PAGE = path.resolve(__dirname, '../../../website/content/docs/configuration.md');

let schema: DocsSchema;

beforeAll(() => {
  schema = extractDocsSchema();
}, 60_000);

/** Every documented field, labelled `<module or type>.<field>`. */
function documentedFields(): Array<[string, DocsField]> {
  const out: Array<[string, DocsField]> = [];
  for (const mod of schema.modules) {
    for (const field of mod.fields) out.push([`${mod.type}.${field.name}`, field]);
  }
  for (const type of Object.values(schema.types)) {
    if (type.kind === 'interface') {
      for (const field of type.fields) out.push([`${type.name}.${field.name}`, field]);
    } else if (type.kind === 'variants') {
      for (const variant of type.variants) {
        for (const field of variant.fields) out.push([`${type.name}.${variant.value}.${field.name}`, field]);
      }
    }
  }
  return out;
}

describe('docs schema', () => {
  it('matches the committed website/content/generated/schema.json', () => {
    const committed = fs.existsSync(SCHEMA_OUTPUT) ? fs.readFileSync(SCHEMA_OUTPUT, 'utf8') : '';
    expect(
      committed === serializeDocsSchema(schema),
      'website/content/generated/schema.json is out of date. Run `npm run docs:schema` and commit the result.',
    ).toBe(true);
  });

  it('lists every built-in module', () => {
    expect(schema.modules.length).toBeGreaterThan(0);
    expect(new Set(schema.modules.map((m) => m.anchor)).size).toBe(schema.modules.length);
  });

  it('describes every documented field', () => {
    // The description is the first paragraph of the field's JSDoc comment.
    const missing = documentedFields().filter(([, f]) => !f.description).map(([name]) => name);
    expect(missing, 'Write a JSDoc comment for these fields, then run `npm run docs:schema`').toEqual([]);
  });

  it('describes every variant of the union types the Configuration page lists', () => {
    const missing = Object.values(schema.types).flatMap((type) =>
      type.kind === 'variants'
        ? type.variants.filter((v) => !v.description).map((v) => `${type.name}.${v.value}`)
        : [],
    );
    expect(missing, 'Write a JSDoc comment on the `kind` of these variants').toEqual([]);
  });

  it('keeps developer shorthand out of the rendered descriptions', () => {
    // A description is shown to users; developer notes belong after a blank
    // line in the comment, which the docs never render.
    const leaks = documentedFields()
      .filter(([, f]) => /—|\bplan \d|\bitem \d/i.test(f.description))
      .map(([name, f]) => `${name}: ${f.description}`);
    expect(leaks).toEqual([]);
  });

  it('shows the current schema version in the Configuration example', () => {
    // A fenced code block cannot use the {% $schemaVersion %} variable.
    const page = fs.readFileSync(CONFIGURATION_PAGE, 'utf8');
    expect(page).toContain(`"version": ${schema.schemaVersion},`);
  });
});
