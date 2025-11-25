import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem
} from '@/lib/api/notifications';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

export function NotificationBell() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    fetchNotifications(orgId, 20)
      .then((data) => setItems(data))
      .catch(() => undefined);
  }, [orgId]);

  useEffect(() => {
    if (!open || !orgId) return;
    setLoading(true);
    fetchNotifications(orgId, 20)
      .then((data) => {
        setItems(data);
      })
      .finally(() => setLoading(false));
  }, [open, orgId]);

  const unreadCount = items.filter((item) => !item.isRead).length;

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  const handleMarkRead = async (id: string) => {
    if (!orgId) return;
    await markNotificationRead(orgId, id);
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
  };

  const handleMarkAll = async () => {
    if (!orgId) return;
    await markAllNotificationsRead(orgId);
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
  };

  const linkForNotification = (notification: NotificationItem) => {
    if (notification.leadId) return `/broker/leads?focus=${notification.leadId}`;
    if (notification.offerIntentId) return `/broker/lead-routing?focus=${notification.offerIntentId}`;
    if (notification.listingId) return `/broker/properties?focus=${notification.listingId}`;
    if (notification.transactionId) return `/broker/transactions?focus=${notification.transactionId}`;
    if (notification.leaseId) return `/broker/rentals?focus=${notification.leaseId}`;
    return '/broker/mission-control';
  };

  // Close on outside mousedown and Escape key for accessibility + UX
  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const clickedTrigger = !!target.closest('[aria-haspopup="true"]');
      const clickedPopup = !!target.closest('[aria-hidden="false"]');
      if (!clickedTrigger && !clickedPopup) {
        setOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  // accessibility: add aria attributes for trigger and popup

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative rounded-full p-2 text-slate-600 bg-white hover:bg-blue-50 active:bg-blue-100 shadow-none hover:shadow-md active:shadow-lg transition-all duration-200 will-change-transform hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      <div
        aria-hidden={!open}
        className={`absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg transition-all duration-200
          ${open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
        style={{ willChange: 'opacity, transform' }}
      >
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-semibold text-slate-600">
          <span>Notifications</span>
          <button type="button" onClick={handleMarkAll} className="text-blue-600 hover:underline">
            Mark all as read
          </button>
        </div>
        <div className="max-h-80 overflow-auto text-xs">
          {loading && <div className="px-3 py-4 text-slate-500">Loading…</div>}
          {!loading && items.length === 0 && <div className="px-3 py-4 text-slate-500">No notifications yet.</div>}
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start justify-between border-b px-3 py-2 ${item.isRead ? 'bg-white' : 'bg-slate-50'}`}
            >
              <div className="flex-1">
                <Link to={linkForNotification(item)} className="font-semibold text-slate-900 hover:underline">
                  {item.title}
                </Link>
                {item.message ? (
                  <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">{item.message}</p>
                ) : null}
                <p className="mt-0.5 text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
              </div>
              {!item.isRead && (
                <button type="button" onClick={() => handleMarkRead(item.id)} className="ml-2 text-[10px] text-blue-600 hover:underline">
                  Mark
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="px-3 py-2 text-center text-[11px]">
          <Link to="/broker/notifications" className="text-blue-600 hover:underline">
            View all notifications
          </Link>
        </div>
      </div>
    </div>
  );
}

// Close on outside click / Escape for accessibility + UX
// This effect depends only on `open` and will attach listeners when open.
export default undefined;
