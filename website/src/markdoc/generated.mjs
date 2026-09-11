import Markdoc from '@markdoc/markdoc'
import * as fs from 'fs'
import * as path from 'path'

/**
 * The Reference pages' generated parts. `content/generated/schema.json` is
 * written by `npm run docs:schema` in the main repo (scripts/extract-docs-schema.ts)
 * from the module registry, the config types and the API route files. Three
 * tags read it:
 *
 *   {% module-reference %} ... {% /module-reference %}
 *     Every built-in module, category by category, with a table of its config
 *     fields. Hand-written prose goes in `{% category name="..." %}` and
 *     `{% module type="..." %}` blocks inside it; in a module block,
 *     `{% fields /%}` marks where the table goes (text after it follows the
 *     table). `{% module-reference type="clock" /%}` renders one module's table.
 *
 *   {% type-reference name="GlobalSettings" /%}
 *     One config type as a table (or its values, or one table per variant).
 *
 *   {% endpoint-list /%}
 *     Every API route with the access each method needs.
 *
 * The tags are expanded into ordinary Markdoc nodes before anything else sees
 * the page, rather than rendered by a component, because the table of contents
 * and the search index are both built from the page's nodes: a component's
 * headings would be missing from both.
 */

const GENERATED_TAGS = new Set(['module-reference', 'type-reference', 'endpoint-list'])

const ACCESS_LABELS = {
  open: 'Open',
  session: 'Session',
  display: 'Display',
  media: 'Media',
  adopted: 'Adopted display',
}

const schemaCache = new Map()

export function schemaPath(contentDir = path.join(process.cwd(), 'content')) {
  return path.join(contentDir, 'generated', 'schema.json')
}

/** schema.json, re-read whenever it changes on disk. */
export function loadDocsSchema(contentDir) {
  const file = schemaPath(contentDir)
  const mtime = fs.statSync(file).mtimeMs
  const cached = schemaCache.get(file)
  if (cached?.mtime === mtime) return cached.schema
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'))
  schemaCache.set(file, { mtime, schema })
  return schema
}

// ---------------------------------------------------------------------------
// Markdown builders
// ---------------------------------------------------------------------------

function code(text) {
  return '`' + String(text) + '`'
}

/** Table cells are one line, and a pipe would end the cell. */
function cell(text) {
  return String(text).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|')
}

