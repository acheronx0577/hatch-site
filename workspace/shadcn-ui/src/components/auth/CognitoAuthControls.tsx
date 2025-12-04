import { useMemo } from 'react';
import { useAuth } from 'react-oidc-context';
import { Button } from '@/components/ui/button';

type Props = {
  className?: string;
};

export function CognitoAuthControls({ className }: Props) {
  const auth = useAuth();
  const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI ?? window.location.origin;

  const userLabel = useMemo(() => {
    if (!auth?.user?.profile) return '';
    const profile = auth.user.profile;
    return profile.email ?? profile.phone_number ?? profile.sub ?? '';
  }, [auth?.user?.profile]);

  const handleSignIn = () => {
    auth?.signinRedirect?.();
  };

  const handleSignOut = () => {
    if (auth?.signoutRedirect) {
      auth.signoutRedirect();
      return;
    }
    if (cognitoDomain && clientId) {
      const url = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
      window.location.href = url;
      return;
    }
    auth?.removeUser?.();
  };

  if (auth?.isLoading) return null;

  return (
    <div className={className}>
      {auth?.isAuthenticated ? (
        <div className="flex items-center gap-2">
          {userLabel ? <span className="text-sm text-gray-600 truncate max-w-[12rem]">{userLabel}</span> : null}
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={handleSignIn}>
          Sign in
        </Button>
      )}
    </div>
  );
}

export default CognitoAuthControls;
