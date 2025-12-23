import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRentalLeases, fetchRentalProperties, RentalLeaseRecord, RentalPropertyRecord, updateRentalTaxSchedule } from '@/lib/api/rentals';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

const tabs = [
  { id: 'properties', label: 'Properties' },
  { id: 'leases', label: 'Leases & Taxes' }
] as const;

export default function BrokerRentals() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  if (!orgId) return <div className="text-sm text-slate-600">Select an organization to view rentals.</div>;
  return (
    <div className="space-y-6">
      <RentalsView orgId={orgId} />
    </div>
  );
}

function RentalsView({ orgId }: { orgId: string }) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['id']>('properties');
  const queryClient = useQueryClient();
  const { data: properties, isLoading: propertiesLoading } = useQuery({
    queryKey: ['rentals', 'properties', orgId],
    queryFn: () => fetchRentalProperties(orgId),
    staleTime: 30_000
  });
  const { data: leases, isLoading: leasesLoading } = useQuery({
    queryKey: ['rentals', 'leases', orgId],
    queryFn: () => fetchRentalLeases(orgId),
    staleTime: 30_000
  });

  const taxMutation = useMutation({
    mutationFn: ({ taxScheduleId }: { taxScheduleId: string }) =>
      updateRentalTaxSchedule(orgId, taxScheduleId, {
        status: 'PAID',
        paidDate: new Date().toISOString()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rentals', 'leases', orgId] });
      queryClient.invalidateQueries({ queryKey: ['mission-control', 'overview', orgId] });
    }
  });

  const propertiesList = properties ?? [];
  const leasesList = leases ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Rentals & PM</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Property management backbone</h1>
          <p className="text-sm text-slate-600">
            View properties under management, monitor leases, and keep seasonal tax filings on schedule.
          </p>
        </div>
        <div className="flex rounded-full border border-[var(--glass-border)] bg-white/10 p-1 backdrop-blur-md">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-1 text-sm font-medium ${
                activeTab === tab.id ? 'border border-white/20 bg-white/35 text-slate-900 shadow-brand' : 'text-slate-600 hover:bg-white/20 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'properties' ? (
        <PropertiesTable properties={propertiesList} isLoading={propertiesLoading} />
      ) : (
        <LeasesTable leases={leasesList} isLoading={leasesLoading} onMarkTaxPaid={taxMutation.mutate} />
      )}
    </section>
  );
}

function PropertiesTable({ properties, isLoading }: { properties: RentalPropertyRecord[]; isLoading: boolean }) {
  return (
    <Card className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Address</th>
            <th className="px-4 py-3 text-left">Type</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Units</th>
            <th className="px-4 py-3 text-left">Owner</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                Loading properties…
              </td>
            </tr>
          ) : properties.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                No rental properties yet.
              </td>
            </tr>
          ) : (
            properties.map((property) => (
              <tr key={property.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {property.addressLine1}, {property.city}
                  </div>
                  <div className="text-xs text-slate-500">
                    {property.state} {property.postalCode}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge className="border bg-slate-50 text-slate-700">{property.propertyType}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge className="border bg-slate-100 text-slate-700">{property.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{property.units.length}</p>
                  {property.units.slice(0, 2).map((unit) => (
                    <p key={unit.id} className="text-xs text-slate-500">
                      {unit.name ?? 'Unit'} · {unit.status}
                    </p>
                  ))}
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-slate-700">{property.ownerName ?? 'N/A'}</div>
                  {property.ownerContact ? <div className="text-xs text-slate-500">{property.ownerContact}</div> : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function LeasesTable({
  leases,
  isLoading,
  onMarkTaxPaid
}: {
  leases: RentalLeaseRecord[];
  isLoading: boolean;
  onMarkTaxPaid: (variables: { taxScheduleId: string }) => void;
}) {
  const rows = useMemo(() => leases, [leases]);

  return (
    <Card className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Lease</th>
            <th className="px-4 py-3 text-left">Dates</th>
            <th className="px-4 py-3 text-left">Financials</th>
            <th className="px-4 py-3 text-left">Tax schedule</th>
            <th className="px-4 py-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                Loading leases…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                No active leases yet.
              </td>
            </tr>
          ) : (
            rows.map((lease) => {
              const upcomingTax = lease.taxSchedule.find((entry) => entry.status === 'PENDING');
              return (
                <tr key={lease.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{lease.unit.property.addressLine1}</div>
                    <div className="text-xs text-slate-500">
                      {lease.unit.property.city}, {lease.unit.property.state}
                    </div>
                    <div className="text-xs text-slate-500">Tenant: {lease.tenantName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {new Date(lease.startDate).toLocaleDateString()} – {new Date(lease.endDate).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-slate-500">{lease.tenancyType}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {lease.rentAmount ? currencyFormatter.format(lease.rentAmount) : '—'}
                    </p>
                    <p className="text-xs text-slate-500">{lease.requiresTaxFiling ? 'Tax filing required' : 'No tax filing'}</p>
                    <p className="text-xs text-slate-500">{lease.isCompliant ? 'Compliant' : 'Action needed'}</p>
                  </td>
                  <td className="px-4 py-3">
                    {upcomingTax ? (
                      <>
                        <p className="text-sm font-medium text-slate-900">{upcomingTax.periodLabel}</p>
                        <p className="text-xs text-slate-500">
                          Due {new Date(upcomingTax.dueDate).toLocaleDateString()} · {upcomingTax.status}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">No pending taxes</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!upcomingTax}
                        onClick={() => upcomingTax && onMarkTaxPaid({ taxScheduleId: upcomingTax.id })}
                      >
                        Mark tax paid
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </Card>
  );
}
