export function islandHeaderState(pageTitle, media) {
  return {
    title: String(pageTitle ?? ''),
    media: media?.active ? String(media.title ?? '') : '',
  };
}

export function pagingVisibility(pageCount) {
  const visible = Number(pageCount) > 1;
  return { arrows: visible, dots: visible };
}
