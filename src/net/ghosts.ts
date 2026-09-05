import { deserializeGhost } from '../game/Ghost';

/**
 * Shared ghosts for the daily board ("group ride"). Ghost samples are uploaded to a public
 * Supabase Storage bucket and indexed in the `ghosts` table so the top few can be fetched by
 * board key. Everything no-ops when no backend is configured.
 */
const URL_BASE: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const ANON: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = 'ghosts';

export const ghostsConfigured = !!(URL_BASE && ANON);

const headers = () => ({ apikey: ANON!, Authorization: `Bearer ${ANON!}` });

export interface RemoteGhost {
  handle: string;
  score: number;
  data: Float32Array;
}

function safe(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16) || 'rider';
}

/** Uploads a serialized ghost (base64) for a board. Fire and forget. */
export async function uploadGhost(
  board: string,
  handle: string,
  score: number,
  b64: string,
): Promise<void> {
  if (!ghostsConfigured) return;
  const path = `${safe(board.replace(':', '-'))}/${safe(handle)}-${Math.round(score)}-${Date.now().toString(36)}.b64`;
  try {
    const up = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'text/plain', 'x-upsert': 'true' },
      body: b64,
    });
    if (!up.ok) throw new Error(`upload ${up.status}`);
    const row = await fetch(`${URL_BASE}/rest/v1/ghosts`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ board, handle: handle || 'Rider', score: Math.round(score), path }),
    });
    if (!row.ok) throw new Error(`index ${row.status}`);
  } catch (e) {
    console.info('[ghosts] upload skipped', e);
  }
}

/** Top ghosts for a board, excluding the local handle. */
export async function fetchGhosts(
  board: string,
  exclude: string,
  limit = 3,
): Promise<RemoteGhost[]> {
  if (!ghostsConfigured) return [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      `${URL_BASE}/rest/v1/ghosts?select=handle,score,path&board=eq.${encodeURIComponent(board)}&order=score.desc&limit=${limit + 2}`,
      { headers: headers(), signal: ctrl.signal },
    );
    clearTimeout(t);
    if (!res.ok) return [];
    const rows = (await res.json()) as { handle: string; score: number; path: string }[];
    const out: RemoteGhost[] = [];
    for (const r of rows) {
      if (out.length >= limit) break;
      if (exclude && r.handle === exclude) continue;
      const g = await fetch(`${URL_BASE}/storage/v1/object/public/${BUCKET}/${r.path}`);
      if (!g.ok) continue;
      const data = deserializeGhost(await g.text());
      if (data) out.push({ handle: r.handle, score: r.score, data });
    }
    return out;
  } catch {
    return [];
  }
}
