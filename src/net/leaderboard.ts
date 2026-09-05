import { plausibleScore } from '../game/Scoring';
import type { GameMode } from '../game/Run';
import type { SceneId } from '../world/scenes';

/**
 * Leaderboard client. Talks to Supabase's PostgREST endpoint directly (no SDK, ~0 KB), and
 * falls back to a local board in localStorage when no backend is configured so the UI is the
 * same either way. See supabase/schema.sql for the table and its server-side checks.
 */

export interface RunSubmission {
  mode: GameMode;
  scene: SceneId;
  seed: number;
  /** YYYYMMDD for daily runs. */
  day: number | null;
  score: number;
  distance_m: number;
  duration_s: number;
  top_kmh: number;
  near_misses: number;
  best_combo: number;
  protection: number;
  handle: string;
}

export interface BoardRow {
  handle: string;
  score: number;
  distance_m: number;
  top_kmh: number;
  near_misses: number;
  created_at: string;
  /** True when this row is the run just submitted. */
  mine?: boolean;
}

export interface BoardResult {
  rows: BoardRow[];
  /** 1-based rank of the submitted score, null when unknown. */
  rank: number | null;
  total: number | null;
  source: 'supabase' | 'local';
}

const URL_BASE: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const ANON: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE = 'runs';

export const leaderboardConfigured = !!(URL_BASE && ANON);

const headers = () => ({
  apikey: ANON!,
  Authorization: `Bearer ${ANON!}`,
  'Content-Type': 'application/json',
});

/** Board key: daily boards are per day, ride boards per scene. */
function boardKey(mode: GameMode, scene: SceneId, day: number | null): string {
  return mode === 'daily' ? `daily:${day}` : `ride:${scene}`;
}

// -------------------------------------------------------------------------------- local ---

const LOCAL_KEY = 'bike-rider.board.v1';

function loadLocal(): Record<string, BoardRow[]> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as Record<string, BoardRow[]>;
  } catch {
    return {};
  }
}

function saveLocal(b: Record<string, BoardRow[]>): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

function localSubmit(s: RunSubmission): BoardResult {
  const all = loadLocal();
  const key = boardKey(s.mode, s.scene, s.day);
  const rows = all[key] ?? [];
  const row: BoardRow = {
    handle: s.handle || 'You',
    score: s.score,
    distance_m: s.distance_m,
    top_kmh: s.top_kmh,
    near_misses: s.near_misses,
    created_at: new Date().toISOString(),
  };
  rows.push(row);
  rows.sort((a, b) => b.score - a.score);
  all[key] = rows.slice(0, 50);
  saveLocal(all);
  const rank = rows.indexOf(row) + 1;
  return {
    rows: all[key]!.slice(0, 10).map((r) => ({ ...r, mine: r === row })),
    rank,
    total: rows.length,
    source: 'local',
  };
}

function localTop(mode: GameMode, scene: SceneId, day: number | null): BoardResult {
  const rows = loadLocal()[boardKey(mode, scene, day)] ?? [];
  return { rows: rows.slice(0, 10), rank: null, total: rows.length, source: 'local' };
}

// ----------------------------------------------------------------------------- supabase ---

async function sbFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    return await fetch(`${URL_BASE}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

function boardFilter(mode: GameMode, scene: SceneId, day: number | null): string {
  return mode === 'daily'
    ? `mode=eq.daily&day=eq.${day}`
    : `mode=in.(ride,mission)&scene=eq.${scene}`;
}

async function sbTop(mode: GameMode, scene: SceneId, day: number | null): Promise<BoardRow[]> {
  const res = await sbFetch(
    `${TABLE}?select=handle,score,distance_m,top_kmh,near_misses,created_at&${boardFilter(mode, scene, day)}&order=score.desc&limit=10`,
  );
  if (!res.ok) throw new Error(`board ${res.status}`);
  return (await res.json()) as BoardRow[];
}

async function sbCount(mode: GameMode, scene: SceneId, day: number | null, above?: number) {
  const extra = above !== undefined ? `&score=gt.${Math.round(above)}` : '';
  const res = await sbFetch(`${TABLE}?select=id&${boardFilter(mode, scene, day)}${extra}&limit=1`, {
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  const range = res.headers.get('content-range'); // e.g. "0-0/1234"
  const total = range?.split('/')[1];
  return total && total !== '*' ? Number(total) : null;
}

/** Submits a run and returns the board with the rider's rank. Never throws. */
export async function submitRun(s: RunSubmission): Promise<BoardResult> {
  if (!plausibleScore(s.score, s.distance_m, s.duration_s)) {
    return { rows: [], rank: null, total: null, source: 'local' };
  }
  if (!leaderboardConfigured) return localSubmit(s);
  try {
    const res = await sbFetch(TABLE, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ...s, handle: s.handle || 'Rider' }),
    });
    if (!res.ok) throw new Error(`submit ${res.status}`);
    const [rows, above, total] = await Promise.all([
      sbTop(s.mode, s.scene, s.day),
      sbCount(s.mode, s.scene, s.day, s.score),
      sbCount(s.mode, s.scene, s.day),
    ]);
    let marked = false;
    const out = rows.map((r) => {
      const mine = !marked && r.score === s.score && r.handle === (s.handle || 'Rider');
      if (mine) marked = true;
      return { ...r, mine };
    });
    return { rows: out, rank: above !== null ? above + 1 : null, total, source: 'supabase' };
  } catch (e) {
    console.info('[leaderboard] falling back to local board', e);
    return localSubmit(s);
  }
}

export async function fetchBoard(
  mode: GameMode,
  scene: SceneId,
  day: number | null,
): Promise<BoardResult> {
  if (!leaderboardConfigured) return localTop(mode, scene, day);
  try {
    const [rows, total] = await Promise.all([sbTop(mode, scene, day), sbCount(mode, scene, day)]);
    return { rows, rank: null, total, source: 'supabase' };
  } catch {
    return localTop(mode, scene, day);
  }
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
