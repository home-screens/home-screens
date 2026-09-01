'use client';

import { useState } from 'react';
import type { ModuleInstance } from '@/types/config';
import type { PluginConfigSchema, PluginConfigProperty } from '@/types/plugins';
import { useEditorStore } from '@/stores/editor-store';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import { INPUT_CLASS } from './PropertyPanel';
import { X, Plus } from 'lucide-react';
import { useTranslate } from '@/i18n';

interface PluginConfigRendererProps {
  mod: ModuleInstance;
  screenId: string;
  schema: PluginConfigSchema;
}

/** Auto-generates config controls from a JSON Schema with ui:widget annotations. */
export default function PluginConfigRenderer({ mod, screenId, schema }: PluginConfigRendererProps) {
  const { updateModule } = useEditorStore();
  const config = mod.config;

  const setConfig = (key: string, value: unknown) => {
    updateModule(screenId, mod.id, {
      config: { ...config, [key]: value },
    });
  };

  return <PluginSchemaFields schema={schema} values={config} onFieldChange={setConfig} />;
}

/**
 * The schema→widgets renderer behind PluginConfigRenderer, decoupled from the
 * editor store so other value stores can reuse it — PluginSettingsSection
 * renders a manifest `settingsSchema` against plugin-level settings with the
 * exact same widgets and grouping.
 */
export function PluginSchemaFields({
  schema,
  values,
  onFieldChange,
}: {
  schema: PluginConfigSchema;
  values: Record<string, unknown>;
  onFieldChange: (key: string, value: unknown) => void;
}) {
  if (!schema?.properties) return null;

  const entries = Object.entries(schema.properties);
  const groups = new Map<string, [string, PluginConfigProperty][]>();
  const ungrouped: [string, PluginConfigProperty][] = [];

  for (const entry of entries) {
    const group = entry[1]['ui:group'];
    if (group) {
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(entry);
    } else {
      ungrouped.push(entry);
    }
  }

  return (
    <div className="space-y-3">
      {/* Ungrouped fields first */}
      {ungrouped.map(([key, prop]) => (
        <ConditionalField key={key} prop={prop} config={values} schemaProperties={schema.properties}>
          <ConfigField
            fieldKey={key}
            prop={prop}
            value={values[key]}
            onChange={(v) => onFieldChange(key, v)}
          />
        </ConditionalField>
      ))}
      {/* Grouped fields with section headers. A group whose fields are all
          hidden by ui:showWhen renders nothing — no orphaned header. */}
      {[...groups.entries()].map(([groupName, fields]) => {
        const visible = fields.filter(([, prop]) =>
          isFieldVisible(prop, values, schema.properties),
        );
        if (visible.length === 0) return null;
        return (
          <div key={groupName} className="space-y-3">
            <div className="text-[10px] font-semibold text-hs-text-faint uppercase tracking-wider pt-2 border-t border-hs-border-strong/50">
              {groupName}
            </div>
            {visible.map(([key, prop]) => (
              <ConfigField
                key={key}
                fieldKey={key}
                prop={prop}
                value={values[key]}
                onChange={(v) => onFieldChange(key, v)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** ui:showWhen predicate: unset conditions are visible; the controlling
 *  field's schema default stands in until the user touches it. */
export function isFieldVisible(
  prop: PluginConfigProperty,
  config: Record<string, unknown>,
  schemaProperties?: Record<string, PluginConfigProperty>,
): boolean {
  const condition = prop['ui:showWhen'];
  if (!condition) return true;
  const effectiveValue = config[condition.field] ?? schemaProperties?.[condition.field]?.default;
  return effectiveValue === condition.equals;
}

/** Wraps a field with ui:showWhen conditional visibility. */
function ConditionalField({
  prop,
  config,
  schemaProperties,
  children,
}: {
  prop: PluginConfigProperty;
  config: Record<string, unknown>;
  schemaProperties?: Record<string, PluginConfigProperty>;
  children: React.ReactNode;
}) {
  if (!isFieldVisible(prop, config, schemaProperties)) return null;
  return <>{children}</>;
}

// ── Widget components ───────────────────────────────────────────────

interface WidgetProps {
  label: string;
  value: unknown;
  prop: PluginConfigProperty;
  onChange: (v: unknown) => void;
  description?: string;
  placeholder?: string;
}

function Desc({ text }: { text?: string }) {
  return text ? <span className="text-[10px] text-hs-text-faint">{text}</span> : null;
}

function ToggleWidget({ label, value, prop, onChange, description }: WidgetProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs text-hs-text-muted">{label}</span>
        <input type="checkbox" checked={Boolean(value ?? prop.default)} onChange={(e) => onChange(e.target.checked)} className="accent-hs-accent" />
      </label>
      <Desc text={description} />
    </div>
  );
}

function SliderWidget({ label, value, prop, onChange, description }: WidgetProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <Slider label={label} value={Number(value ?? prop.default ?? prop.minimum ?? 0)} min={prop.minimum ?? 0} max={prop.maximum ?? 100} step={prop['ui:step'] ?? 1} onChange={onChange} />
      <Desc text={description} />
    </div>
  );
}

function NumberWidget({ label, value, prop, onChange, description, placeholder }: WidgetProps) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <input type="number" value={Number(value ?? prop.default ?? 0)} min={prop.minimum} max={prop.maximum} step={prop['ui:step']} onChange={(e) => onChange(Number(e.target.value))} className={INPUT_CLASS} placeholder={placeholder} />
      <Desc text={description} />
    </label>
  );
}

function SelectWidget({ label, value, prop, onChange, description }: WidgetProps) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <select value={String(value ?? prop.default ?? '')} onChange={(e) => onChange(prop.type === 'number' ? Number(e.target.value) : e.target.value)} className={INPUT_CLASS}>
        {(prop.enum ?? []).map((opt, i) => (
          <option key={String(opt)} value={String(opt)}>{prop.enumLabels?.[i] ?? String(opt)}</option>
        ))}
      </select>
      <Desc text={description} />
    </label>
  );
}

function ColorWidget({ label, value, prop, onChange, description }: WidgetProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <ColorPicker label={label} value={String(value ?? prop.default ?? '#000000')} onChange={onChange} />
      <Desc text={description} />
    </div>
  );
}

function TextareaWidget({ label, value, prop, onChange, description, placeholder }: WidgetProps) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <textarea rows={4} value={String(value ?? prop.default ?? '')} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS + ' resize-y'} placeholder={placeholder} />
      <Desc text={description} />
    </label>
  );
}

