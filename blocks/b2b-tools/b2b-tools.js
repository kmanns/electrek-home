/*
 * B2B Tools band — Electrek Home
 * Renders a hairline-divided directory row of B2B capabilities.
 * Authoring: one block row per tool, three cells:
 *   | <icon-key> | <Title (link)> | <Description> |
 * icon-key ∈ quick-order | quote | list | company (falls back to a generic mark).
 * Best placed inside a Section with Style = Navy.
 */

// Trusted, static inline-SVG path data (not author content) keyed by icon name.
const ICON_PATHS = {
  'quick-order': ['M13 3 4 14h6l-1 7 9-11h-6z'],
  quote: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 13h7', 'M9 16h7'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  company: ['M4 20V8l6-4 6 4v12', 'M4 20h16', 'M9 20v-4h2v4', 'M14 11h2', 'M14 14h2'],
  default: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 8v4l3 2'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildIcon(key) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('b2b-tool-icon');
  (ICON_PATHS[key] || ICON_PATHS.default).forEach((d) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  });
  return svg;
}

export default function decorate(block) {
  const rows = [...block.children];
  const grid = document.createElement('div');
  grid.className = 'b2b-tools-grid';

  rows.forEach((row) => {
    const cells = [...row.children];
    const iconKey = (cells[0]?.textContent || '').trim().toLowerCase();
    const titleCell = cells[1];
    const descCell = cells[2];

    const tool = document.createElement('div');
    tool.className = 'b2b-tool';
    tool.append(buildIcon(iconKey));

    const h3 = document.createElement('h3');
    const authoredLink = titleCell?.querySelector('a');
    if (authoredLink) {
      h3.append(authoredLink); // preserve the author's link + href
    } else if (titleCell) {
      h3.textContent = titleCell.textContent.trim();
    }
    tool.append(h3);

    if (descCell && descCell.textContent.trim()) {
      const p = document.createElement('p');
      p.textContent = descCell.textContent.trim();
      tool.append(p);
    }

    grid.append(tool);
  });

  block.textContent = '';
  block.append(grid);

  // The B2B tools band is always a full-bleed navy structural band.
  // Apply the section style directly so authors don't have to set it.
  block.closest('.section')?.classList.add('navy');
}
