import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';

export type UserRole = 'BROKER' | 'AGENT' | 'CONSUMER' | 'ADMIN';

const FALLBACK_ROLE: UserRole = (import.meta.env.VITE_USER_ROLE as UserRole | undefined) ?? 'BROKER';
const ROLE_STORAGE_KEY = 'hatch:user-role';

const isUserRole = (role: string | null | undefined): role is UserRole => {
  return role === 'BROKER' || role === 'AGENT' || role === 'CONSUMER' || role === 'ADMIN';
};

const mapMembershipRole = (role?: string | null): UserRole | null => {
  if (!role) return null;
  if (role === 'AGENT') return 'AGENT';
  if (role === 'BROKER_OWNER' || role === 'BROKER_MANAGER') return 'BROKER';
  return null;
};

export function userHasRole(role: UserRole | null | undefined, allowed: UserRole[]): boolean {
  const effectiveRole: UserRole = role ?? FALLBACK_ROLE;
  return allowed.includes(effectiveRole);
}

export function useUserRole(): UserRole {
  const { activeMembership, session } = useAuth();
  const [storedRole, setStoredRole] = useState<UserRole>(() => {
    if (typeof window === 'undefined') return FALLBACK_ROLE;
    const saved = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (isUserRole(saved)) {
      return saved;
    }
    return FALLBACK_ROLE;
  });

  const derivedRole = useMemo<UserRole | null>(() => {
    if (session?.user?.globalRole === 'SUPER_ADMIN') {
      return 'ADMIN';
    }
    const membershipRole = mapMembershipRole(activeMembership?.role);
    return membershipRole;
  }, [activeMembership?.role, session?.user?.globalRole]);

  useEffect(() => {
    if (!derivedRole) return;
    setStoredRole(derivedRole);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_STORAGE_KEY, derivedRole);
    }
  }, [derivedRole]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ROLE_STORAGE_KEY) return;
      if (isUserRole(event.newValue)) {
        setStoredRole(event.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return derivedRole ?? storedRole;
}

export function setUserRole(role: UserRole) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ROLE_STORAGE_KEY, role);
  window.dispatchEvent(new StorageEvent('storage', { key: ROLE_STORAGE_KEY, newValue: role }));
}
