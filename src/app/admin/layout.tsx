import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-mist">
      <header className="flex items-center justify-between bg-navy-deep text-white px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-white/50">
            Admin
          </span>
          <span className="font-display text-lg font-semibold text-white">DAS Bid Estimator</span>
        </div>
        <Link href="/projects" className="font-body text-sm text-white/70 transition-colors hover:text-white">
          ← Back to Projects
        </Link>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
