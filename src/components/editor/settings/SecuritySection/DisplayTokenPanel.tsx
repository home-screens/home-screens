'use client';

import { useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

interface DisplayTokenPanelProps {
  token: string;
  /** New token after a regenerate. */
  onTokenChange: (token: string) => void;
}

/** Reveal/copy/regenerate panel for the display auth token. */
export default function DisplayTokenPanel({ token, onTokenChange }: DisplayTokenPanelProps) {
  const t = useTranslate('editor');

  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenRegenerating, setTokenRegenerating] = useState(false);
  const [tokenConfirmRegen, setTokenConfirmRegen] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);

  async function handleCopyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts (HTTP)
      try {
        const ta = document.createElement('textarea');
        ta.value = token;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) {
          setTokenStatus(t('settings.securityPage.displayToken.errorCopy'));
          return;
        }
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
      } catch {
        setTokenStatus(t('settings.securityPage.displayToken.errorCopy'));
      }
    }
  }

  async function handleRegenerateToken() {
    setTokenRegenerating(true);
    setTokenStatus(null);
    try {
      const res = await editorFetch('/api/auth/display-token', { method: 'POST' });
      if (res.ok) {
        const { displayToken } = await res.json();
        onTokenChange(displayToken);
        setTokenConfirmRegen(false);
        setTokenRevealed(true);
      } else {
        setTokenStatus(t('settings.securityPage.displayToken.errorRegenerate'));
      }
    } catch {
      setTokenStatus(t('common.networkError'));
    } finally {
      setTokenRegenerating(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-hs-border">
      <h4 className="text-xs font-medium text-hs-text-muted mb-2 uppercase tracking-wider">
        {t('settings.securityPage.displayToken.heading')}
      </h4>
      <p className="text-xs text-hs-text-faint mb-2">
        {t('settings.securityPage.displayToken.description')}
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-hs-card border border-hs-border-strong rounded px-2 py-1.5 text-hs-text-secondary font-mono truncate select-all">
          {tokenRevealed ? token : token.slice(0, 8) + '•'.repeat(16)}
        </code>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setTokenRevealed(!tokenRevealed)}
        >
          {tokenRevealed
            ? t('settings.securityPage.displayToken.hide')
            : t('settings.securityPage.displayToken.reveal')}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleCopyToken}>
          {tokenCopied
            ? t('settings.securityPage.displayToken.copied')
            : t('settings.securityPage.displayToken.copy')}
        </Button>
      </div>
      <div className="mt-2">
        {!tokenConfirmRegen ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setTokenConfirmRegen(true)}
          >
            {t('settings.securityPage.displayToken.regenerateButton')}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-hs-warning">
              {t('settings.securityPage.displayToken.regenerateWarning')}
            </span>
            <Button
              variant="danger"
              size="sm"
              onClick={handleRegenerateToken}
              disabled={tokenRegenerating}
            >
              {tokenRegenerating
                ? t('settings.securityPage.displayToken.regenerating')
                : t('settings.securityPage.displayToken.regenerateConfirm')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTokenConfirmRegen(false)}
            >
              {t('settings.securityPage.displayToken.regenerateCancel')}
            </Button>
          </div>
        )}
        {tokenStatus && (
          <p
            className="text-xs text-hs-danger mt-1"
            aria-live="polite"
            role="alert"
          >
            {tokenStatus}
          </p>
        )}
      </div>
      <p className="text-xs text-hs-text-faint mt-2">
        {t('settings.securityPage.displayToken.phoneHintPart1')}
        <code className="text-hs-text-faint">
          {t('settings.securityPage.displayToken.phoneHintCode')}
        </code>
        {t('settings.securityPage.displayToken.phoneHintPart2')}
      </p>
    </div>
  );
}
