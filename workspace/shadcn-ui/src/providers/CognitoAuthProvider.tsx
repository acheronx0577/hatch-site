import { ReactNode, useMemo } from 'react';
import { AuthProvider } from 'react-oidc-context';

type Props = { children: ReactNode };

export default function CognitoAuthProvider({ children }: Props) {
  const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const region = import.meta.env.VITE_COGNITO_REGION;
  const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI ?? window.location.origin;
  const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI ?? window.location.origin;

  const config = useMemo(() => {
    if (!poolId || !clientId || !region) {
      return null;
    }
    const authority = `https://cognito-idp.${region}.amazonaws.com/${poolId}`;
    return {
      authority,
      client_id: clientId,
      redirect_uri: redirectUri,
      post_logout_redirect_uri: logoutUri,
      response_type: 'code',
      scope: 'phone openid email'
    };
  }, [clientId, logoutUri, poolId, redirectUri, region]);

  if (!config) {
    return <>{children}</>;
  }

  return <AuthProvider {...config}>{children}</AuthProvider>;
}
