/**
 * Extract what the docs' Reference pages list from the code itself, so the
 * pages cannot drift from it:
 *
 *   - every built-in module (registry order) with its config fields, their
 *     types, the registry defaults and the JSDoc summary of each field
 *   - every type the Configuration page names with `{% type-reference %}`
 *   - every API route with the access level of each method
 *
 * The result is written to website/content/generated/schema.json. The website
 * reads that file only, so its build never imports app code.
 *
 *   npm run docs:schema
 *
 * src/lib/__tests__/docs-schema.test.ts fails when the committed file is out
 * of date or when a documented field has no description.
 *
 * A field's description is the first paragraph of its JSDoc comment. Anything
 * after a blank line inside the comment is for developers and stays out of
 * the docs.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { getAllModuleDefinitions, MODULE_CATEGORIES } from '@/lib/module-registry';
import { MODULE_DOCS_ANCHOR } from '@/lib/module-docs';
import { DEFAULT_CONFIG } from '@/lib/config';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { DEFAULT_MODULE_STYLE } from '@/types/config';

const REPO_ROOT = path.resolve(__dirname, '..');

export const SCHEMA_OUTPUT = path.join(REPO_ROOT, 'website/content/generated/schema.json');

/** The page whose `{% type-reference name="..." %}` tags decide which types are extracted. */
const CONFIGURATION_PAGE = path.join(REPO_ROOT, 'website/content/docs/configuration.md');

/** Files the documented types are declared in. */
const TYPE_SOURCES = [
  'src/types/config.ts',
  'src/types/family.ts',
  'src/lib/meal-data.ts',
  'src/lib/chore-data.ts',
  'src/lib/chore-completion-data.ts',
].map((file) => path.join(REPO_ROOT, file));

/** Module types whose config interface breaks the `<Pascal>Config` naming convention. */
const CONFIG_INTERFACE_OVERRIDES: Record<string, string> = {
  'qr-code': 'QRCodeConfig',
};

/** The value a fresh install starts with, for the types that have one. */
const TYPE_DEFAULTS: Record<string, Record<string, unknown>> = {
  ScreenConfiguration: DEFAULT_CONFIG as unknown as Record<string, unknown>,
  GlobalSettings: DEFAULT_CONFIG.settings as unknown as Record<string, unknown>,
  WeatherSettings: DEFAULT_CONFIG.settings.weather as unknown as Record<string, unknown>,
  CalendarSettings: DEFAULT_CONFIG.settings.calendar as unknown as Record<string, unknown>,
  ModuleStyle: DEFAULT_MODULE_STYLE as unknown as Record<string, unknown>,
  MealSettings: DEFAULT_MEAL_SETTINGS as unknown as Record<string, unknown>,
};

// ---------------------------------------------------------------------------
// Shapes written to schema.json
// ---------------------------------------------------------------------------

export interface DocsFieldType {
  /** `string`, `number`, `boolean`, `array`, `object`, or several joined with ` or `. */
  kind: string;
  /** The literal members, when the type is (or contains) a union of literals. */
  values?: Array<string | number>;
  /** The TypeScript spelling, for the Configuration page. */
  text: string;
}

export interface DocsField {
  name: string;
  optional: boolean;
  type: DocsFieldType;
  description: string;
  /** The value a new instance starts with (registry `defaultConfig` or a defaults object). */
  default?: unknown;
  /** The field's `@default` JSDoc tag: what the code falls back to when the field is absent. */
  defaultText?: string;
}

export interface DocsModule {
  type: string;
  label: string;
  category: string;
  anchor: string;
  configInterface: string;
  defaultSize: { w: number; h: number };
  fillsCanvas: boolean;
  views?: string[];
  fields: DocsField[];
}

export type DocsType =
  | { name: string; kind: 'interface'; description: string; fields: DocsField[] }
  | { name: string; kind: 'values'; description: string; values: Array<string | number> }
  | {
      name: string;
      kind: 'variants';
      description: string;
      discriminant: string;
      variants: Array<{ value: string; description: string; fields: DocsField[] }>;
    };

