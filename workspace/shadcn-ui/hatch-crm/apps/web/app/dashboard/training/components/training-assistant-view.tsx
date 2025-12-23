"use client";

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { GraduationCap, Loader2, Play } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TrainingVideoSummary, WalkthroughSession, WalkthroughSummary } from '@/lib/api/training-assistant';
import { listTrainingVideos, listWalkthroughs, startWalkthrough } from '@/lib/api/training-assistant';
import { InteractiveWalkthrough } from '@/components/training/InteractiveWalkthrough';
import { VideoPlayer } from '@/components/training/VideoPlayer';
import { PracticeMode } from '@/components/training/PracticeMode';

const walkthroughsKey = ['training', 'walkthroughs'];
const videosKey = ['training', 'videos'];

export function TrainingAssistantView() {
  const [activeTab, setActiveTab] = useState<'walkthroughs' | 'videos' | 'practice'>('walkthroughs');
  const [activeSession, setActiveSession] = useState<WalkthroughSession | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeFeature, setActiveFeature] = useState<string>('create-listing');

  const walkthroughsQuery = useQuery({
    queryKey: walkthroughsKey,
    queryFn: listWalkthroughs,
    staleTime: 30_000
  });

  const videosQuery = useQuery({
    queryKey: videosKey,
    queryFn: listTrainingVideos,
    staleTime: 30_000
  });

  const features = useMemo(() => {
    const fromWalkthroughs = (walkthroughsQuery.data ?? []).map((item) => item.id);
    const fromVideos = (videosQuery.data ?? []).map((item) => item.feature);
    return Array.from(new Set([...fromWalkthroughs, ...fromVideos])).filter(Boolean);
  }, [walkthroughsQuery.data, videosQuery.data]);

  const startMutation = useMutation({
    mutationFn: (feature: string) => startWalkthrough(feature),
    onSuccess: (session) => setActiveSession(session)
  });

  const walkthroughs: WalkthroughSummary[] = walkthroughsQuery.data ?? [];
  const videos: TrainingVideoSummary[] = videosQuery.data ?? [];

  const openWalkthrough = async (feature: string) => {
    setActiveTab('walkthroughs');
    setActiveFeature(feature);
    await startMutation.mutateAsync(feature);
  };

  const openVideo = (videoId: string) => {
    setActiveTab('videos');
    setActiveVideoId(videoId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Training</p>
        <h1 className="text-3xl font-semibold text-slate-900">Walkthrough Assistant</h1>
        <p className="text-sm text-slate-500">Interactive walkthroughs, video help, and practice mode.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="walkthroughs">Walkthroughs</TabsTrigger>
          <TabsTrigger value="videos">Videos</TabsTrigger>
          <TabsTrigger value="practice">Practice</TabsTrigger>
        </TabsList>

        <TabsContent value="walkthroughs" className="space-y-4">
          <Card className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-indigo-600" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Guided Walkthroughs</h2>
                <p className="text-sm text-slate-500">Start a feature walkthrough and follow the on-screen coach.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {walkthroughsQuery.isLoading ? (
                <div className="text-sm text-slate-500">Loading walkthroughs…</div>
              ) : walkthroughs.length === 0 ? (
                <div className="text-sm text-slate-500">No walkthroughs available yet.</div>
              ) : (
                walkthroughs.map((walkthrough) => (
                  <div key={walkthrough.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{walkthrough.title}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-600">{walkthrough.description}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{walkthrough.difficulty}</span>
                          <span>•</span>
                          <span>{walkthrough.estimatedTime}</span>
                          <span>•</span>
                          <span>{walkthrough.totalSteps} steps</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => openWalkthrough(walkthrough.id)}
                        disabled={startMutation.isPending}
                      >
                        {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Sandbox</div>
            <p className="mt-1 text-sm text-slate-500">
              Use this mock UI to test walkthrough overlays (selectors match the create-listing walkthrough).
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" data-nav="properties">
                  Properties
                </Button>
                <Button variant="outline" size="sm" data-nav="leads">
                  Leads
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button data-action="new-draft" size="sm">
                  New Draft
                </Button>
                <Button variant="outline" size="sm" data-action="generate-description">
                  Generate AI Description
                </Button>
                <Button variant="outline" size="sm" data-action="save-draft">
                  Save Draft
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Address</div>
                  <input
                    data-field="address"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="123 Palm Beach Blvd, Fort Myers, FL 33901"
                  />
                </div>

                <div data-section="property-details" className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Property details</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Beds" />
                    <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Baths" />
                    <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Price" />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {activeSession ? (
            <InteractiveWalkthrough
              session={activeSession}
              onExit={() => setActiveSession(null)}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="videos" className="space-y-4">
          <Card className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Training Videos</h2>
                <p className="text-sm text-slate-500">Pick a video and ask questions about any moment.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {videosQuery.isLoading ? (
                <div className="text-sm text-slate-500">Loading videos…</div>
              ) : videos.length === 0 ? (
                <div className="text-sm text-slate-500">No training videos available yet.</div>
              ) : (
                videos.map((video) => (
                  <button
                    key={video.id}
                    type="button"
                    onClick={() => openVideo(video.id)}
                    className={[
                      'rounded-xl border p-3 text-left transition',
                      activeVideoId === video.id ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{video.title}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-600">{video.description}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{video.feature}</span>
                          <span>•</span>
                          <span>{Math.round(video.durationSeconds / 60)} min</span>
                        </div>
                      </div>
                      <div className="rounded-lg bg-white p-2 text-slate-700 shadow-sm">
                        <Play className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          {activeVideoId ? <VideoPlayer videoId={activeVideoId} /> : null}
        </TabsContent>

        <TabsContent value="practice" className="space-y-4">
          <Card className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Choose a feature</div>
            <p className="mt-1 text-sm text-slate-500">Generate a practice scenario for a Hatch feature.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(features.length ? features : ['create-listing']).map((feature) => (
                <Button
                  key={feature}
                  size="sm"
                  variant={activeFeature === feature ? 'default' : 'outline'}
                  onClick={() => setActiveFeature(feature)}
                >
                  {feature}
                </Button>
              ))}
            </div>
          </Card>

          <PracticeMode feature={activeFeature} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

