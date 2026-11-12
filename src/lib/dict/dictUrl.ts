/**
 * URL the dictionary worker should fetch.
 *
 * A relative URL is resolved against the worker script
 * (`/assets/ecdict.worker-….js`), which turned `./dict/…` into
 * `/assets/dict/…` and 404ed. Resolve against the page URL instead.
 * `data:` and `blob:` URLs (single-file build) are left unchanged.
 */
export function resolveDictFetchUrl(dictUrl: string, pageHref: string): string {
  if (/^(?:data:|blob:|https?:)/i.test(dictUrl)) return dictUrl;
  return new URL(dictUrl, pageHref).href;
}

export const DICT_PUBLIC_PATH = "dict/ecdict-core.json.gz";
