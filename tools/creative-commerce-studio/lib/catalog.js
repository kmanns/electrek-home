/**
 * Author-side product lookup. Uses the same public storefront catalog endpoint
 * and headers as the site (config.json -> public.default), so the author sees
 * the product exactly as shoppers in the default store context do.
 */

const QUERY = `query CCS_PRODUCT($skus: [String]) {
  products(skus: $skus) {
    __typename sku name urlKey inStock
    images(roles: ["image", "thumbnail"]) { url label }
  }
}`;

let configPromise;

/** Loads the site's public config once (same origin as the plugin). */
export function loadSiteConfig() {
  if (!configPromise) {
    configPromise = fetch('/config.json', { credentials: 'omit' })
      .then((res) => {
        if (!res.ok) throw new Error(`Site config could not be loaded (${res.status}).`);
        return res.json();
      })
      .then((json) => json?.public?.default || {});
  }
  return configPromise;
}

/** Mirrors sanitizeName/getProductLink in scripts/commerce.js (default root). */
function sanitizeName(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function productPath(urlKey, sku) {
  return `/products/${sanitizeName(urlKey)}/${sanitizeName(sku)}`;
}

/** Returns the product or null when the SKU does not exist in this store view. */
export async function lookupProduct(sku) {
  const config = await loadSiteConfig();
  const endpoint = config['commerce-endpoint'];
  if (!endpoint) throw new Error('The site config has no commerce-endpoint.');
  const headers = {
    'Content-Type': 'application/json',
    ...(config.headers?.all || {}),
    ...(config.headers?.cs || {}),
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    credentials: 'omit',
    body: JSON.stringify({ query: QUERY, variables: { skus: [sku] } }),
  });
  if (!res.ok) throw new Error(`Catalog request failed (${res.status}).`);
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(`Catalog error: ${errors[0].message}`);
  const product = data?.products?.find((p) => p?.sku === sku);
  if (!product) return null;
  return {
    sku: product.sku,
    name: product.name,
    type: product.__typename,
    urlKey: product.urlKey,
    inStock: product.inStock,
    image: product.images?.[0]?.url || null,
    path: product.urlKey ? productPath(product.urlKey, product.sku) : null,
  };
}
