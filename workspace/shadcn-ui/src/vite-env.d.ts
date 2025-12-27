/// <reference types="vite/client" />

declare module '*.worker.min.mjs?url' {
  const url: string;
  export default url;
}
