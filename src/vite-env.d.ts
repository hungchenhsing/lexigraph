/// <reference types="vite/client" />

// PDF.js ships its worker as a .mjs file; Vite's `?url` suffix is handled by
// the default `vite/client` types, but we re-declare here in case tooling
// complains about the exact shape.
declare module "*?url" {
  const src: string;
  export default src;
}
