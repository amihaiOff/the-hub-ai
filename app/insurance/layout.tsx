export default function InsuranceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <main className="flex-1 p-4 pb-20 lg:p-6 lg:pb-6">{children}</main>
    </div>
  );
}
