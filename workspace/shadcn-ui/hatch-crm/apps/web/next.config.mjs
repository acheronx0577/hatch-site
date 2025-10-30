const stripTrailingSlash = (value) => value.replace(/\/+$/, '');
const ensureProtocol = (value) => (value.startsWith('http') ? value : `https://${value}`);

const normaliseBase = (value) => {
  if (!value) return null;
  try {
    return new URL(stripTrailingSlash(ensureProtocol(value)));
  } catch {
    return null;
  }
};

const inferSiblingApiHost = (url) => {
  if (url.hostname.includes('-api.')) {
    return url.hostname;
  }
  if (url.hostname.endsWith('.vercel.app')) {
    return url.hostname.replace('.vercel.app', '-api.vercel.app');
  }
  return null;
};

const resolveApiBase = () => {
  const candidates = [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.VITE_API_BASE_URL,
    process.env.API_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
    process.env.VERCEL_URL
  ];

  for (const candidate of candidates) {
    const baseUrl = normaliseBase(candidate);
    if (!baseUrl) {
      continue;
    }

    if (baseUrl.hostname.includes('-api.') || baseUrl.pathname.includes('/api')) {
      return baseUrl;
    }

    const sibling = inferSiblingApiHost(baseUrl);
    if (sibling) {
      baseUrl.hostname = sibling;
      baseUrl.pathname = '/api';
      return baseUrl;
    }

    baseUrl.pathname = '/api';
    return baseUrl;
  }

  return null;
};

const apiBase = resolveApiBase();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/modifiers', '@dnd-kit/utilities'],
  async rewrites() {
    if (!apiBase) {
      return [];
    }

    const destination = new URL(apiBase.toString());
    // Normalise the pathname so `/api` and `/api/` are both handled.
    const basePath = destination.pathname === '/' ? '' : stripTrailingSlash(destination.pathname);

    const destinationUrl = `${destination.origin}${basePath || '/api'}`;

    if (destinationUrl.startsWith('http://localhost') || destinationUrl.startsWith('https://localhost')) {
      // Avoid proxying in local development where the Nest API runs without the /api prefix.
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${destinationUrl}/:path*`
      }
    ];
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // Align server chunk filenames with the webpack runtime loader.
      config.output = config.output ?? {};
      config.output.chunkFilename = '[id].js';
    }
    return config;
  }
};

export default nextConfig;
