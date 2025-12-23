import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { fetchOrgListings } from '@/lib/api/org-listings';
import { createMarketingCampaign } from '@/lib/api/hatch';
import {
  createMarketingStudioTemplate,
  generateMarketingStudioAsset,
  listMarketingStudioAssets,
  listMarketingStudioListingImages,
  listMarketingStudioTemplates,
  presignMarketingStudioTemplateUpload,
  seedMarketingStudioTemplates,
  type MarketingStudioAsset,
  type MarketingStudioTemplate,
  type MarketingStudioTemplateVariant
} from '@/lib/api/marketing-studio';

import { BASE_FLYER_SCHEMA, TemplateSchemaEditor } from './marketing-studio/TemplateSchemaEditor';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

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

type QuickFormat = 'FLYER' | 'SOCIAL_POST' | 'STORY' | 'EMAIL';

const QUICK_FORMATS: Array<{ id: QuickFormat; label: string; templateKey: string | null; helper: string }> = [
  { id: 'FLYER', label: 'Flyer (PDF)', templateKey: 'flyer_basic_white_label', helper: '1-page PDF flyer.' },
  { id: 'SOCIAL_POST', label: 'Social post (Square)', templateKey: 'social_post_square_white_label', helper: 'Square layout for IG/FB feeds.' },
  { id: 'STORY', label: 'Story (Vertical)', templateKey: 'story_vertical_white_label', helper: 'Vertical layout for stories.' },
  { id: 'EMAIL', label: 'Email snippet', templateKey: null, helper: 'Generates caption + subject line (no PDF required).' }
];

