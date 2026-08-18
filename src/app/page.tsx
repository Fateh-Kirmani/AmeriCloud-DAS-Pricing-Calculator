// src/app/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { CreateProjectButton } from '@/components/CreateProjectButton';

const HERO_BUTTON_CLASSNAME = 'inline-flex items-center gap-2 bg-red hover:bg-red-700 text-white font-display font-semibold text-base sm:text-lg px-8 sm:px-10 py-4 sm:py-5 rounded-lg transition-colors';

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-deep">
      <div className="absolute inset-x-0 top-0 h-1 bg-red" />
      {/* Faint decorative network/mesh pattern, echoing the topology motif on americloudtelecom.com's
          dark sections — no real photography asset is available for an internal tool, so this
          stands in for their hero photo without pretending to be one. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
        aria-hidden="true"
      >
        <defs>
          <pattern id="mesh" width="120" height="120" patternUnits="userSpaceOnUse">
            <circle cx="60" cy="60" r="2" fill="white" />
            <path d="M60 60 L0 0 M60 60 L120 0 M60 60 L0 120 M60 60 L120 120" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mesh)" />
      </svg>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 flex items-center justify-center gap-2">
          <span className="h-px w-6 bg-red" />
          <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-red">
            DAS Bid Estimator
          </span>
        </div>
        <h1 className="max-w-2xl font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Build accurate DAS bids, faster.
        </h1>
        <p className="mt-4 max-w-xl font-body text-base text-white/70 sm:text-lg">
          Select materials, estimate labor, and roll it all up into a Grand Total to Bid —
          matching the workbook math you already trust.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <CreateProjectButton label="→ Create New Project" className={HERO_BUTTON_CLASSNAME} />
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-8 py-4 font-display text-base font-semibold text-white transition-colors hover:bg-white/10 sm:px-10 sm:py-5 sm:text-lg"
          >
            Explore Current Projects
          </button>
        </div>
      </div>
    </div>
  );
}