function MultiselectWidget({ label, value, prop, onChange, description }: WidgetProps) {
  const resolved = Array.isArray(value) ? value : Array.isArray(prop.default) ? prop.default as (string | number)[] : [];
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <div className="grid grid-cols-2 gap-1">
        {(prop.enum ?? []).map((opt, i) => {
          const selected = resolved.includes(opt);
          return (
            <label key={String(opt)} className="flex items-center gap-1.5 text-xs text-hs-text-secondary">
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => {
                  const current = [...resolved];
                  if (e.target.checked) current.push(opt);
                  else { const idx = current.indexOf(opt); if (idx >= 0) current.splice(idx, 1); }
                  onChange(current);
                }}
                className="accent-hs-accent"
              />
              {prop.enumLabels?.[i] ?? String(opt)}
            </label>
          );
        })}
      </div>
      <Desc text={description} />
    </div>
  );
}

function TimeWidget({ label, value, prop, onChange, description }: WidgetProps) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <input type="time" value={String(value ?? prop.default ?? '')} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} />
      <Desc text={description} />
    </label>
  );
}

function ArrayWidget({ label, value, prop, onChange, description }: WidgetProps) {
  return <ArrayEditor label={label} description={description} prop={prop} value={value} onChange={onChange} />;
}

function ObjectWidget({ label, value, prop, onChange, description }: WidgetProps) {
  return <ObjectEditor label={label} description={description} prop={prop} value={value} onChange={onChange} />;
}

function TextWidget({ label, value, prop, onChange, description, placeholder }: WidgetProps) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <input type="text" value={String(value ?? prop.default ?? '')} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} placeholder={placeholder} />
      <Desc text={description} />
    </label>
  );
}

const WIDGET_MAP: Record<string, React.FC<WidgetProps>> = {
  toggle: ToggleWidget,
  slider: SliderWidget,
  number: NumberWidget,
  select: SelectWidget,
  color: ColorWidget,
  textarea: TextareaWidget,
  multiselect: MultiselectWidget,
  time: TimeWidget,
  array: ArrayWidget,
  object: ObjectWidget,
  text: TextWidget,
};

