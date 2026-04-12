export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark bg-[#0a0a0a] text-neutral-200">
      {children}
    </div>
  );
}
