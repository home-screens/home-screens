'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/lib/logger';

const log = logger('module');

interface Props {
  /** Module type. Used for the log line so a crash is traceable to a plugin. */
  moduleType: string;
  /** Overrides the default message. Keep it plain — this can appear on a wall display. */
  fallbackText?: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Catches a render/lifecycle throw from a single module so it cannot take down
 * the surrounding tree.
 *
 * Without this, one bad module — most realistically a third-party plugin
 * calling an SDK member that is not installed on the current surface — throws,
 * React unmounts everything above it, and the kiosk sits on Next's
 * client-exception page until the next build-id reload. On the editor side the
 * same throw discards unsaved config edits.
 *
 * Deliberately per-module rather than one boundary per screen: the blast radius
 * should be the one broken module, and the other modules on the screen should
 * keep rendering.
 *
 * Error boundaries have to be class components; there is no hook equivalent.
 */
export default class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error(
      `Module "${this.props.moduleType}" crashed while rendering:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.failed) {
      // Plain language on purpose — this can appear on a kitchen display.
      return (
        <div className="flex h-full items-center justify-center px-4">
          <p className="text-center text-sm opacity-50">
            {this.props.fallbackText ?? 'This item could not be shown.'}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
