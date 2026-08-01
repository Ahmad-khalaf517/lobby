/**
 * Shared geometry for the Lobby mark.
 *
 * Extracted once from the source PNG and reused by both
 * `LobbyLogoComponent` (static) and `LobbyLoaderComponent` (animated)
 * so the two can never drift apart into two different-looking logos.
 *
 * Coordinate system: a 320 x 330 viewBox. All paths below live in that
 * same space, so they can be layered directly on top of one another.
 */

/** ViewBox shared by every component that renders the Lobby mark. */
export const LOBBY_LOGO_VIEWBOX = '0 0 320 330';

/**
 * Outer silhouette: the rounded arch, the full-height left leg, the
 * shorter right leg (sliced off at an angle), and the asymmetrical
 * doorway notch cut into the middle. This is one continuous, simple
 * outline — the doorway is open at the bottom, so no second "hole"
 * path or evenodd fill rule is needed here.
 */
export const LOBBY_SILHOUETTE_PATH =
  'M14,329 L97,329 L97,146 L220,96 L236,122 L236,286 L315,301 L315,135 ' +
  'C315,61.8 246.3,5 161,5 C75.7,5 6,61.8 6,140 L6,321 Q6,329 14,329 Z';

/**
 * The detached, slanted base piece that sits below and to the right of
 * the main body, separated from it by genuine transparent negative
 * space. Always rendered as its own path — never merged with the
 * silhouette above.
 */
export const LOBBY_BASE_PATH = 'M162,286 L159,329 L315,329 L315,323 Z';

/**
 * Bounds of the doorway opening itself (the notch carved into the
 * silhouette above). Not used by the static logo — the doorway is
 * simply transparent there. The loader uses this as a clip path so its
 * animated light/door layers never spill outside the opening.
 */
export const LOBBY_DOORWAY_CLIP_PATH = 'M97,146 L220,96 L236,122 L236,286 L97,286 Z';

/** Violet gradient sampled from the source mark: dark at bottom-left, light at top-right. */
export const LOBBY_GRADIENT_STOPS = {
  start: '#5748B5',
  end: '#A590E5',
} as const;
