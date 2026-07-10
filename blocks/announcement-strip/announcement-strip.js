export default function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;
  row.className = 'announcement-strip-content';
  [...row.children].forEach((div) => {
    if (div.querySelector('picture, svg, img')) {
      div.className = 'announcement-strip-icon';
    } else {
      div.className = 'announcement-strip-text';
    }
  });
}
