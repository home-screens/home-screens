'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';

/* ─── Props ────────────────────────────────── */

interface HostnameSectionProps {
  currentHostname: string;
  onSaved: () => void;
}

/* ─── Component ────────────────────────────── */

export default function HostnameSection({
  currentHostname,
  onSaved,
}: HostnameSectionProps) {
  const [value, setValue] = useState(currentHostname);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync local value when the current hostname changes (e.g. after a refresh)
  useEffect(() => {
    setValue(currentHostname);
  }, [currentHostname]);

  const isDirty = value.trim() !== currentHostname;

  const handleSave = async () => {
    if (!isDirty || saving) return;

    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await editorFetch('/api/system/network/hostname', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: value.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setSuccessMsg('Hostname updated');
        onSaved();

        // Clear success message after 3s
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setErrorMsg(data.error ?? 'Failed to update hostname');
      }
    } catch {
      setErrorMsg('Failed to reach server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        Hostname
      </h3>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSuccessMsg(null);
            setErrorMsg(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isDirty) handleSave();
          }}
          placeholder="home-screens"
          className="bg-hs-bg border border-hs-border rounded px-3 py-2 text-sm text-hs-text-primary w-full font-mono"
          disabled={saving}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="shrink-0"
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {successMsg && (
        <p className="mt-1.5 text-xs text-hs-success">{successMsg}</p>
      )}
      {errorMsg && (
        <p className="mt-1.5 text-xs text-hs-danger">{errorMsg}</p>
      )}
    </section>
  );
}
