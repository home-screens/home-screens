import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login — Home Screens',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-hs-body text-hs-text-body font-sans antialiased h-screen overflow-hidden">
      {children}
    </div>
  );
}
