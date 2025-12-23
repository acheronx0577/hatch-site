import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  fetchNotifications,
  fetchNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
  type NotificationItem,
  type NotificationPreference
} from '@/lib/api/notifications';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

export default function BrokerNotificationsPage() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  const [cursor, setCursor] = useState<string | undefined>();
  const qc = useQueryClient();

  const { data = [], isLoading, error } = useQuery<NotificationItem[]>({
    queryKey: ['notifications', orgId, cursor],
    queryFn: () => fetchNotifications(orgId, 25, cursor)
  });

  const preferencesQuery = useQuery<NotificationPreference>({
    queryKey: ['notification-preferences', orgId],
    queryFn: () => fetchNotificationPreferences(orgId)
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(orgId, id),
    onSuccess: (_, id) => {
      qc.setQueryData<NotificationItem[]>(['notifications', orgId, cursor], (previous) =>
        previous?.map((notification) =>
          notification.id === id ? { ...notification, isRead: true } : notification
        ) ?? previous
      );
    }
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', orgId] });
    }
  });

  const updatePrefsMutation = useMutation({
    mutationFn: (payload: Partial<NotificationPreference>) => updateNotificationPreferences(orgId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-preferences', orgId] })
  });

  const notifications = data;
  const unreadCount = useMemo(() => notifications.filter((item) => !item.isRead).length, [notifications]);

  if (!orgId) {
    return <ErrorState message="Select an organization to view notifications." />;
  }

  if (isLoading) {
    return <LoadingState message="Loading notifications..." />;
  }

  if (error) {
    return <ErrorState message="Unable to load notifications." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Mission Control</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-600">Stay up to date on leads, offers, rentals, AI actions, and accounting.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>
          {markAllMutation.isPending ? 'Marking…' : `Mark all (${unreadCount}) as read`}
        </Button>
      </div>

      <Card className="overflow-hidden hover:translate-y-0 hover:shadow-brand">
        <div className="divide-y border-t border-[color:var(--hatch-card-border)] text-sm">
          {notifications.length === 0 ? (
            <div className="p-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue-600/10">
                <Bell className="h-6 w-6 text-brand-blue-600" />
              </div>
              <p className="text-sm font-medium text-slate-900">No notifications yet</p>
              <p className="mt-1 text-sm text-slate-600">Updates from Hatch will appear here in real-time.</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  'flex items-start justify-between gap-4 px-6 py-4',
                  !notification.isRead && 'bg-white/25'
                )}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{notification.title}</p>
                  {notification.message ? (
                    <p className="mt-1 text-slate-600">{notification.message}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-400">{new Date(notification.createdAt).toLocaleString()}</p>
                </div>
                {!notification.isRead ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markOneMutation.mutate(notification.id)}
                    disabled={markOneMutation.isPending}
                  >
                    Mark read
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="p-6 space-y-5 hover:translate-y-0 hover:shadow-brand">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Delivery preferences</h2>
          <p className="text-sm text-slate-500">Control which channels Hatch uses to reach you.</p>
        </div>
        {preferencesQuery.isLoading ? (
          <LoadingState message="Loading preferences..." />
        ) : preferencesQuery.error ? (
          <ErrorState message="Unable to load preferences." />
        ) : preferencesQuery.data ? (
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Channels</p>
              <div className="space-y-2">
                {(
                  [
                    ['Enable in-app notifications', 'inAppEnabled'],
                    ['Enable email notifications', 'emailEnabled']
                  ] as const
                ).map(([label, key]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-xl border border-[var(--glass-border)] bg-white/20 px-4 py-3 backdrop-blur"
                  >
                    <span className="text-sm text-slate-700">{label}</span>
                    <Checkbox
                      className="rounded-md border-[var(--glass-border)] bg-white/20 data-[state=checked]:bg-brand-blue-600 data-[state=checked]:border-brand-blue-600"
                      checked={Boolean(preferencesQuery.data[key as keyof NotificationPreference])}
                      disabled={updatePrefsMutation.isPending}
                      onCheckedChange={(checked) =>
                        updatePrefsMutation.mutate({ [key]: Boolean(checked) } as Partial<NotificationPreference>)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Topics</p>
              <p className="mb-3 text-xs text-slate-500">Applies to both channels.</p>
              <div className="space-y-2">
                {(
                  [
                    ['Leads & saved searches', 'leadNotificationsEnabled'],
                    ['Offer intents', 'offerIntentNotificationsEnabled'],
                    ['Rentals & tax schedules', 'rentalNotificationsEnabled'],
                    ['Accounting & financial sync', 'accountingNotificationsEnabled'],
                    ['AI / Compliance alerts', 'aiNotificationsEnabled']
                  ] as const
                ).map(([label, key]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-xl border border-[var(--glass-border)] bg-white/20 px-4 py-3 backdrop-blur"
                  >
                    <span className="text-sm text-slate-700">{label}</span>
                    <Checkbox
                      className="rounded-md border-[var(--glass-border)] bg-white/20 data-[state=checked]:bg-brand-blue-600 data-[state=checked]:border-brand-blue-600"
                      checked={Boolean(preferencesQuery.data[key as keyof NotificationPreference])}
                      disabled={updatePrefsMutation.isPending}
                      onCheckedChange={(checked) =>
                        updatePrefsMutation.mutate({ [key]: Boolean(checked) } as Partial<NotificationPreference>)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