export type DocsAccess = 'open' | 'session' | 'display' | 'media' | 'adopted';

export interface DocsRoute {
  path: string;
  methods: Array<{ method: string; access: DocsAccess }>;
}

export interface DocsSchema {
  schemaVersion: number;
  categories: string[];
  modules: DocsModule[];
  types: Record<string, DocsType>;
  routes: DocsRoute[];
}

// ---------------------------------------------------------------------------
// TypeScript program over the type sources
// ---------------------------------------------------------------------------

function createProgram(): ts.Program {
  return ts.createProgram(TYPE_SOURCES, {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    resolveJsonModule: true,
    jsx: ts.JsxEmit.ReactJSX,
    baseUrl: REPO_ROOT,
    paths: { '@/*': ['./src/*'] },
  });
}

/** First paragraph of a JSDoc comment, on one line. */
function summaryOf(symbol: ts.Symbol, checker: ts.TypeChecker): string {
  const text = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  if (!text) return '';
  return text.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ').trim();
}

function isStringLiteral(t: ts.Type): t is ts.StringLiteralType {
  return (t.flags & ts.TypeFlags.StringLiteral) !== 0;
}

function isNumberLiteral(t: ts.Type): t is ts.NumberLiteralType {
  return (t.flags & ts.TypeFlags.NumberLiteral) !== 0;
}

function baseKind(t: ts.Type, checker: ts.TypeChecker): string {
  if (t.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.TemplateLiteral)) return 'string';
  if (t.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) return 'number';
  if (t.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) return 'boolean';
  if (checker.isArrayType(t) || checker.isTupleType(t)) return 'array';
  if (t.flags & ts.TypeFlags.Null) return 'null';
  return 'object';
}

/**
 * The literal members of a union as they are written in the source, following
 * aliases (`view: ClockView` reads the `ClockView` declaration). The checker
 * lists union members in its own internal order, which would scramble every
 * list of views and options on the page.
 */
function literalsInSourceOrder(
  node: ts.TypeNode | undefined,
  checker: ts.TypeChecker,
  seen = new Set<ts.Node>(),
): Array<string | number> {
  if (!node || seen.has(node)) return [];
  seen.add(node);
  if (ts.isUnionTypeNode(node)) return node.types.flatMap((t) => literalsInSourceOrder(t, checker, seen));
  if (ts.isParenthesizedTypeNode(node)) return literalsInSourceOrder(node.type, checker, seen);
  if (ts.isLiteralTypeNode(node)) {
    const literal = node.literal;
    if (ts.isStringLiteral(literal)) return [literal.text];
    if (ts.isNumericLiteral(literal)) return [Number(literal.text)];
    return [];
  }
  if (ts.isTypeReferenceNode(node)) {
    let symbol = checker.getSymbolAtLocation(node.typeName);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const alias = symbol?.declarations?.find(ts.isTypeAliasDeclaration);
    return alias ? literalsInSourceOrder(alias.type, checker, seen) : [];
  }
  return [];
}

function describeType(type: ts.Type, checker: ts.TypeChecker, node?: ts.TypeNode): DocsFieldType {
  const t = checker.getNonNullableType(type);
  const text = checker.typeToString(
    t,
    undefined,
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
  );
  const parts = t.isUnion() ? t.types : [t];
  const kinds = [...new Set(parts.map((p) => baseKind(p, checker)))];
  const literals = parts
    .filter((p) => isStringLiteral(p) || isNumberLiteral(p))
    .map((p) => (p as ts.StringLiteralType | ts.NumberLiteralType).value);
  const out: DocsFieldType = { kind: kinds.join(' or '), text };
  if (literals.length > 0) {
    const ordered = [...new Set(literalsInSourceOrder(node, checker))];
    const sameSet = ordered.length === literals.length && literals.every((v) => ordered.includes(v));
    out.values = sameSet ? ordered : literals;
  }
  return out;
}

