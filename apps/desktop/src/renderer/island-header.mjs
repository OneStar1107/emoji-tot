/*
 * The header's one line is what is playing.
 *
 * The page name already sits under the ball; repeating it here, 30px from the
 * media title, made the same sentence appear twice and left the title squeezed
 * into a 96px slot on the right. Now the playing title owns the line and the
 * page name stays where it belongs — under the avatar.
 */
import { nowPlayingText } from './island-pill.mjs';

export function islandHeaderState(media) {
  return { title: media?.active ? nowPlayingText(media) : '' };
}

export function pagingVisibility(pageCount) {
  const visible = Number(pageCount) > 1;
  return { arrows: visible, dots: visible };
}
