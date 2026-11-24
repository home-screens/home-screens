/**
 * Sent by the wall's own page code when it asks to be let in
 * (`WallGate`). In a file of its own so the page can import the name
 * without pulling in the server-side checks in `wall-request.ts`.
 */
export const WALL_PAGE_HEADER = 'x-hs-wall';
