/*
 * Category grid — Electrek Home
 * Aisle-directory grid of department tiles. Author-picked (static) tiles now;
 * a live Catalog Service fetch can replace `buildTiles` later.
 *
 * Authoring: one block row per department, two cells:
 *   | <image> | <Label (link to the category/PLP)> |
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildArrow() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  ['M5 12h14', 'M13 6l6 6-6 6'].forEach((d) => {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  });
  return svg;
}

function buildTile({ href, name, picture }) {
  const tile = document.createElement('a');
  tile.className = 'category-tile';
  tile.href = href || '#';

  const media = document.createElement('div');
  media.className = 'category-tile-media';
  if (picture) media.append(picture);
  tile.append(media);

  const label = document.createElement('div');
  label.className = 'category-tile-label';
  const h3 = document.createElement('h3');
  h3.textContent = name;
  label.append(h3);
  const arrow = document.createElement('span');
  arrow.className = 'category-tile-arrow';
  arrow.append(buildArrow());
  label.append(arrow);
  tile.append(label);

  return tile;
}

export default function decorate(block) {
  const tiles = [...block.children].map((row) => {
    // Robust to both [image, label] and label-only authoring.
    const link = row.querySelector('a');
    const picture = row.querySelector('picture');
    const textFallback = [...row.children]
      .map((c) => c.textContent.trim())
      .filter(Boolean)
      .pop() || '';
    return {
      picture,
      href: link ? link.getAttribute('href') : '#',
      name: (link ? link.textContent : textFallback).trim(),
    };
  }).filter((t) => t.name);

  const grid = document.createElement('div');
  grid.className = 'category-grid-inner';
  tiles.forEach((t) => grid.append(buildTile(t)));

  block.textContent = '';
  block.append(grid);
}
