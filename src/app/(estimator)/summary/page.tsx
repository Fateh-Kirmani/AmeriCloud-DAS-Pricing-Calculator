// src/app/summary/page.tsx
'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useEstimate } from '@/lib/estimate/EstimateContext';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { parseNumericInput } from '@/lib/utils/parseNumericInput';
import {
  backSolveCategoryMarkupsFromPreTweakPercent,
  backSolveMarginTweakFromPostTweakPercent,
} from '@/lib/calc/markupBackSolve';
import { EstimatePdfDocument } from '@/components/EstimatePdfDocument';
import { pdfFileName } from '@/lib/utils/pdfFileName';
import { Term } from '@/components/Term';

// PDFDownloadLink's TypeScript types (as of @react-pdf/renderer 3.4.x) declare
// `children` as `ReactNode | ReactElement<BlobProviderParams>`, which does not
// admit a render-prop function even though the runtime implementation calls
// `children(instance)` when `children` is a function (verified against the
// library's browser build). BlobProvider's `children` is correctly typed as
// `(params: BlobProviderParams) => ReactNode`, so it is used here instead to
// build the same "anchor that downloads the generated blob" behavior without
// fighting an upstream type definition bug.
const BlobProvider = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.BlobProvider),
  { ssr: false },
);

function Row({
  label,
  value,
  strong = false,
  dark = false,
}: {
  label: ReactNode;
  value: string;
  strong?: boolean;
  dark?: boolean;
}) {
  return (
    <div className={`flex justify-between py-1 ${strong ? 'font-display text-navy' : 'text-sm'}`}>
      <span className={strong ? '' : dark ? 'text-white/70' : 'text-slate'}>{label}</span>
      <span className={strong ? 'font-semibold' : ''}>{value}</span>
    </div>
  );
}

