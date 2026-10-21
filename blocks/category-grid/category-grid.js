/*
 * Category grid — Electrek Home
 * Renders an aisle-directory grid of top-level departments.
 * Primary: live categories from Catalog Service (Adobe Commerce Optimizer).
 * Fallback: author-picked tiles (image + label link) if the fetch is empty.
 * Images: an authored image (e.g. from AEM Assets) on a row whose label or
 * link matches a category wins over the catalog image. Authored rows that
 * match no category are ignored while the catalog is reachable.
 *
 * Optional block config:
 *   root  — a category slug; show its children instead of the top level.
 *   limit — max number of tiles.
 */

import { CS_FETCH_GRAPHQL } from '../../scripts/commerce.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CATEGORY_QUERY = `query CategoryGrid {
  categoryTree {
    name
    slug
    level
    parentSlug
    images { url roles }
  }
}`;

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

function pickImage(images) {
  if (!images || !images.length) return null;
  const base = images.find((i) => (i.roles || []).includes('BASE')) || images[0];
  return base?.url || null;
}

function buildTile({
  href, name, picture, imageUrl,
}) {
  const tile = document.createElement('a');
  tile.className = 'category-tile';
  tile.href = href || '#';

  const media = document.createElement('div');
  media.className = 'category-tile-media';
  if (picture) {
    const img = picture.querySelector('img');
    if (img) {
      if (!img.alt) img.alt = name;
      img.loading = 'lazy';
    }
    media.append(picture);
  } else if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = name;
    img.loading = 'lazy';
    media.append(img);
  } else {
    media.classList.add('category-tile-media--empty');
  }
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

/** Parse author-picked tiles as a fallback (image + label link). */
function readAuthoredTiles(block) {
  return [...block.children].map((row) => {
    const link = row.querySelector('a');
    const img = row.querySelector('img');
    const textFallback = [...row.children].map((c) => c.textContent.trim()).filter(Boolean).pop() || '';
    return {
      href: link ? link.getAttribute('href') : '#',
      name: (link ? link.textContent : textFallback).trim(),
      picture: img ? (img.closest('picture') || img) : null,
    };
  }).filter((t) => t.name);
}

const normalize = (s) => (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

function slugFromHref(href) {
  if (!href) return '';
  try {
    const { pathname } = new URL(href, window.location.href);
    return pathname.replace(/\.html$/, '').split('/').filter(Boolean).pop() || '';
  } catch (e) {
    return '';
  }
}

/** Apply authored images to catalog categories, matched by label, then link. */
function applyAuthoredImages(categories, authored) {
  const byName = new Map();
  const bySlug = new Map();
  authored.filter((t) => t.picture).forEach((t) => {
    const name = normalize(t.name);
    const slug = slugFromHref(t.href);
    if (name && !byName.has(name)) byName.set(name, t);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, t);
  });

  const used = new Set();
  return categories.map((c) => {
    const match = [byName.get(normalize(c.name)), bySlug.get(c.slug)]
      .find((t) => t && !used.has(t));
    if (!match) return c;
    used.add(match);
    return { ...c, picture: match.picture };
  });
}

async function fetchCategories(rootSlug) {
  try {
    const res = await CS_FETCH_GRAPHQL.fetchGraphQl(CATEGORY_QUERY);
    const tree = res?.data?.categoryTree || [];
    if (!tree.length) return [];
    const nodes = rootSlug
      ? tree.filter((c) => c.parentSlug === rootSlug)
      : tree.filter((c) => c.level === 1);
    return nodes.map((c) => ({
      slug: c.slug,
      href: `/${c.slug}`,
      name: c.name,
      imageUrl: pickImage(c.images),
    }));
  } catch (e) {
    // Fetch failed (backend/config); fall back to authored tiles.
    return [];
  }
}

export default async function decorate(block) {
  const config = { ...block.dataset };
  const authored = readAuthoredTiles(block);

  const categories = await fetchCategories(config.root);
  let tiles = categories.length ? applyAuthoredImages(categories, authored) : authored;
  if (config.limit) tiles = tiles.slice(0, Number(config.limit));

  const grid = document.createElement('div');
  grid.className = 'category-grid-inner';
  tiles.forEach((t) => grid.append(buildTile(t)));

  block.textContent = '';
  block.append(grid);
}
