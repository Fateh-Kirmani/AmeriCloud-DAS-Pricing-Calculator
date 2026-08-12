'use client';

import { useEstimate } from '@/lib/estimate/EstimateContext';
import { MoveToButton } from '@/components/MoveToButton';

const CUSTOMER_TYPES = ['Direct Customer', 'General Contractor', 'Sub/Tier'];

export default function CoverInfoPage() {
  const { coverInfo, setCoverInfo, projectId } = useEstimate();

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy mb-6">Cover Info</h1>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate">Client</span>
          <input
            className="border border-line rounded px-3 py-2"
            value={coverInfo.client}
            onChange={(e) => setCoverInfo({ client: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate">Project</span>
          <input
            className="border border-line rounded px-3 py-2"
            value={coverInfo.project}
            onChange={(e) => setCoverInfo({ project: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate">RFP Received Date</span>
          <input
            type="date"
            className="border border-line rounded px-3 py-2"
            value={coverInfo.rfpDate}
            onChange={(e) => setCoverInfo({ rfpDate: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate">Bid Due Date</span>
          <input
            type="date"
            className="border border-line rounded px-3 py-2"
            value={coverInfo.bidDueDate}
            onChange={(e) => setCoverInfo({ bidDueDate: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate">Estimated By</span>
          <input
            className="border border-line rounded px-3 py-2"
            value={coverInfo.estimator}
            onChange={(e) => setCoverInfo({ estimator: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate">Customer Type</span>
          <select
            className="border border-line rounded px-3 py-2"
            value={coverInfo.customerType}
            onChange={(e) => setCoverInfo({ customerType: e.target.value })}
          >
            <option value="">Select…</option>
            {CUSTOMER_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate">Customer Contact Name</span>
          <input
            className="border border-line rounded px-3 py-2"
            value={coverInfo.contactName}
            onChange={(e) => setCoverInfo({ contactName: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate">Phone</span>
          <input
            className="border border-line rounded px-3 py-2"
            value={coverInfo.contactPhone}
            onChange={(e) => setCoverInfo({ contactPhone: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate">Email</span>
          <input
            className="border border-line rounded px-3 py-2"
            value={coverInfo.contactEmail}
            onChange={(e) => setCoverInfo({ contactEmail: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-sm text-slate">Job Site Address</span>
          <input
            className="border border-line rounded px-3 py-2"
            value={coverInfo.jobSiteAddress}
            onChange={(e) => setCoverInfo({ jobSiteAddress: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-sm text-slate">Project Overview</span>
          <textarea
            className="border border-line rounded px-3 py-2"
            rows={4}
            value={coverInfo.projectOverview}
            onChange={(e) => setCoverInfo({ projectOverview: e.target.value })}
          />
        </label>
      </div>

      <div className="mt-8">
        <MoveToButton href={`/project/${projectId}/materials`} label="→ Materials" />
      </div>
    </div>
  );
}
