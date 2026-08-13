/**
 * THE reveal text. This is the only file permitted to change after the Friday
 * freeze (PLAN.md) — a config edit that touches no game logic and no test
 * expectation.
 *
 * Strings are base64-encoded and decoded at render time. That is not security
 * and does not pretend to be: it defeats a curious "view source" on a phone,
 * which is the only realistic threat (DEPLOY.md §7).
 *
 * To change a value, run:
 *   node -e 'console.log(Buffer.from("Dein Text","utf8").toString("base64"))'
 *
 * CHECK ON SATURDAY MORNING: date, time, meeting point, and who is coming.
 */

/** UTF-8-safe base64 decode. Works in the browser and in Node. */
export function dec(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const RAW = {
  buildLine1: 'VklFUiBMRVZFTCBHRVNDSEFGRlQu',
  buildLine2: 'RUlOIEVOREdFR05FUiBGRUhMVC4=',
  buildLine3: 'RVIgU1RFSFQgTklDSFQgQVVGIERFUiBTVFJBU1NFLg==',
  cardTitle: 'U0FOREJPWCBWUg==',
  cardCity: 'QkVSTElO',
  cardTagline: 'RHUuIFdpci4gSGVhZHNldHMuIEJhbGQu',
  cardLinkLabel: 'U0FOREJPWCBWUiBCRVJMSU4gQU5TRUhFTg==',
  cardLinkHref: 'aHR0cHM6Ly9zYW5kYm94dnIuY29tL2RlL2Jlcmxpbg==',
  labelWhen: 'V0FOTg==',
  labelWhere: 'V08=',
  labelWho: 'V0VS',
  labelBring: 'TUlUQlJJTkdFTg==',
  valueWhen: 'SXJnZW5kZWluIERpZW5zdGFnLiBGcmFnIG5pY2h0IG5hY2ggZGVtIERhdHVtLg==',
  valueWhere: 'U2FuZGJveCBWUiBCZXJsaW4KVHJlZmZwdW5rdCAxOToxNSB2b3IgZGVtIEVpbmdhbmc=',
  valueWho: 'RnVudGlzY2ggQ3Jldw==',
  valueBring: 'TmljaHRzLiBOdXIgZGljaC4gVW5kIFNvY2tlbi4=',
  outro: 'TGV2ZWwgNTogRnJlZWZhbGwuIFNhbWUgQ3JldywgYW5kZXJlIFJlYWxpdMOkdC4=',
  playAgain: 'Tk9DSE1BTCBTUElFTEVO',
  levelSelect: 'TEVWRUwgV8OESExFTg==',
  giftButton: '4oaSIFpVTSBHRVNDSEVOSw==',
} as const;

export type GiftKey = keyof typeof RAW;

/** Decoded lazily and memoised, so the plaintext never sits in the bundle. */
const cache = new Map<GiftKey, string>();

export function gift(key: GiftKey): string {
  let v = cache.get(key);
  if (v === undefined) {
    v = dec(RAW[key]);
    cache.set(key, v);
  }
  return v;
}

/** The three type-on lines of the build, in order (DESIGN.md §5.2). */
export const BUILD_LINES: GiftKey[] = ['buildLine1', 'buildLine2', 'buildLine3'];

/** The practical-details card (DESIGN.md §5.4), label/value pairs. */
export const DETAIL_ROWS: Array<{ label: GiftKey; value: GiftKey }> = [
  { label: 'labelWhen', value: 'valueWhen' },
  { label: 'labelWhere', value: 'valueWhere' },
  { label: 'labelWho', value: 'valueWho' },
  { label: 'labelBring', value: 'valueBring' },
];
