/**
 * Returns true when the current page contains experiment, campaign, or audience metadata.
 *
 * @returns {boolean} whether experimentation should be loaded
 */
const isExperimentationEnabled = () => document.head.querySelector(
  '[name^="experiment"],[name^="campaign-"],[name^="audience-"],[property^="campaign:"],[property^="audience:"]',
) || [...document.querySelectorAll('.section-metadata div')]
  .some((element) => element.textContent.match(/Experiment|Campaign|Audience/i));

/**
 * Load the experimentation engine for live pages.
 *
 * @param {Document} doc page document
 * @param {object} config experimentation configuration
 * @returns {Promise<unknown>} plugin result
 */
export async function runExperimentation(doc, config) {
  if (!isExperimentationEnabled()) {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'hlx:experimentation-get-config') {
        event.source?.postMessage({
          type: 'hlx:experimentation-config',
          config: { experiments: [], audiences: [], campaigns: [] },
          source: 'no-experiments',
        }, '*');
      }
    });
    return null;
  }

  try {
    const { loadEager } = await import('../plugins/experimentation/src/index.js');
    return loadEager(doc, config);
  } catch (error) {
    console.error('Failed to load experimentation module (eager):', error);
    return null;
  }
}

/**
 * Load the Sidekick experimentation simulation UI in preview environments.
 *
 * @param {Document} doc page document
 * @param {object} config experimentation configuration
 * @returns {Promise<unknown>} plugin result
 */
export async function runExperimentationLazy(doc, config) {
  const { host, hostname, origin } = window.location;
  const isPreview = hostname === 'localhost'
    || hostname.endsWith('.page')
    || (typeof config.isProd === 'function' && !config.isProd())
    || (config.prodHost && ![host, hostname, origin].includes(config.prodHost));

  if (!isPreview) return null;

  try {
    const { loadLazy } = await import('../plugins/experimentation/src/index.js');
    return loadLazy(doc, config);
  } catch (error) {
    console.error('Failed to load experimentation module (lazy):', error);
    return null;
  }
}
