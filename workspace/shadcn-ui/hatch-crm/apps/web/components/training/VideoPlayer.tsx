"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, MessageCircle, Play, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  askAboutVideoMoment,
  getVideoIndex,
  listTrainingVideos,
  type TrainingVideoSummary,
  type VideoAnswer,
  type VideoIndex
} from '@/lib/api/training-assistant';

function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function VideoPlayer(props: { videoId: string; src?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<VideoAnswer | null>(null);

  const videosQuery = useQuery({
    queryKey: ['training', 'videos'],
    queryFn: listTrainingVideos,
    staleTime: 30_000
  });

  const meta: TrainingVideoSummary | null = useMemo(() => {
    const list = videosQuery.data ?? [];
    return list.find((item) => item.id === props.videoId) ?? null;
  }, [props.videoId, videosQuery.data]);

  const indexQuery = useQuery({
    queryKey: ['training', 'video-index', props.videoId],
    queryFn: (): Promise<VideoIndex> => getVideoIndex(props.videoId),
    staleTime: 30_000
  });

  const askMutation = useMutation({
    mutationFn: () => askAboutVideoMoment({ videoId: props.videoId, timestamp: currentTime, question }),
    onSuccess: (data) => setAnswer(data)
  });

  useEffect(() => {
    setAnswer(null);
    setQuestion('');
    setCurrentTime(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [props.videoId]);

  useEffect(() => {
    if (!videoRef.current) return;
    const el = videoRef.current;
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    el.addEventListener('timeupdate', onTimeUpdate);
    return () => el.removeEventListener('timeupdate', onTimeUpdate);
  }, [videoRef]);

  const duration = meta?.durationSeconds ?? Math.max(60, Math.floor(indexQuery.data?.chapters?.at(-1)?.endSeconds ?? 0));

  return (
    <Card className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Video</div>
          <h3 className="mt-1 truncate text-lg font-semibold text-slate-900">{meta?.title ?? props.videoId}</h3>
          {meta?.description ? <p className="mt-1 text-sm text-slate-500">{meta.description}</p> : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => indexQuery.refetch()} disabled={indexQuery.isFetching}>
          {indexQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
          Refresh index
        </Button>
      </div>

      {props.src ? (
        <div className="mt-4">
          <video
            ref={videoRef}
            src={props.src}
            controls
            className="w-full rounded-xl border border-slate-200 bg-black"
          />
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Video playback isn’t wired yet for this training asset. Use the timeline + chapters below to ask questions by timestamp.
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Ask about this moment</div>
            <div className="text-xs text-slate-500">{formatTimestamp(currentTime)}</div>
          </div>

          <input
            type="range"
            min={0}
            max={duration || 300}
            value={Math.floor(currentTime)}
            onChange={(event) => {
              const seconds = Number(event.target.value);
              setCurrentTime(seconds);
              if (videoRef.current) {
                videoRef.current.currentTime = seconds;
              }
            }}
            className="w-full"
          />

          <div className="grid gap-2 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <Input
                value={Math.floor(currentTime).toString()}
                onChange={(event) => setCurrentTime(Number(event.target.value))}
                placeholder="Timestamp (sec)"
              />
            </div>
            <div className="sm:col-span-3">
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What do you want to know about this part?"
                className="min-h-[72px]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => askMutation.mutate()} disabled={askMutation.isPending || !question.trim()}>
              {askMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
              Ask Hatch
            </Button>
            {meta?.feature ? (
              <Button asChild variant="outline">
                <Link href={answer?.tryItNowLink ?? `/dashboard/${meta.feature}`}>
                  <Play className="mr-2 h-4 w-4" /> Try it now
                </Link>
              </Button>
            ) : null}
          </div>

          {answer ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="whitespace-pre-wrap text-sm text-slate-800">{answer.answer}</div>
              {answer.relatedMoments?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {answer.relatedMoments.map((moment) => (
                    <button
                      key={`${moment.timestamp}-${moment.label}`}
                      type="button"
                      onClick={() => setCurrentTime(moment.timestamp)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      {formatTimestamp(moment.timestamp)} • {moment.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">Chapters</div>
            {indexQuery.isLoading ? <div className="text-xs text-slate-500">Indexing…</div> : null}
          </div>

          <ScrollArea className="h-[320px] rounded-xl border border-slate-100 bg-white">
            <div className="p-2 space-y-2">
              {indexQuery.isError ? (
                <div className="text-sm text-amber-700">Unable to load video index.</div>
              ) : (indexQuery.data?.chapters?.length ?? 0) === 0 ? (
                <div className="text-sm text-slate-500">No chapters generated yet.</div>
              ) : (
                indexQuery.data?.chapters.map((chapter) => (
                  <button
                    key={`${chapter.title}-${chapter.startSeconds}`}
                    type="button"
                    onClick={() => setCurrentTime(chapter.startSeconds)}
                    className="w-full rounded-xl border border-slate-100 bg-slate-50 p-2 text-left hover:bg-slate-100"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-900">{chapter.title}</div>
                      <div className="text-[11px] text-slate-500">{formatTimestamp(chapter.startSeconds)}</div>
                    </div>
                    {chapter.summary ? <div className="mt-1 text-xs text-slate-600 line-clamp-2">{chapter.summary}</div> : null}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </Card>
  );
}

