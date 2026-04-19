'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import StatusDot from '@/components/ui/StatusDot';
import type { PluginSecretDeclaration } from '@/types/plugins';

function PluginSecretField({
  decl,
  pluginId,
  configured,
  onSaved,
}: {
  decl: PluginSecretDeclaration;
  pluginId: string;
  configured: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSave() {
    if (!value.trim()) return;
    setSaveStatus('saving');
    setErrorMsg('');
    try {
      const res = await editorFetch(`/api/plugins/secrets/${encodeURIComponent(pluginId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: decl.key, value: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus('error');
        setErrorMsg(data.error ?? 'Failed to save');
        return;
      }
      setSaveStatus('saved');
      setValue('');
      onSaved();
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setErrorMsg('Network error');
    }
  }

  async function handleDelete() {
    try {
      const res = await editorFetch(`/api/plugins/secrets/${encodeURIComponent(pluginId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: decl.key }),
      });
      if (res.ok) onSaved();
    } catch (err) {
      console.debug('Failed to delete plugin secret:', err);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-hs-text-muted">{decl.label}</span>
        <div className="flex items-center gap-2">
          {decl.required && !configured && (
            <span className="text-xs text-hs-warning">Required</span>
          )}
          <StatusDot configured={configured} />
          {configured && (
            <button
              onClick={handleDelete}
              className="text-xs text-hs-text-faint hover:text-hs-danger transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaveStatus('idle'); }}
          placeholder={decl.placeholder ?? `Enter ${decl.label.toLowerCase()}`}
          className="flex-1 min-w-0 rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSave}
          disabled={!value.trim() || saveStatus === 'saving'}
          className="flex-shrink-0"
        >
          {saveStatus === 'saving' ? '...' : 'Save'}
        </Button>
      </div>
      {saveStatus === 'saved' && (
        <span className="text-xs text-hs-success">Saved successfully</span>
      )}
      {saveStatus === 'error' && (
        <span className="text-xs text-hs-danger">{errorMsg}</span>
      )}
      {decl.description && (
        <p className="text-xs text-hs-text-faint">{decl.description}</p>
      )}
    </div>
  );
}

export default function PluginSecretsSection({
  pluginId,
  secrets,
}: {
  pluginId: string;
  secrets: PluginSecretDeclaration[];
}) {
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await editorFetch(`/api/plugins/secrets/${encodeURIComponent(pluginId)}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data.keys ?? {});
      }
    } catch (err) {
      console.debug('Failed to fetch plugin secret status:', err);
    } finally {
      setLoading(false);
    }
  }, [pluginId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading) {
    return <p className="text-xs text-hs-text-faint">Loading secrets status...</p>;
  }

  return (
    <div className="space-y-4">
      {secrets.map((decl) => (
        <PluginSecretField
          key={decl.key}
          decl={decl}
          pluginId={pluginId}
          configured={!!status[decl.key]}
          onSaved={fetchStatus}
        />
      ))}
    </div>
  );
}
