/**
 * Serialises a Creative Product Spotlight into the block table the
 * Workspace editor understands (first row = block name, then key/value rows).
 * All values are set via textContent / href, so authored text cannot inject markup.
 */

export const BLOCK_NAME = 'creative-product-spotlight';

const ROWS = [
  ['SKU', 'sku'],
  ['Headline', 'headline'],
  ['Description', 'description'],
  ['Desktop image', 'desktopImage', 'url'],
  ['Mobile image', 'mobileImage', 'url'],
  ['Image alt', 'imageAlt'],
  ['CTA label', 'ctaLabel'],
  ['Presentation', 'presentation'],
];

export function isSafeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch (e) {
    return false;
  }
}

/** Throws with a readable message if the spotlight is not insertable. */
export function validateSpotlight(data) {
  const errors = [];
  if (!/^[\w.-]{1,64}$/.test(data.sku || '')) errors.push('A valid SKU is required.');
  if (!data.headline?.trim()) errors.push('Headline is required.');
  ['desktopImage', 'mobileImage'].forEach((key) => {
    if (!isSafeHttpsUrl(data[key])) errors.push(`${key === 'desktopImage' ? 'Desktop' : 'Mobile'} image must be a durable https URL.`);
  });
  if (!['static', 'animated'].includes(data.presentation)) errors.push('Presentation must be static or animated.');
  if (errors.length) throw new Error(errors.join(' '));
}

/** Returns a detached <table> element for the spotlight. */
export function buildSpotlightTable(data) {
  validateSpotlight(data);
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  table.append(tbody);

  const head = document.createElement('tr');
  const name = document.createElement('td');
  name.colSpan = 2;
  name.textContent = BLOCK_NAME;
  head.append(name);
  tbody.append(head);

  ROWS.forEach(([label, key, type]) => {
    const tr = document.createElement('tr');
    const k = document.createElement('td');
    k.textContent = label;
    const v = document.createElement('td');
    const value = (data[key] ?? '').toString().trim();
    if (type === 'url') {
      const a = document.createElement('a');
      a.href = value;
      a.textContent = value;
      v.append(a);
    } else if (key === 'description') {
      value.split(/\n{2,}/).filter(Boolean).forEach((para) => {
        const p = document.createElement('p');
        p.textContent = para.replace(/\n/g, ' ');
        v.append(p);
      });
    } else {
      v.textContent = value;
    }
    tr.append(k, v);
    tbody.append(tr);
  });
  return table;
}

export function buildSpotlightHTML(data) {
  return buildSpotlightTable(data).outerHTML;
}
