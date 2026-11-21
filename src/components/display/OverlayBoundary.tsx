'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/lib/logger';

const log = logger('display');

/** How long a failed overlay stays down before it is mounted again. */
const RETRY_MS = 5_000;

interface Props {
  /** Which overlay this is, for the log line. */
  name: string;
  /** What kind of thing failed, for the log line. An overlay unless told otherwise. */
  what?: string;
  /** Clears whatever the overlay was drawing, so it does not fail on it again. */
  onFail?: () => void;
  children: ReactNode;
}

/**
 * Keeps a wall's overlays (alerts, the timer, a shown photo) from taking the
 * wall down with them. They sit outside every module's error boundary, so a
 * throw in one used to unmount the whole display, heartbeat included, and
 * nothing short of a hand reload brought it back.
 *
 * A failed overlay draws nothing, and is mounted again a few seconds later.
 * The wall's unseen mounts (background modules, plugin state providers) use
 * it for the same reason: they have nothing to draw a failure in.
 */
export default class OverlayBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  private retry: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error(`The ${this.props.name} ${this.props.what ?? 'overlay'} crashed while drawing:`, error, info.componentStack);
    this.props.onFail?.();
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.setState({ failed: false }), RETRY_MS);
  }

  componentWillUnmount() {
    clearTimeout(this.retry);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
