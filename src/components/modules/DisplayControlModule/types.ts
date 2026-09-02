export interface LayoutProps {
  currentTarget: string | undefined;
  setCurrentTarget: (t: string | undefined) => void;
  /** The display this module renders on (undefined in the editor and legacy mode). */
  selfId: string | undefined;
  allowRetargeting: boolean;
  /** Icons only, no words. */
  compact: boolean;
  availableDisplays: Array<{ id: string; name: string }>;
  isLegacyMode: boolean;
  /** Brightness the target reports (or the value just sent, until confirmed); null while unknown. */
  brightness: number | null;

  onPrev: () => void;
  onNext: () => void;
  onSleep: () => void;
  onWake: () => void;
  onBrightness: (pct: number) => void;
}
