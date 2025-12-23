'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchOrgListings } from '@/lib/api/org-listings';
import { createMarketingCampaign } from '@/lib/api/marketing';
import {
  createMarketingStudioTemplate,
  generateMarketingStudioAsset,
  listMarketingStudioAssets,
  listMarketingStudioListingImages,
  listMarketingStudioTemplates,
  presignMarketingStudioTemplateUpload,
  seedMarketingStudioTemplates,
  type MarketingStudioAsset,
  type MarketingStudioTemplate
} from '@/lib/api/marketing-studio';
import { useOrgId } from '@/lib/hooks/useOrgId';

import { BASE_FLYER_SCHEMA, TemplateSchemaEditor } from './TemplateSchemaEditor';

const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const templateLayoutSchema = z
  .object({
    imageSlots: z.array(z.object({ id: z.string().min(1) })).optional().default([]),
    textSlots: z.array(z.object({ id: z.string().min(1) })).optional().default([])
  })
  .passthrough();

type TemplateLayout = z.infer<typeof templateLayoutSchema>;

export default function MarketingStudioPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  const [listingId, setListingId] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('');
  const [textOverrides, setTextOverrides] = useState<Record<string, string>>({});
  const [imageOverrides, setImageOverrides] = useState<Record<string, { url?: string; s3Key?: string }>>({});
  const [imageSlotToAssign, setImageSlotToAssign] = useState<string>('');

  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generatedAsset, setGeneratedAsset] = useState<MarketingStudioAsset | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateOverlayFile, setNewTemplateOverlayFile] = useState<File | null>(null);
  const [newTemplateOverlayPageIndex, setNewTemplateOverlayPageIndex] = useState('0');
  const [newTemplateSchema, setNewTemplateSchema] = useState<unknown>(BASE_FLYER_SCHEMA);
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ['marketing-studio', 'templates', orgId],
    queryFn: () => listMarketingStudioTemplates(orgId)
  });

  const marketingStudioEnabled = templatesQuery.data?.entitlements?.marketingStudio ?? false;

  const listingsQuery = useQuery({
    queryKey: ['marketing-studio', 'listings', orgId],
    queryFn: () => fetchOrgListings(orgId),
    staleTime: 30_000
  });

  const assetsQuery = useQuery({
    queryKey: ['marketing-studio', 'assets', orgId, listingId],
    queryFn: () => listMarketingStudioAssets(orgId, listingId),
    enabled: Boolean(listingId) && marketingStudioEnabled
  });

  const listingImagesQuery = useQuery({
    queryKey: ['marketing-studio', 'listing-images', orgId, listingId],
    queryFn: () => listMarketingStudioListingImages(orgId, listingId),
    enabled: Boolean(listingId) && marketingStudioEnabled
  });

  const templatesData = templatesQuery.data?.templates;
  const templates = useMemo(() => templatesData ?? [], [templatesData]);
  const entitlements = templatesQuery.data?.entitlements ?? { marketingStudio: false, whiteLabelMarketing: false };
  const listingsData = listingsQuery.data;
  const listings = useMemo(() => listingsData ?? [], [listingsData]);
  const listingImagesData = listingImagesQuery.data?.images;
  const listingImages = useMemo(() => listingImagesData ?? [], [listingImagesData]);

  const selectedTemplate: MarketingStudioTemplate | null = useMemo(() => {
    return templates.find((tpl) => tpl.id === templateId) ?? null;
  }, [templateId, templates]);

  useEffect(() => {
    if (templateId) return;
    if (templates.length === 0) return;
    const preferred = templates.find((tpl) => tpl.isSystem) ?? templates[0] ?? null;
    if (!preferred) return;
    setTemplateId(preferred.id);
  }, [templateId, templates]);

  const selectedListing = useMemo(() => {
    return listings.find((listing) => listing.id === listingId) ?? null;
  }, [listingId, listings]);

  const templateLayout: TemplateLayout | null = useMemo(() => {
    if (!selectedTemplate) return null;
    const parsed = templateLayoutSchema.safeParse(selectedTemplate.schema);
    if (!parsed.success) return null;
    return parsed.data;
  }, [selectedTemplate]);

  const textSlots = templateLayout?.textSlots ?? [];
  const imageSlots = templateLayout?.imageSlots ?? [];

  const defaultText = useMemo(() => {
    if (!selectedListing) return {};

    const address = selectedListing.addressLine2
      ? `${selectedListing.addressLine1}, ${selectedListing.addressLine2}`
      : selectedListing.addressLine1;
    const cityStateZip = `${selectedListing.city}, ${selectedListing.state} ${selectedListing.postalCode}`;
    const formattedPrice =
      selectedListing.listPrice && Number.isFinite(selectedListing.listPrice)
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
            selectedListing.listPrice
          )
        : '';

    const agentUser = selectedListing.agentProfile?.user ?? null;
    const agentName =
      agentUser && agentUser.firstName
        ? `${agentUser.firstName}${agentUser.lastName ? ` ${agentUser.lastName}` : ''}`.trim()
        : '';
    const agentEmail = agentUser?.email ?? '';

    return {
      address,
      cityStateZip,
      price: formattedPrice,
      agentName,
      agentEmail
    };
  }, [selectedListing]);

  useEffect(() => {
    if (!selectedTemplate) {
      setImageSlotToAssign('');
      setTextOverrides({});
      setImageOverrides({});
      return;
    }

    const allowedText = new Set((templateLayout?.textSlots ?? []).map((slot) => slot.id));
    setTextOverrides((prev) => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (allowedText.has(key)) next[key] = value;
      }
      return next;
    });

    const allowedImages = new Set((templateLayout?.imageSlots ?? []).map((slot) => slot.id));
    setImageOverrides((prev) => {
      const next: Record<string, { url?: string; s3Key?: string }> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (allowedImages.has(key)) next[key] = value;
      }
      return next;
    });

    const heroSlotId = templateLayout?.imageSlots?.find((slot) => slot.id === 'hero')?.id ?? '';
    const firstSlotId = heroSlotId || (templateLayout?.imageSlots?.[0]?.id ?? '');
    setImageSlotToAssign((current) => {
      if (!current) return firstSlotId;
      return allowedImages.has(current) ? current : firstSlotId;
    });
  }, [selectedTemplate, templateLayout]);

  const handleSeedTemplates = async () => {
    setError(null);
    try {
      await seedMarketingStudioTemplates(orgId);
      await queryClient.invalidateQueries({ queryKey: ['marketing-studio', 'templates', orgId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed templates');
    }
  };

  const handleGenerate = async () => {
    if (!listingId || !templateId) {
      setError('Select a listing and template');
      return;
    }

    setError(null);
    setGeneratedUrl(null);
    setGeneratedAsset(null);
    setCreatedCampaignId(null);
    setGenerating(true);

    try {
      const images: Record<string, { url?: string; s3Key?: string }> = {};
      for (const [slotId, override] of Object.entries(imageOverrides)) {
        const s3Key = override.s3Key?.trim();
        const url = override.url?.trim();
        if (s3Key) {
          images[slotId] = { s3Key };
        } else if (url) {
          images[slotId] = { url };
        }
      }

      const result = await generateMarketingStudioAsset(orgId, listingId, {
        templateId,
        text: Object.keys(textOverrides).length > 0 ? textOverrides : undefined,
        images: Object.keys(images).length > 0 ? images : undefined
      });
      setGeneratedUrl(result.asset.downloadUrl ?? null);
      setGeneratedAsset(result.asset ?? null);
      await queryClient.invalidateQueries({ queryKey: ['marketing-studio', 'assets', orgId, listingId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate asset');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateCampaignDraft = async () => {
    setError(null);
    if (!generatedAsset) {
      setError('Generate a PDF first');
      return;
    }

    const assetUrl = generatedAsset.publicUrl ?? generatedAsset.downloadUrl ?? null;
    if (!assetUrl) {
      setError('Generated PDF does not have a URL');
      return;
    }

    setCreatingCampaign(true);
    try {
      const address =
        selectedListing?.addressLine1 && selectedListing?.city
          ? `${selectedListing.addressLine1}, ${selectedListing.city}`
          : selectedListing?.addressLine1 ?? 'Listing';

      const subject = `Listing flyer: ${address}`;
      const body = [
        'Hi there,',
        '',
        `Here is the flyer for **${address}**.`,
        '',
        `[Download flyer](${assetUrl})`,
        '',
        'Best,',
        defaultText.agentName || undefined
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n');

      const campaign = await createMarketingCampaign({
        personaId: 'listing_concierge',
        name: `${address} flyer`,
        subject,
        body,
        callToAction: 'Download flyer',
        status: 'draft',
        channel: 'EMAIL'
      });
      setCreatedCampaignId(campaign.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setCreatingCampaign(false);
    }
  };

  const handleAssignListingImage = (s3Key: string) => {
    if (!imageSlotToAssign) return;
    setImageOverrides((prev) => ({ ...prev, [imageSlotToAssign]: { s3Key } }));

    const slotIds = imageSlots.map((slot) => slot.id);
    if (slotIds.length <= 1) return;
    const currentIndex = slotIds.indexOf(imageSlotToAssign);
    if (currentIndex === -1) return;

    const isAssigned = (slotId: string) => {
      if (slotId === imageSlotToAssign) return true;
      const override = imageOverrides[slotId];
      return Boolean(override?.s3Key?.trim() || override?.url?.trim());
    };

    for (let offset = 1; offset <= slotIds.length; offset += 1) {
      const nextSlotId = slotIds[(currentIndex + offset) % slotIds.length];
      if (!nextSlotId) continue;
      if (!isAssigned(nextSlotId)) {
        setImageSlotToAssign(nextSlotId);
        return;
      }
    }

    setImageSlotToAssign(slotIds[(currentIndex + 1) % slotIds.length] ?? imageSlotToAssign);
  };

  const handleCreateTemplate = async () => {
    setError(null);
    if (!newTemplateName.trim()) {
      setError('Template name is required');
      return;
    }

    setCreatingTemplate(true);
    try {
      let overlayS3Key: string | undefined;
      if (newTemplateOverlayFile) {
        const mimeType = newTemplateOverlayFile.type || 'application/pdf';
        const presign = await presignMarketingStudioTemplateUpload(orgId, {
          fileName: newTemplateOverlayFile.name,
          mimeType
        });

        const uploadRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: newTemplateOverlayFile
        });
        if (!uploadRes.ok) {
          throw new Error(`Overlay upload failed (${uploadRes.status})`);
        }
        overlayS3Key = presign.key;
      }

      const overlayPageIndex = Number.parseInt(newTemplateOverlayPageIndex, 10);

      const created = await createMarketingStudioTemplate(orgId, {
        name: newTemplateName.trim(),
        description: newTemplateDescription.trim() ? newTemplateDescription.trim() : null,
        overlayS3Key: overlayS3Key ?? null,
        overlayPageIndex: Number.isFinite(overlayPageIndex) ? overlayPageIndex : 0,
        schema: newTemplateSchema
      });

      await queryClient.invalidateQueries({ queryKey: ['marketing-studio', 'templates', orgId] });
      setTemplateId(created.template.id);
      setNewTemplateName('');
      setNewTemplateDescription('');
      setNewTemplateOverlayFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setCreatingTemplate(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">Marketing Studio</h1>
            <Badge variant="secondary">Beta</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Generate listing flyers and branded assets from templates. Swap photos, update contact info, then export.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/marketing">Overview</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/marketing/campaigns">Campaigns</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          Marketing Studio: {entitlements.marketingStudio ? 'Enabled' : 'Disabled'}
        </Badge>
        <Badge variant="outline">White-label only</Badge>
      </div>

      {!entitlements.marketingStudio ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Add-on required</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Marketing Studio is disabled for this organization. Enable the add-on (DB: `OrganizationAddon.key=marketing_studio`) or set
            `ADDON_MARKETING_STUDIO=true` in the API env for development.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-sm font-semibold">Generate</CardTitle>
              {templates.length === 0 ? (
                <Button size="sm" variant="outline" onClick={handleSeedTemplates} disabled={templatesQuery.isLoading}>
                  Seed default templates
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Listing</p>
                  <Select value={listingId} onValueChange={setListingId}>
                    <SelectTrigger>
                      <SelectValue placeholder={listingsQuery.isLoading ? 'Loading listings…' : 'Select a listing'} />
                    </SelectTrigger>
                    <SelectContent>
                      {listings.map((listing) => (
                        <SelectItem key={listing.id} value={listing.id}>
                          {listing.addressLine1}, {listing.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Template</p>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder={templatesQuery.isLoading ? 'Loading templates…' : 'Select a template'} />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplate?.overlayUrl ? (
                    <a href={selectedTemplate.overlayUrl} target="_blank" rel="noreferrer" className="text-xs text-slate-600 underline">
                      View overlay PDF
                    </a>
                  ) : null}
                </div>
              </div>

              {selectedTemplate ? (
                <div className="flex flex-col gap-4">
                  {imageSlots.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Image slots</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        {imageSlots.map((slot) => (
                          <div key={slot.id} className="space-y-2 rounded-md border border-muted p-3">
                            <p className="text-sm font-medium">{slot.id}</p>
                            <div className="space-y-2">
                              <Input
                                value={imageOverrides[slot.id]?.url ?? ''}
                                onChange={(event) =>
                                  setImageOverrides((prev) => ({
                                    ...prev,
                                    [slot.id]: { ...(prev[slot.id] ?? {}), url: event.target.value }
                                  }))
                                }
                                placeholder="Image URL override (https://…)"
                              />
                              <Input
                                value={imageOverrides[slot.id]?.s3Key ?? ''}
                                onChange={(event) =>
                                  setImageOverrides((prev) => ({
                                    ...prev,
                                    [slot.id]: { ...(prev[slot.id] ?? {}), s3Key: event.target.value }
                                  }))
                                }
                                placeholder="S3 key override (property-images/…)"
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {listingId ? (
                        <div className="space-y-2">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Listing photos</p>
                            {imageSlots.length > 1 ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Assign to</span>
                                <Select value={imageSlotToAssign} onValueChange={setImageSlotToAssign}>
                                  <SelectTrigger className="h-9 w-48">
                                    <SelectValue placeholder="Select slot" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {imageSlots.map((slot) => (
                                      <SelectItem key={slot.id} value={slot.id}>
                                        {slot.id}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </div>

                          {listingImagesQuery.isLoading ? (
                            <p className="text-sm text-muted-foreground">Loading listing photos…</p>
                          ) : listingImages.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No listing photos found in storage.</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {listingImages.map((image) => (
                                <button
                                  key={image.s3Key}
                                  type="button"
                                  onClick={() => handleAssignListingImage(image.s3Key)}
                                  className="group relative aspect-[4/3] overflow-hidden rounded-md border border-muted"
                                  title={`Assign ${imageSlotToAssign || imageSlots[0]?.id || 'slot'}`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-semibold text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                                    Assign
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {textSlots.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Text slots</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        {textSlots.map((slot) => (
                          <div key={slot.id} className="space-y-2">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">{slot.id}</p>
                            <Input
                              value={textOverrides[slot.id] ?? ''}
                              onChange={(event) =>
                                setTextOverrides((prev) => ({
                                  ...prev,
                                  [slot.id]: event.target.value
                                }))
                              }
                              placeholder={defaultText[slot.id as keyof typeof defaultText] ?? ''}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? 'Generating…' : 'Generate PDF'}
                </Button>
                {generatedUrl ? (
                  <a href={generatedUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                    Download generated PDF
                  </a>
                ) : null}
                {generatedAsset ? (
                  <Button type="button" variant="outline" onClick={handleCreateCampaignDraft} disabled={creatingCampaign}>
                    {creatingCampaign ? 'Creating campaign…' : 'Create campaign draft'}
                  </Button>
                ) : null}
                {createdCampaignId ? (
                  <Link href="/dashboard/marketing/campaigns" className="text-sm underline">
                    View in Campaigns
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Create template</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Name</p>
                <Input value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} placeholder="Flyer (My brand)" />
                <p className="text-xs text-muted-foreground">Templates are always generated as white-label.</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Description (optional)</p>
                <Input value={newTemplateDescription} onChange={(event) => setNewTemplateDescription(event.target.value)} placeholder="1-page listing flyer with your branding." />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Overlay PDF (optional)</p>
                  <Input type="file" accept="application/pdf" onChange={(event) => setNewTemplateOverlayFile(event.target.files?.[0] ?? null)} />
                  {newTemplateOverlayFile ? <p className="text-xs text-muted-foreground">Selected: {newTemplateOverlayFile.name}</p> : null}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Overlay page index</p>
                  <Input type="number" min={0} value={newTemplateOverlayPageIndex} onChange={(event) => setNewTemplateOverlayPageIndex(event.target.value)} />
                </div>
              </div>

              <TemplateSchemaEditor value={newTemplateSchema} onChange={setNewTemplateSchema} disabled={creatingTemplate} />

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleCreateTemplate} disabled={creatingTemplate}>
                  {creatingTemplate ? 'Creating…' : 'Create template'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {listingId ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Generated assets</CardTitle>
              </CardHeader>
              <CardContent>
                {assetsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading assets…</p>
                ) : (assetsQuery.data?.assets ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assets yet for this listing.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Created</th>
                          <th className="px-3 py-2 text-left font-semibold">Template</th>
                          <th className="px-3 py-2 text-right font-semibold">Download</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(assetsQuery.data?.assets ?? []).map((asset) => (
                          <tr key={asset.id} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="px-3 py-2 text-left">{formatDateTime(asset.createdAt)}</td>
                            <td className="px-3 py-2 text-left">{asset.template?.name ?? asset.templateId}</td>
                            <td className="px-3 py-2 text-right">
                              {asset.downloadUrl ? (
                                <a href={asset.downloadUrl} target="_blank" rel="noreferrer" className="underline">
                                  Download
                                </a>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