export default function BrokerMarketingStudioPage() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  const queryClient = useQueryClient();

  const [listingId, setListingId] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('');
  const [quickFormat, setQuickFormat] = useState<QuickFormat>('FLYER');
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
  const [newTemplateVariant, setNewTemplateVariant] = useState<MarketingStudioTemplateVariant>('HATCH_BRANDED');
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

  const missingDefaultTemplateKeys = useMemo(() => {
    const required = QUICK_FORMATS.map((format) => format.templateKey).filter(Boolean) as string[];
    const existing = new Set(templates.map((template) => template.key).filter(Boolean) as string[]);
    return required.filter((key) => !existing.has(key));
  }, [templates]);

  const showSeedTemplates = templates.length === 0 || missingDefaultTemplateKeys.length > 0;

  const selectedTemplate: MarketingStudioTemplate | null = useMemo(() => {
    return templates.find((tpl) => tpl.id === templateId) ?? null;
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

  const suggestedCopy = useMemo(() => {
    if (!selectedListing) {
      return {
        subject: 'New listing',
        caption: 'Select a listing to generate suggested copy.',
        hashtags: '#realestate #homesforsale'
      };
    }

    const address = selectedListing.addressLine1;
    const city = selectedListing.city;
    const state = selectedListing.state;
    const location = [city, state].filter(Boolean).join(', ');
    const price =
      selectedListing.listPrice && Number.isFinite(Number(selectedListing.listPrice))
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
            Number(selectedListing.listPrice)
          )
        : null;

    const headline = `${address}${location ? ` · ${location}` : ''}`;

    const caption =
      quickFormat === 'EMAIL'
        ? `Hi!\n\nSharing a new listing: ${headline}${price ? ` · ${price}` : ''}.\n\nReply for the brochure or to schedule a showing.`
        : `Just listed: ${headline}${price ? ` · ${price}` : ''}\n\nDM us for the brochure or to schedule a private showing.`;

    const hashtags = [
      '#realestate',
      '#newlisting',
      city ? `#${city.replace(/\\s+/g, '').toLowerCase()}realestate` : null,
      state ? `#${state.replace(/\\s+/g, '').toLowerCase()}` : null
    ]
      .filter(Boolean)
      .join(' ');

    return {
      subject: `Listing: ${address}${city ? ` (${city})` : ''}`,
      caption,
      hashtags
    };
  }, [quickFormat, selectedListing]);

  useEffect(() => {
    const desiredKey = QUICK_FORMATS.find((format) => format.id === quickFormat)?.templateKey ?? null;
    if (!desiredKey) return;
    if (!templates.length) return;

    const match = templates.find((template) => template.key === desiredKey) ?? null;
    if (match && match.id !== templateId) {
      setTemplateId(match.id);
    }
  }, [quickFormat, templateId, templates]);

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

    const firstSlotId = templateLayout?.imageSlots?.[0]?.id ?? '';
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
    if (!listingId) {
      setError('Select a listing');
      return;
    }
    if (quickFormat !== 'EMAIL' && !templateId) {
      setError('Select a template (or seed default templates)');
      return;
    }

    setError(null);
    setGeneratedUrl(null);
    setGeneratedAsset(null);
    setCreatedCampaignId(null);
    setGenerating(true);

    try {
      if (quickFormat === 'EMAIL') {
        return;
      }
      const images = Object.fromEntries(
        Object.entries(imageOverrides)
          .map(([slotId, override]) => {
            const s3Key = override.s3Key?.trim();
            const url = override.url?.trim();
            if (s3Key) return [slotId, { s3Key }] as const;
            if (url) return [slotId, { url }] as const;
            return null;
          })
          .filter((entry): entry is readonly [string, { url?: string; s3Key?: string }] => Boolean(entry))
      );

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
        'Hatch'
      ].join('\n');

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
        variant: newTemplateVariant,
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
    <div className="space-y-4">
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
            <Link to="/broker/marketing">Overview</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/broker/marketing/campaign-center">Campaign Center</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">Marketing Studio: {entitlements.marketingStudio ? 'Enabled' : 'Disabled'}</Badge>
        <Badge variant="outline">White label: {entitlements.whiteLabelMarketing ? 'Enabled' : 'Disabled'}</Badge>
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
              <CardTitle className="text-sm font-semibold">Quick create</CardTitle>
              {showSeedTemplates ? (
                <Button size="sm" variant="outline" onClick={handleSeedTemplates} disabled={templatesQuery.isLoading}>
                  {templates.length === 0 ? 'Seed default templates' : 'Sync default templates'}
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
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Format</p>
                  <Select value={quickFormat} onValueChange={(value) => setQuickFormat(value as QuickFormat)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a format" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUICK_FORMATS.map((format) => (
                        <SelectItem key={format.id} value={format.id}>
                          {format.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {QUICK_FORMATS.find((format) => format.id === quickFormat)?.helper ?? ''}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Suggested copy</p>
                <Textarea value={suggestedCopy.caption} readOnly rows={4} />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Subject: {suggestedCopy.subject}</span>
                  <span>·</span>
                  <span>{suggestedCopy.hashtags}</span>
                </div>
              </div>

              <details className="rounded-2xl border border-slate-200/70 bg-white/10 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-900">Advanced layout</summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                      <a
                        href={selectedTemplate.overlayUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-600 underline"
                      >
                        View overlay PDF
                      </a>
                    ) : null}
                  </div>
                </div>

                {selectedTemplate ? (
                  <div className="mt-4 flex flex-col gap-4">
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
                              placeholder={(defaultText as Record<string, string>)[slot.id] ?? ''}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Select a template to customize slots.</p>
                )}
              </details>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? 'Generating…' : quickFormat === 'EMAIL' ? 'Generate copy' : 'Generate PDF'}
                </Button>
                {quickFormat !== 'EMAIL' && generatedUrl ? (
                  <a href={generatedUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                    Download generated PDF
                  </a>
                ) : null}
                {quickFormat !== 'EMAIL' && generatedAsset ? (
                  <Button type="button" variant="outline" onClick={handleCreateCampaignDraft} disabled={creatingCampaign}>
                    {creatingCampaign ? 'Creating campaign…' : 'Create campaign draft'}
                  </Button>
                ) : null}
                {createdCampaignId ? (
                  <Link to="/broker/marketing/campaign-center" className="text-sm underline">
                    View in Campaign Center
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <details className="rounded-2xl border border-slate-200/70 bg-white/10 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-900">Template builder (advanced)</summary>
            <div className="mt-4">
              <Card className="border border-slate-200/70">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Create template</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Name</p>
                  <Input
                    value={newTemplateName}
                    onChange={(event) => setNewTemplateName(event.target.value)}
                    placeholder="Flyer (My brand)"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Variant</p>
                  <Select value={newTemplateVariant} onValueChange={(value) => setNewTemplateVariant(value as MarketingStudioTemplateVariant)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a variant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HATCH_BRANDED">Hatch branded</SelectItem>
                      <SelectItem value="WHITE_LABEL" disabled={!entitlements.whiteLabelMarketing}>
                        White label
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {!entitlements.whiteLabelMarketing ? (
                    <p className="text-xs text-muted-foreground">White label templates require the add-on.</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Description (optional)</p>
                <Input
                  value={newTemplateDescription}
                  onChange={(event) => setNewTemplateDescription(event.target.value)}
                  placeholder="1-page listing flyer with your branding."
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Overlay PDF (optional)</p>
                  <Input type="file" accept="application/pdf" onChange={(event) => setNewTemplateOverlayFile(event.target.files?.[0] ?? null)} />
                  {newTemplateOverlayFile ? <p className="text-xs text-muted-foreground">Selected: {newTemplateOverlayFile.name}</p> : null}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Overlay page index</p>
                  <Input
                    type="number"
                    min={0}
                    value={newTemplateOverlayPageIndex}
                    onChange={(event) => setNewTemplateOverlayPageIndex(event.target.value)}
                  />
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
            </div>
          </details>

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