function ConfigField({
  fieldKey,
  prop,
  value,
  onChange,
}: {
  fieldKey: string;
  prop: PluginConfigProperty;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const widget = prop['ui:widget'] ?? inferWidget(prop);
  const Widget = WIDGET_MAP[widget] ?? TextWidget;
  return (
    <Widget
      label={prop.title ?? fieldKey}
      value={value}
      prop={prop}
      onChange={onChange}
      description={prop.description}
      placeholder={prop['ui:placeholder']}
    />
  );
}

const MAX_ARRAY_ITEMS = 50;

/** Build a default value for a new array item from its schema. */
function buildItemDefault(itemSchema: PluginConfigProperty | undefined): unknown {
  if (!itemSchema) return '';
  if (itemSchema.type === 'object' && itemSchema.properties) {
    return Object.fromEntries(
      Object.entries(itemSchema.properties).map(([k, p]) => [k, p.default]),
    );
  }
  return itemSchema.default ?? '';
}

let nextArrayItemId = 0;

/** Editable list with Add/Remove for type: 'array' fields. */
function ArrayEditor({
  label,
  description,
  prop,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  prop: PluginConfigProperty;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const tCore = useTranslate('core');
  const items = Array.isArray(value) ? value : (Array.isArray(prop.default) ? prop.default as unknown[] : []);
  const itemSchema = prop.items;

  const addItem = () => {
    if (items.length >= MAX_ARRAY_ITEMS) return;
    onChange([...items, buildItemDefault(itemSchema)]);
  };

  const removeItem = (index: number) => {
    keys.splice(index, 1); // keep keys in sync with items
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, val: unknown) => {
    const next = [...items];
    next[index] = val;
    onChange(next);
  };

  // Stable keys: assign an incrementing ID to each item position.
  // useRef would be ideal but the list is fully controlled via onChange,
  // so a module-scoped counter avoids stale-DOM issues on middle removals.
  const [keys] = useState(() => items.map(() => nextArrayItemId++));
  const ensureKeys = (count: number) => {
    while (keys.length < count) keys.push(nextArrayItemId++);
    keys.length = count;
  };
  ensureKeys(items.length);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-hs-text-muted">{label}</span>
      {description && <span className="text-[10px] text-hs-text-faint">{description}</span>}
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={keys[i]} className="flex items-start gap-1">
            <div className="flex-1 min-w-0">
              {itemSchema?.type === 'object' && itemSchema.properties ? (
                <div className="pl-2 border-l-2 border-hs-border-strong space-y-2">
                  {Object.entries(itemSchema.properties).map(([subKey, subProp]) => (
                    <ConditionalField key={subKey} prop={subProp} config={item as Record<string, unknown>} schemaProperties={itemSchema.properties}>
                      <ConfigField
                        fieldKey={subKey}
                        prop={subProp}
                        value={(item as Record<string, unknown>)?.[subKey]}
                        onChange={(v) => {
                          const updated = { ...(item as Record<string, unknown>), [subKey]: v };
                          updateItem(i, updated);
                        }}
                      />
                    </ConditionalField>
                  ))}
                </div>
              ) : itemSchema ? (
                <ConfigField
                  fieldKey={String(i)}
                  prop={itemSchema}
                  value={item}
                  onChange={(v) => updateItem(i, v)}
                />
              ) : (
                <input
                  type="text"
                  value={String(item ?? '')}
                  onChange={(e) => updateItem(i, e.target.value)}
                  className={INPUT_CLASS}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="p-1 text-hs-text-faint hover:text-hs-danger transition-colors flex-shrink-0 mt-0.5"
              title={tCore('actions.remove')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      {items.length < MAX_ARRAY_ITEMS && (
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-xs text-hs-text-muted hover:text-hs-text-body transition-colors mt-0.5"
        >
          <Plus className="w-3 h-3" />
          {tCore('actions.add')}
        </button>
      )}
    </div>
  );
}

/** Nested property editor for type: 'object' fields. */
function ObjectEditor({
  label,
  description,
  prop,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  prop: PluginConfigProperty;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const fallback = (typeof prop.default === 'object' && prop.default !== null ? prop.default : {}) as Record<string, unknown>;
  const obj = (typeof value === 'object' && value !== null ? value : fallback) as Record<string, unknown>;
  const properties = prop.properties ?? {};

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-hs-text-muted">{label}</span>
      {description && <span className="text-[10px] text-hs-text-faint">{description}</span>}
      <div className="pl-2 border-l-2 border-hs-border-strong space-y-2">
        {Object.entries(properties).map(([subKey, subProp]) => (
          <ConditionalField key={subKey} prop={subProp} config={obj} schemaProperties={properties}>
            <ConfigField
              fieldKey={subKey}
              prop={subProp}
              value={obj[subKey]}
              onChange={(v) => onChange({ ...obj, [subKey]: v })}
            />
          </ConditionalField>
        ))}
      </div>
    </div>
  );
}

/** Infer a reasonable widget from the property type/constraints when no ui:widget is specified. */
export function inferWidget(prop: PluginConfigProperty): string {
  if (prop.type === 'boolean') return 'toggle';
  if (prop.type === 'array') return 'array';
  if (prop.type === 'object') return 'object';
  if (prop.enum) return 'select';
  if (prop.type === 'number' && prop.minimum != null && prop.maximum != null) return 'slider';
  if (prop.type === 'number') return 'number';
  return 'text';
}
