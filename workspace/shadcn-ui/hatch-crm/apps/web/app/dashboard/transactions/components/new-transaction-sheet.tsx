"use client";

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import { createOrgTransaction } from '@/lib/api/org-transactions';
import { fetchOrgListings } from '@/lib/api/org-listings';

export function NewTransactionSheet({
  orgId,
  open,
  onOpenChange
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: listings, isLoading: listingsLoading } = useQuery({
    queryKey: ['dashboard', 'transactions', 'new', 'listings', orgId],
    queryFn: () => fetchOrgListings(orgId),
    enabled: open,
    staleTime: 30_000
  });

  const listingOptions = useMemo(() => {
    return (listings ?? []).map((listing) => ({
      id: listing.id,
      label: `${listing.addressLine1}, ${listing.city} ${listing.state} ${listing.postalCode}`.trim()
    }));
  }, [listings]);

  const [listingId, setListingId] = useState<string>('');
  const [buyerName, setBuyerName] = useState<string>('');
  const [sellerName, setSellerName] = useState<string>('');
  const [closingDate, setClosingDate] = useState<string>('');

  const createMutation = useMutation({
    mutationFn: async () =>
      createOrgTransaction(orgId, {
        listingId: listingId.trim().length ? listingId : undefined,
        buyerName: buyerName.trim().length ? buyerName.trim() : undefined,
        sellerName: sellerName.trim().length ? sellerName.trim() : undefined,
        closingDate: closingDate.trim().length ? closingDate : undefined
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'transactions', orgId] });
      toast({ title: 'Transaction created', description: 'Added to the pipeline.' });
      setListingId('');
      setBuyerName('');
      setSellerName('');
      setClosingDate('');
      onOpenChange(false);
    },
    onError: (error) =>
      toast({
        variant: 'destructive',
        title: 'Create failed',
        description: error instanceof Error ? error.message : 'Unable to create transaction right now.'
      })
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New transaction</SheetTitle>
          <SheetDescription>Create a transaction and place it into the Pre-contract stage.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Link to property (optional)</label>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={listingId}
              onChange={(event) => setListingId(event.target.value)}
              disabled={listingsLoading}
            >
              <option value="">Unlinked</option>
              {listingOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">Linking helps auto-fill contract templates later.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buyer name</label>
              <Input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="Jane Buyer" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seller name</label>
              <Input value={sellerName} onChange={(event) => setSellerName(event.target.value)} placeholder="Sam Seller" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Closing date</label>
            <Input type="date" value={closingDate} onChange={(event) => setClosingDate(event.target.value)} />
          </div>
        </div>

        <SheetFooter className="mt-8 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create transaction'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
