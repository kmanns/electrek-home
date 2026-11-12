/*
 * Creative Product Spotlight — Creative Commerce Studio
 *
 * Key/value block: SKU, Headline, Description, Desktop image, Mobile image,
 * Image alt, CTA label, Presentation (static | animated).
 *
 * Images are approved FFCPE renditions delivered from Product Visuals (AEM Assets).
 * The SKU is a live product reference: the CTA destination is resolved at runtime
 * from the storefront catalog, never baked into the content.
 */
import { CS_FETCH_GRAPHQL, getProductLink } from '../../scripts/commerce.js';

const DESKTOP_MQ = '(min-width: 900px)';
// Default rendition geometry of the Creative Commerce Studio workflow. Used only to
// reserve space before load (width/height per <source>); the real image ratio wins.
const DESKTOP_SIZE = [1200, 896];
const MOBILE_SIZE = [896, 1200];

const PRODUCT_QUERY = `query CCS_SPOTLIGHT_PRODUCT($skus: [String]) {
  products(skus: $skus) { sku name urlKey }
}`;

/** Normalised row key: "Desktop image" -> "desktop-image". */
function toKey(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Accepts only absolute https URLs (or same-origin paths). */
function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === 'https:' || url.origin === window.location.origin) return url;
  } catch (e) { /* not a URL */ }
  return null;
}

/** Reads rows into { key: cell } and a few convenient text/URL values. */
function readRows(block) {
  const cells = {};
  [...block.children].forEach((row) => {
    const [label, value] = row.children;
    if (label && value) cells[toKey(label.textContent)] = value;
  });
  const text = (key) => cells[key]?.textContent.trim() || '';
  const imageUrl = (key) => {
    const cell = cells[key];
    if (!cell) return null;
    const src = cell.querySelector('img')?.getAttribute('src')
      || cell.querySelector('a')?.getAttribute('href')
      || cell.textContent.trim();
    return safeUrl(src);
  };
  return { cells, text, imageUrl };
}

function isAemDelivery(url) {
  return url.hostname.endsWith('.adobeaemcloud.com') && url.pathname.startsWith('/adobe/assets/');
}

function isEdsMedia(url) {
  return url.origin === window.location.origin && url.pathname.includes('/media_');
}

/** True when the URL's host can resize/re-encode on request. */
function isTransformable(url) {
  return isAemDelivery(url) || isEdsMedia(url);
}

/** Width-sized variant of a delivery URL; other URLs are used as authored. */
function sized(url, width, format) {
  if (isAemDelivery(url)) {
    const out = new URL(url);
    if (format) out.pathname = out.pathname.replace(/\.(jpe?g|png|webp|avif)$/i, `.${format}`);
    out.searchParams.set('width', width);
    out.searchParams.set('quality', '80');
    return out.href;
  }
  if (isEdsMedia(url)) {
    const out = new URL(url);
    out.searchParams.set('width', width);
    if (format) out.searchParams.set('format', format);
    out.searchParams.set('optimize', 'medium');
    return out.href;
  }
  return url.href;
}

function source(url, media, width, [w, hgt]) {
  const el = document.createElement('source');
  el.width = w;
  el.height = hgt;
  if (isTransformable(url)) {
    el.srcset = sized(url, width, 'webp');
    el.type = 'image/webp';
  } else {
    el.srcset = url.href;
  }
  if (media) el.media = media;
  return el;
}

function buildPicture(desktop, mobile, alt) {
  const picture = document.createElement('picture');
  const mobileUrl = mobile || desktop;
  const desktopUrl = desktop || mobile;
  const fallbackSize = mobile ? MOBILE_SIZE : DESKTOP_SIZE;
  if (desktop && mobile) picture.append(source(desktopUrl, DESKTOP_MQ, 1600, DESKTOP_SIZE));
  if (isTransformable(mobileUrl)) picture.append(source(mobileUrl, null, 900, fallbackSize));

  const img = document.createElement('img');
  img.src = sized(mobileUrl, 900);
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  [img.width, img.height] = fallbackSize;
  picture.append(img);
  return picture;
}

async function resolveProductHref(sku) {
  const { data, errors } = await CS_FETCH_GRAPHQL.fetchGraphQl(PRODUCT_QUERY, {
    method: 'GET',
    variables: { skus: [sku] },
  });
  if (errors?.length) throw new Error(errors[0].message);
  const product = data?.products?.find((p) => p?.sku === sku);
  if (!product?.urlKey) return null;
  return { href: getProductLink(product.urlKey, product.sku), name: product.name };
}

export default async function decorate(block) {
  const { cells, text, imageUrl } = readRows(block);
  const sku = text('sku');
  const headline = text('headline');
  const altText = text('image-alt');
  const ctaLabel = text('cta-label') || 'Shop now';
  const animated = toKey(text('presentation')) === 'animated';

  const media = document.createElement('div');
  media.className = 'creative-product-spotlight-media';
  const desktop = imageUrl('desktop-image');
  const mobile = imageUrl('mobile-image');
  if (desktop || mobile) {
    media.append(buildPicture(desktop, mobile, altText));
  }

  const content = document.createElement('div');
  content.className = 'creative-product-spotlight-content';

  if (headline) {
    const h2 = document.createElement('h2');
    h2.textContent = headline;
    content.append(h2);
  }

  const descriptionCell = cells.description;
  if (descriptionCell && descriptionCell.textContent.trim()) {
    const description = document.createElement('div');
    description.className = 'creative-product-spotlight-description';
    // Keep authored rich text (paragraphs, emphasis) but drop any authored links/buttons.
    description.append(...descriptionCell.childNodes);
    description.querySelectorAll('a').forEach((a) => a.replaceWith(...a.childNodes));
    if (!description.querySelector('p')) {
      const p = document.createElement('p');
      p.append(...description.childNodes);
      description.append(p);
    }
    content.append(description);
  }

  // CTA stays hidden until the product resolves: never link to an unknown product.
  const ctaWrap = document.createElement('p');
  ctaWrap.className = 'button-wrapper creative-product-spotlight-cta';
  ctaWrap.hidden = true;
  const cta = document.createElement('a');
  cta.className = 'button primary';
  cta.textContent = ctaLabel;
  ctaWrap.append(cta);
  content.append(ctaWrap);

  block.replaceChildren(media, content);
  if (!desktop && !mobile) block.classList.add('no-media');
  if (animated) block.classList.add('animated');

  // Enter-once animation: reveal when the block scrolls into view.
  if (animated && 'IntersectionObserver' in window) {
    block.classList.add('is-pending');
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        block.classList.remove('is-pending');
        block.classList.add('is-visible');
        io.disconnect();
      }
    }, { threshold: 0.2 });
    io.observe(block);
  }

  if (!sku) return;
  block.dataset.sku = sku;
  try {
    const product = await resolveProductHref(sku);
    if (!product) {
      block.dataset.productStatus = 'not-found';
      return;
    }
    cta.href = product.href;
    if (product.name && !ctaLabel.toLowerCase().includes(product.name.toLowerCase())) {
      cta.setAttribute('aria-label', `${ctaLabel}: ${product.name}`);
    }
    ctaWrap.hidden = false;
    block.dataset.productStatus = 'ok';
  } catch (e) {
    block.dataset.productStatus = 'error';
    // eslint-disable-next-line no-console
    console.warn('creative-product-spotlight: product lookup failed', sku, e);
  }
}
