import type { TrainingVideoSummary } from '../training-assistant.types';

type TranscriptCue = { startSeconds: number; text: string };

export type TrainingVideo = TrainingVideoSummary & {
  transcript: TranscriptCue[];
  chapters?: Array<{ title: string; startSeconds: number; endSeconds?: number }>;
};

const VIDEOS: TrainingVideo[] = [
  {
    id: 'create-listing-overview',
    title: 'Create a Listing (Overview)',
    description: 'A quick walkthrough of creating and saving a listing draft.',
    feature: 'create-listing',
    durationSeconds: 240,
    chapters: [
      { title: 'Navigate to Properties', startSeconds: 0, endSeconds: 45 },
      { title: 'Start a Draft', startSeconds: 45, endSeconds: 90 },
      { title: 'Enter Address and Details', startSeconds: 90, endSeconds: 180 },
      { title: 'Save Draft', startSeconds: 180, endSeconds: 240 }
    ],
    transcript: [
      { startSeconds: 5, text: 'In this video, we will create a new listing draft in Hatch.' },
      { startSeconds: 20, text: 'First, open the Properties section from the left navigation.' },
      { startSeconds: 60, text: 'Click New Draft to start a listing.' },
      { startSeconds: 110, text: 'Enter the property address and confirm the suggested match if available.' },
      { startSeconds: 150, text: 'Fill in bedrooms, bathrooms, square footage, and price.' },
      { startSeconds: 205, text: 'Review your entries and click Save Draft.' }
    ]
  }
];

export class TrainingVideosRepository {
  list(): TrainingVideoSummary[] {
    return VIDEOS.map(({ transcript, chapters, ...rest }) => rest);
  }

  get(videoId: string): TrainingVideo | null {
    const key = (videoId ?? '').trim().toLowerCase();
    if (!key) return null;
    return VIDEOS.find((video) => video.id.toLowerCase() === key) ?? null;
  }
}