function table(header, rows) {
  return [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n')
}

function formatDefault(field, documentedTypes) {
  if (field.default !== undefined) {
    const json = JSON.stringify(field.default)
    if (json.length <= 40) return code(json)
    if (Array.isArray(field.default)) {
      return field.default.length === 1 ? 'one entry' : `${field.default.length} entries`
    }
    // A nested settings object has its own table on the page.
    return documentedTypes?.has(field.type.text) ? `see ${code(field.type.text)}` : 'an object'
  }
  if (field.defaultText) {
    try {
      JSON.parse(field.defaultText)
      return code(field.defaultText)
    } catch {
      return field.defaultText
    }
  }
  return 'unset'
}

/**
 * The description, plus the allowed values when the description does not
 * already name every one of them, so a value added to the type always shows.
 */
function describe(field) {
  const values = field.type.values
  const text = field.description
  if (!values || values.length < 2) return text
  if (values.every((value) => text.includes(code(value)))) return text
  const list = values.map(code).join(', ')
  return text ? `${text}. One of ${list}`.replace(/\.\. One of/, '. One of') : `One of ${list}`
}

function moduleTypeLabel(field) {
  return field.type.kind
}

function configTypeLabel(field) {
  if (field.type.values?.length === 1) return code(JSON.stringify(field.type.values[0]))
  if (field.type.values) return field.type.kind
  return code(field.type.text)
}

function fieldsTable(fields, { typeLabel, fieldName, documentedTypes }) {
  const withDefaults = fields.some((f) => f.default !== undefined || f.defaultText)
  const header = withDefaults ? ['Field', 'Type', 'Default', 'Description'] : ['Field', 'Type', 'Description']
  const rows = fields.map((field) => {
    const row = [fieldName(field), typeLabel(field)]
    if (withDefaults) row.push(formatDefault(field, documentedTypes))
    row.push(describe(field))
    return row
  })
  return table(header, rows)
}

function moduleFieldsTable(module) {
  return fieldsTable(module.fields, {
    typeLabel: moduleTypeLabel,
    fieldName: (field) => code(field.name),
  }).replace(/^\| Field \|/, '| Option |')
}

function moduleFacts(module) {
  const facts = [`**Type** ${code(module.type)}`, `**Default size** ${module.defaultSize.w} × ${module.defaultSize.h}`]
  if (module.fillsCanvas) facts.push('fills the whole display')
  return facts.join(' · ')
}

function parse(markdown) {
  return Markdoc.parse(markdown).children
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

function blocksByAttribute(node, tag, attribute) {
  const found = new Map()
  for (const child of node.children) {
    if (child.type !== 'tag') continue
    if (child.tag !== tag) continue
    const key = child.attributes[attribute]
    if (found.has(key)) throw new Error(`{% ${tag} ${attribute}="${key}" %} appears twice`)
    found.set(key, child)
  }
  return found
}

/** A module block's prose, split at `{% fields /%}` into before and after the table. */
function splitAtFields(block) {
  if (!block) return { intro: [], notes: [] }
  const at = block.children.findIndex((child) => child.type === 'tag' && child.tag === 'fields')
  if (at === -1) return { intro: block.children, notes: [] }
  return { intro: block.children.slice(0, at), notes: block.children.slice(at + 1) }
}

function expandModuleReference(node, schema) {
  const only = node.attributes.type
  if (only) {
    const mod = schema.modules.find((m) => m.type === only)
    if (!mod) throw new Error(`{% module-reference type="${only}" %}: no such built-in module`)
    return parse(moduleFieldsTable(mod))
  }

  for (const child of node.children) {
    const allowed = child.type === 'tag' && (child.tag === 'module' || child.tag === 'category')
    if (!allowed) {
      throw new Error('{% module-reference %} may only contain {% module %} and {% category %} blocks')
    }
  }
  const modules = blocksByAttribute(node, 'module', 'type')
  const categories = blocksByAttribute(node, 'category', 'name')
  for (const type of modules.keys()) {
    if (!schema.modules.some((m) => m.type === type)) {
      throw new Error(`{% module type="${type}" %}: no such built-in module (renamed or removed?)`)
    }
  }
  for (const name of categories.keys()) {
    if (!schema.categories.includes(name)) {
      throw new Error(`{% category name="${name}" %}: no built-in module is in that category`)
    }
  }

  const out = []
  schema.categories.forEach((category, index) => {
    if (index > 0) out.push(...parse('---'))
    out.push(...parse(`## ${category}`))
    out.push(...(categories.get(category)?.children ?? []))
    for (const mod of schema.modules.filter((m) => m.category === category)) {
      const { intro, notes } = splitAtFields(modules.get(mod.type))
      out.push(...parse(`### ${mod.label} {% #${mod.anchor} %}`))
      out.push(...intro)
      out.push(...parse(moduleFacts(mod)))
      out.push(...parse(moduleFieldsTable(mod)))
      out.push(...notes)
    }
  })
  return out
}

function expandTypeReference(node, schema) {
  const name = node.attributes.name
  const type = schema.types[name]
  if (!type) {
    throw new Error(`{% type-reference name="${name}" %} is not in schema.json. Run \`npm run docs:schema\` in the main repo.`)
  }
  const options = {
    typeLabel: configTypeLabel,
    fieldName: (field) => code(field.optional ? `${field.name}?` : field.name),
    documentedTypes: new Set(Object.keys(schema.types)),
  }
  if (type.kind === 'values') {
    return parse(`One of ${type.values.map(code).join(', ')}.`)
  }
  if (type.kind === 'variants') {
    return type.variants.flatMap((variant) => {
      const heading = `**${code(`${type.discriminant}: "${variant.value}"`)}**`
      const lead = variant.description ? `${heading}: ${variant.description}` : heading
      return [
        ...parse(lead),
        ...(variant.fields.length ? parse(fieldsTable(variant.fields, options)) : []),
      ]
    })
  }
  return parse(fieldsTable(type.fields, options))
}

function expandEndpointList(schema) {
  const rows = schema.routes.map((route) => {
    const levels = new Set(route.methods.map((m) => m.access))
    const access = levels.size === 1
      ? ACCESS_LABELS[route.methods[0].access]
      : route.methods.map((m) => `${m.method} ${ACCESS_LABELS[m.access].toLowerCase()}`).join(', ')
    return [code(route.path), route.methods.map((m) => m.method).join(', '), access]
  })
  return parse(table(['Endpoint', 'Methods', 'Access'], rows))
}

function expand(node, schema) {
  switch (node.tag) {
    case 'module-reference':
      return expandModuleReference(node, schema)
    case 'type-reference':
      return expandTypeReference(node, schema)
    case 'endpoint-list':
      return expandEndpointList(schema)
  }
  return null
}

/**
 * Replace every generated tag in a parsed page with the nodes it stands for.
 * Mutates and returns `ast`.
 */
export function expandGeneratedTags(ast, contentDir) {
  let schema
  const walk = (node) => {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      if (child.type === 'tag' && GENERATED_TAGS.has(child.tag)) {
        schema ??= loadDocsSchema(contentDir)
        const replacement = expand(child, schema)
        node.children.splice(i, 1, ...replacement)
        i += replacement.length - 1
        continue
      }
      walk(child)
    }
  }
  walk(ast)
  return ast
}
