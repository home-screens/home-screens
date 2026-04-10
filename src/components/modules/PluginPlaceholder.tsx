'use client';

import { Puzzle } from 'lucide-react';

interface PluginPlaceholderProps {
  moduleType: string;
}

/** Rendered when a plugin module type is in the config but the plugin isn't loaded. */
export default function PluginPlaceholder({ moduleType }: PluginPlaceholderProps) {
  const pluginName = moduleType.replace('plugin:', '');
  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-hs-card/80 text-hs-text-muted rounded-lg gap-2">
      <Puzzle className="w-8 h-8 text-hs-text-faint" />
      <span className="text-xs text-center px-2">
        Plugin not available: {pluginName}
      </span>
    </div>
  );
}
