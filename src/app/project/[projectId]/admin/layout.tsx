import Link from 'next/link';

export const dynamic = 'force-dynamic';

const ADMIN_NAV_ITEMS = (projectId: string) => [
  { href: `/project/${projectId}/admin/materials`, label: 'Materials' },
  { href: `/project/${projectId}/admin/labor-tasks`, label: 'Labor Tasks' },
  { href: `/project/${projectId}/admin/rates`, label: 'Rates' },
  { href: `/project/${projectId}/admin/pass-throughs`, label: 'Pass Throughs' },
  { href: `/project/${projectId}/admin/defaults`, label: 'Defaults' },
];

export default function ProjectAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const navItems = ADMIN_NAV_ITEMS(params.projectId);

  return (
    <div className="min-h-screen bg-mist">
      <header className="flex items-center justify-between bg-navy-deep text-white px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-white/50">
            Project Admin
          </span>
          <span className="font-display text-lg font-semibold text-white">DAS Bid Estimator</span>
        </div>
        <Link
          href={`/project/${params.projectId}`}
          className="font-body text-sm text-white/70 transition-colors hover:text-white"
        >
          ← Back to Estimator
        </Link>
      </header>
      <main className="p-6 space-y-6">
        <nav className="flex gap-2 border-b border-line pb-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded font-body text-sm text-slate hover:bg-mist-2 hover:text-navy transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </main>
    </div>
  );
}
