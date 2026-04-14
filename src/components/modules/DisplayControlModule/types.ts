export interface LayoutProps {
  currentTarget: string | undefined;
  setCurrentTarget: (t: string | undefined) => void;
  allowRetargeting: boolean;
  availableDisplays: Array<{ id: string; name: string }>;
  isLegacyMode: boolean;

  onPrev: () => void;
  onNext: () => void;
  onSleep: () => void;
  onBrightness: (pct: number) => void;
}