function fieldsOfType(type: ts.Type, at: ts.Node, checker: ts.TypeChecker): DocsField[] {
  return checker.getPropertiesOfType(type).map((prop) => {
    const decl = prop.valueDeclaration;
    const node = decl && ts.isPropertySignature(decl) ? decl.type : undefined;
    const field: DocsField = {
      name: prop.getName(),
      optional: (prop.flags & ts.SymbolFlags.Optional) !== 0,
      type: describeType(checker.getTypeOfSymbolAtLocation(prop, at), checker, node),
      description: summaryOf(prop, checker),
    };
    const defaultTag = prop.getJsDocTags(checker).find((tag) => tag.name === 'default');
    if (defaultTag?.text) field.defaultText = ts.displayPartsToString(defaultTag.text).trim();
    return field;
  });
}

/** Every exported interface and type alias declared in the type sources, by name. */
function collectDeclarations(program: ts.Program): Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration> {
  const out = new Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>();
  for (const file of TYPE_SOURCES) {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`TypeScript could not load ${path.relative(REPO_ROOT, file)}`);
    for (const statement of source.statements) {
      if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) continue;
      if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      out.set(statement.name.text, statement);
    }
  }
  return out;
}

function extractType(
  name: string,
  decl: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  checker: ts.TypeChecker,
): DocsType {
  const symbol = checker.getSymbolAtLocation(decl.name);
  if (!symbol) throw new Error(`No symbol for ${name}`);
  const description = summaryOf(symbol, checker);
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  const defaults = TYPE_DEFAULTS[name];

  if (ts.isTypeAliasDeclaration(decl) && type.isUnion()) {
    if (type.types.every((t) => isStringLiteral(t) || isNumberLiteral(t))) {
      const values = describeType(type, checker, decl.type).values ?? [];
      return { name, kind: 'values', description, values };
    }
    // A union of object shapes told apart by one literal property (`kind`).
    const discriminant = 'kind';
    const variants = type.types.map((variant) => {
      const tag = variant.getProperty(discriminant);
      const tagType = tag && checker.getTypeOfSymbolAtLocation(tag, decl);
      if (!tagType || !isStringLiteral(tagType)) {
        throw new Error(`${name}: every member of the union needs a literal \`${discriminant}\``);
      }
      // A variant is described by the comment on its discriminant.
      return {
        value: tagType.value,
        description: summaryOf(tag, checker),
        fields: fieldsOfType(variant, decl, checker).filter((f) => f.name !== discriminant),
      };
    });
    return { name, kind: 'variants', description, discriminant, variants };
  }

  const fields = fieldsOfType(type, decl, checker).map((field) =>
    defaults && field.name in defaults ? { ...field, default: defaults[field.name] } : field,
  );
  return { name, kind: 'interface', description, fields };
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

function toPascal(type: string): string {
  return type.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

export function moduleConfigInterface(type: string): string {
  return CONFIG_INTERFACE_OVERRIDES[type] ?? `${toPascal(type)}Config`;
}

function extractModules(
  declarations: Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>,
  checker: ts.TypeChecker,
): DocsModule[] {
  return getAllModuleDefinitions()
    .filter((def) => !def.type.startsWith('plugin:'))
    .map((def) => {
      const iface = moduleConfigInterface(def.type);
      const decl = declarations.get(iface);
      if (!decl) {
        throw new Error(
          `Module "${def.type}" has no exported ${iface} in src/types/config.ts ` +
            '(add a CONFIG_INTERFACE_OVERRIDES entry in scripts/extract-docs-schema.ts if the name is irregular)',
        );
      }
      const extracted = extractType(iface, decl, checker);
      if (extracted.kind !== 'interface') throw new Error(`${iface} must be an interface`);

      const known = new Set(extracted.fields.map((f) => f.name));
      const stray = Object.keys(def.defaultConfig).filter((key) => !known.has(key));
      if (stray.length) {
        throw new Error(`Registry defaultConfig for "${def.type}" sets fields ${iface} does not declare: ${stray.join(', ')}`);
      }

      const fields = extracted.fields.map((field) =>
        field.name in def.defaultConfig ? { ...field, default: def.defaultConfig[field.name] } : field,
      );
      const viewField = fields.find((f) => (f.name === 'view' || f.name === 'viewMode') && f.type.values);
      const anchor = (MODULE_DOCS_ANCHOR as Record<string, string>)[def.type];
      if (!anchor) throw new Error(`Module "${def.type}" has no MODULE_DOCS_ANCHOR entry in src/lib/module-docs.ts`);

      const out: DocsModule = {
        type: def.type,
        label: def.label,
        category: def.category,
        anchor,
        configInterface: iface,
        defaultSize: def.defaultSize,
        fillsCanvas: Boolean(def.fillsCanvas),
        fields,
      };
      if (viewField) out.views = viewField.type.values!.map(String);
      return out;
    });
}

// ---------------------------------------------------------------------------
// Configuration page types
// ---------------------------------------------------------------------------

/** Type names the Configuration page renders, in page order. */
export function configurationPageTypes(): string[] {
  const page = fs.readFileSync(CONFIGURATION_PAGE, 'utf8');
  return [...page.matchAll(/\{%\s*type-reference\s+name="([^"]+)"/g)].map((m) => m[1]);
}

function extractTypes(
  declarations: Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>,
  checker: ts.TypeChecker,
): Record<string, DocsType> {
  const out: Record<string, DocsType> = {};
  for (const name of configurationPageTypes()) {
    const decl = declarations.get(name);
    if (!decl) throw new Error(`configuration.md references type "${name}", which no type source exports`);
    out[name] = extractType(name, decl, checker);
  }
  return out;
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

const API_ROOT = path.join(REPO_ROOT, 'src/app/api');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Handler wrappers and factories, by the access they grant. A route built with
 * anything not listed here fails extraction, so a new wrapper gets classified
 * the day it appears rather than showing up as "open".
 */
const WRAPPER_ACCESS: Record<string, DocsAccess> = {
  withAuth: 'session',
  withDisplayAuth: 'display',
  withMediaTokenAuth: 'media',
  // src/lib/route-factories.ts: both wrap their handler in withAuth.
  createTagActionRoute: 'session',
  createImageDownloadHandler: 'session',
};

/** Access for a hand-written handler, from the auth checks it makes itself. */
function accessOfBody(body: string): DocsAccess {
  if (/\brequireSession\(/.test(body)) return 'session';
  if (/\brequireDisplayAuth\(/.test(body)) return 'display';
  if (/\brequireAdoptedDisplay\(/.test(body)) return 'adopted';
  return 'open';
}

/**
 * `cachedProxyRoute({ auth: 'display', ... })` (src/lib/api-utils.ts) takes its
 * access from the `auth` option rather than from a fixed wrapper.
 */
function accessOfCachedProxyRoute(call: ts.CallExpression, where: string): DocsAccess {
  const config = call.arguments[0];
  const auth = config && ts.isObjectLiteralExpression(config)
    ? config.properties.find(
        (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === 'auth',
      )
    : undefined;
  if (!auth || !ts.isStringLiteral(auth.initializer)) {
    throw new Error(`${where}: cachedProxyRoute needs a literal \`auth\` option for the docs to classify it`);
  }
  const value = auth.initializer.text;
  if (value !== 'display' && value !== 'session') throw new Error(`${where}: unknown cachedProxyRoute auth "${value}"`);
  return value;
}

function accessOf(init: ts.Expression, source: ts.SourceFile, where: string): DocsAccess {
  if (ts.isCallExpression(init)) {
    const callee = init.expression.getText(source);
    if (callee === 'cachedProxyRoute') return accessOfCachedProxyRoute(init, where);
    const access = WRAPPER_ACCESS[callee];
    if (!access) throw new Error(`${where}: unknown route wrapper "${callee}" (classify it in WRAPPER_ACCESS)`);
    return access;
  }
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return accessOfBody(init.getText(source));
  throw new Error(`${where}: cannot tell how this handler is authenticated`);
}

function urlPath(routeFile: string): string {
  const segments = path
    .relative(path.join(REPO_ROOT, 'src/app'), path.dirname(routeFile))
    .split(path.sep)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) =>
      segment
        .replace(/^\[\[\.\.\.(.+)\]\]$/, '{$1...}')
        .replace(/^\[\.\.\.(.+)\]$/, '{$1...}')
        .replace(/^\[(.+)\]$/, '{$1}'),
    );
  return `/${segments.join('/')}`;
}

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

export function extractRoutes(): DocsRoute[] {
  return routeFiles(API_ROOT)
    .map((file) => {
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const where = path.relative(REPO_ROOT, file);

      // Top-level handlers by local name, and the method each exported name
      // serves. Routes export either inline (`export const GET = ...`) or
      // through a list at the bottom (`export { GET, cache }`).
      const locals = new Map<string, () => DocsAccess>();
      const exported = new Map<string, string>(); // method -> local name
      for (const statement of source.statements) {
        const inline = ts.canHaveModifiers(statement)
          && Boolean(ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
        if (ts.isFunctionDeclaration(statement) && statement.name) {
          const name = statement.name.text;
          locals.set(name, () => accessOfBody(statement.getText(source)));
          if (inline) exported.set(name, name);
        } else if (ts.isVariableStatement(statement)) {
          for (const decl of statement.declarationList.declarations) {
            if (!decl.initializer) continue;
            const init = decl.initializer;
            // `const { GET, cache } = cachedProxyRoute(...)` names every handler
            // the factory returns; they all share its access.
            const names = ts.isIdentifier(decl.name)
              ? [decl.name.text]
              : ts.isObjectBindingPattern(decl.name)
                ? decl.name.elements.flatMap((el) => (ts.isIdentifier(el.name) ? [el.name.text] : []))
                : [];
            for (const name of names) {
              locals.set(name, () => accessOf(init, source, where));
              if (inline) exported.set(name, name);
            }
          }
        } else if (
          ts.isExportDeclaration(statement)
          && !statement.moduleSpecifier
          && statement.exportClause
          && ts.isNamedExports(statement.exportClause)
        ) {
          for (const spec of statement.exportClause.elements) {
            exported.set(spec.name.text, (spec.propertyName ?? spec.name).text);
          }
        }
      }

      const methods: DocsRoute['methods'] = [];
      for (const [method, local] of exported) {
        if (!METHODS.includes(method)) continue;
        const access = locals.get(local);
        if (!access) throw new Error(`${where}: exports ${method} but does not declare "${local}" itself`);
        methods.push({ method, access: access() });
      }
      if (methods.length === 0) throw new Error(`${where} exports no HTTP method handlers`);
      methods.sort((a, b) => METHODS.indexOf(a.method) - METHODS.indexOf(b.method));
      return { path: urlPath(file), methods };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export function extractDocsSchema(): DocsSchema {
  const program = createProgram();
  const checker = program.getTypeChecker();
  const declarations = collectDeclarations(program);
  return {
    schemaVersion: DEFAULT_CONFIG.version,
    categories: MODULE_CATEGORIES.filter((category) =>
      getAllModuleDefinitions().some((def) => def.category === category && !def.type.startsWith('plugin:')),
    ),
    modules: extractModules(declarations, checker),
    types: extractTypes(declarations, checker),
    routes: extractRoutes(),
  };
}

export function serializeDocsSchema(schema: DocsSchema): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const schema = extractDocsSchema();
  fs.mkdirSync(path.dirname(SCHEMA_OUTPUT), { recursive: true });
  fs.writeFileSync(SCHEMA_OUTPUT, serializeDocsSchema(schema));
  const fields = schema.modules.reduce((n, m) => n + m.fields.length, 0);
  console.log(
    `Wrote ${path.relative(REPO_ROOT, SCHEMA_OUTPUT)}: ${schema.modules.length} modules (${fields} fields), ` +
      `${Object.keys(schema.types).length} types, ${schema.routes.length} routes`,
  );
}