export default function SummaryPage() {
  const { result, input, setMarkups, coverInfo } = useEstimate();
  const es = result.executiveSummary;
  const markupPercentPostTweak = es.totalDirectCostBreakEven
    ? es.projectedGrossMarginTotal / es.totalDirectCostBreakEven - 1
    : 0;
  const [venueVisible, setVenueVisible] = useState(false);
  const [venueSqft, setVenueSqft] = useState(0);

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Executive Summary</h1>

      <BlobProvider document={<EstimatePdfDocument coverInfo={coverInfo} result={result} />}>
        {({ url, loading }) => (
          <a
            href={url ?? undefined}
            download={pdfFileName(coverInfo.client, coverInfo.project)}
            className="inline-block bg-red hover:bg-red-700 text-white font-display font-semibold px-6 py-3 rounded transition-colors"
          >
            {loading ? 'Preparing PDF…' : 'Export PDF'}
          </a>
        )}
      </BlobProvider>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2">Labor</h2>
        <Row label="Operational Labor" value={formatCurrency(es.operationalLaborCost)} />
        <Row label="Admin Labor" value={formatCurrency(es.opsAdminLaborCost)} />
        <Row label="Travel" value={formatCurrency(es.travelCost)} />
        <Row label="Total Project Labor" value={formatCurrency(es.totalProjectLaborBilled)} strong />
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2">Pass Through</h2>
        <Row label="Per Diem" value={formatCurrency(es.perDiemCost)} />
        <Row label="Lodging" value={formatCurrency(es.lodgingCost)} />
        <Row label="Airfare" value={formatCurrency(es.airfareCost)} />
        <Row label="Rentals" value={formatCurrency(es.rentalsCost)} />
        <Row label="Soft Costs" value={formatCurrency(es.softCostsCost)} />
        <Row label="Total Pass Through Expense" value={formatCurrency(es.totalPassThroughBilled)} strong />
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2">Material</h2>
        <Row label="Consumable" value={formatCurrency(es.consumableCost)} />
        <Row
          label={
            <Term definition="Distributed Antenna System — in-building wireless coverage infrastructure">
              DAS Materials
            </Term>
          }
          value={formatCurrency(es.dasMaterialsCost)}
        />
        <Row label="BAT Materials" value={formatCurrency(es.batMaterialsCost)} />
        <Row label="S&H / Material Contingency" value={formatCurrency(es.materialContingencyAndSH)} />
        <Row label="Total Materials" value={formatCurrency(es.totalMaterialBilled)} strong />
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2">
          <Term definition="The bid's cost picture before corporate overhead is added — direct costs plus your own margin tweak">
            Projected Gross Margins
          </Term>
        </h2>
        <Row label="Total Direct Cost" value={formatCurrency(es.totalDirectCost)} strong />
        <Row label="Projected Gross Profit $$" value={formatCurrency(es.grossProfit)} />
        <label className="flex justify-between items-center py-1">
          <span className="text-sm text-slate">Mark-Up %</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              className="w-20 border border-line rounded px-2 py-1 text-right"
              value={(es.markupPercent * 100).toFixed(1)}
              onChange={(e) => {
                const rates = backSolveCategoryMarkupsFromPreTweakPercent(
                  parseNumericInput(e.target.value) / 100,
                  es.totalDirectCostBreakEven,
                );
                if (rates) setMarkups(rates);
              }}
            />
            <span className="text-sm text-slate">%</span>
          </div>
        </label>
        <Row label="Gross Margin %" value={`${(es.grossMarginPercent * 100).toFixed(1)}%`} />
        <label className="flex justify-between items-center py-2">
          <span className="text-slate text-sm">Tweak for Margin Target ($)</span>
          <input
            type="number"
            className="w-32 border border-line rounded px-2 py-1 text-right"
            value={input.markups.marginTweak}
            onChange={(e) => setMarkups({ marginTweak: parseNumericInput(e.target.value) })}
          />
        </label>
        <label className="flex justify-between items-center py-1">
          <span className="text-sm text-slate">
            <Term definition="The Mark-Up % after your manual margin tweak is applied — reflects the PGM Grand Total instead of the pre-tweak Total Direct Cost">
              Mark-Up % Post Tweak
            </Term>
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              className="w-20 border border-line rounded px-2 py-1 text-right"
              value={(markupPercentPostTweak * 100).toFixed(1)}
              onChange={(e) => {
                const tweak = backSolveMarginTweakFromPostTweakPercent(
                  parseNumericInput(e.target.value) / 100,
                  es.totalDirectCostBreakEven,
                  es.totalDirectCost,
                );
                if (tweak !== null) setMarkups({ marginTweak: tweak });
              }}
            />
            <span className="text-sm text-slate">%</span>
          </div>
        </label>
        <Row
          label={
            <Term definition="Projected Gross Margin Grand Total — total direct cost (labor, pass-throughs, and materials, each after their own markup) plus your manual margin tweak, before corporate overhead is added">
              PGM Grand Total
            </Term>
          }
          value={formatCurrency(es.projectedGrossMarginTotal)}
          strong
        />
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2">
          <Term definition="The PGM total plus corporate overhead — the company's fully-loaded internal cost basis for this bid">
            Projected Net Margins
          </Term>
        </h2>
        <Row
          label={
            <Term definition="The corporate overhead percentage applied to the PGM Grand Total to arrive at the Projected Net Margin Total">
              Mark-Up for Corporate
            </Term>
          }
          value={formatCurrency(es.corporateMarkupCost)}
        />
        <Row
          label={
            <Term definition="Projected Net Margin Grand Total — the PGM Grand Total plus the corporate mark-up; the internal total before the labor/material split and tax that produce the customer-facing Grand Total to Bid">
              PNM Grand Total
            </Term>
          }
          value={formatCurrency(es.projectedNetMarginTotal)}
          strong
        />
        <Row label="Projected Net Profit $$" value={formatCurrency(es.netProfit)} />
        <Row label="Net Margin %" value={`${(es.netMarginPercent * 100).toFixed(1)}%`} />
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <button
          className="text-navy underline text-sm mb-2"
          onClick={() => setVenueVisible((v) => !v)}
        >
          {venueVisible ? 'Hide' : 'Show'} venue $/sqft metrics
        </button>
        {venueVisible && (
          <div>
            <label className="flex justify-between items-center py-1">
              <span className="text-slate text-sm">Venue Covered Sqft</span>
              <input
                type="number"
                className="w-32 border border-line rounded px-2 py-1 text-right"
                value={venueSqft}
                onChange={(e) => setVenueSqft(parseNumericInput(e.target.value))}
              />
            </label>
            <Row
              label="ACT Quote / sqft"
              value={venueSqft ? formatCurrency(es.grandTotalToBidTaxIncluded / venueSqft) : '—'}
            />
          </div>
        )}
      </section>

      <section className="bg-navy rounded-lg shadow p-6 text-white">
        <Row label="Total Labor to Bid" value={formatCurrency(es.totalLaborToBid)} dark />
        <Row label="Total Material to Bid" value={formatCurrency(es.totalMaterialToBid)} dark />
        <div className="flex justify-between items-center pt-3 mt-3 border-t border-white/20">
          <span className="font-display text-lg">Grand Total to Bid (Tax Exempt)</span>
          <span className="font-display text-xl">{formatCurrency(es.grandTotalToBidTaxExempt)}</span>
        </div>
        <Row label={`Tax (${(input.markups.taxRate * 100).toFixed(2)}%)`} value={formatCurrency(es.taxAmount)} dark />
        <div className="flex justify-between items-center pt-3 mt-3 border-t border-white/20">
          <span className="font-display text-lg">Grand Total to Bid (Tax Included)</span>
          <span className="font-display text-2xl text-white border-b-2 border-red pb-0.5">
            {formatCurrency(es.grandTotalToBidTaxIncluded)}
          </span>
        </div>
      </section>
    </div>
  );
}
