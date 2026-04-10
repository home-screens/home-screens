import type { Metadata } from 'next';
import ConfirmModal from '@/components/ui/ConfirmModal';
import PluginGlobalsEditor from '@/components/PluginGlobalsEditor';
import BackupReminderToast from '@/components/editor/BackupReminderToast';

export const metadata: Metadata = {
  title: 'Home Screen Editor',
};

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-hs-body text-hs-text-primary font-sans antialiased h-screen overflow-hidden">
      <PluginGlobalsEditor />
      {children}
      <ConfirmModal />
      <BackupReminderToast />
    </div>
  );
}
