/*
 * Hero — Electrek Home
 * Text overlay over an image or a background video.
 *
 * Video: a plain (not bold/italic) link in the hero to an MP4/WebM file, an
 * AEM Assets video, YouTube, or Vimeo. It plays muted and looping behind the
 * overlay, with a pause/play button. The authored image is the placeholder
 * and the fallback on small screens and for prefers-reduced-motion.
 * No video link → the block is left exactly as authored.
 */

const DESKTOP = window.matchMedia('(min-width: 900px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';
const VIMEO_ORIGIN = 'https://player.vimeo.com';

/** Returns { type: 'file', src } | { type: 'youtube'|'vimeo', id, hash } | null. */
function parseVideo(href) {
  let url;
  try {
    url = new URL(href, window.location.href);
  } catch (e) {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  const { pathname } = url;

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com'
    || host === 'youtube-nocookie.com') {
    const id = host === 'youtu.be'
      ? pathname.split('/')[1]
      : url.searchParams.get('v') || pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
    return /^[\w-]{11}$/.test(id || '') ? { type: 'youtube', id } : null;
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const [, id, hash] = pathname.match(/^\/(?:video\/)?(\d+)(?:\/([\da-f]+))?/) || [];
    return id ? { type: 'vimeo', id, hash: hash || url.searchParams.get('h') } : null;
  }

  // AEM Assets delivery: the picker links the player page; play the original MP4 instead.
  const asset = pathname.match(/^\/adobe\/assets\/([^/]+)\/(?:play|original)(?:\/|$)/);
  if (asset && host.endsWith('.adobeaemcloud.com')) {
    return { type: 'file', src: `${url.origin}/adobe/assets/${asset[1]}/original/as/hero.mp4` };
  }

  if (/\.(mp4|webm)$/i.test(pathname)) return { type: 'file', src: url.href };
  return null;
}

function buildFilePlayer(src) {
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.tabIndex = -1;
  video.src = src;
  return {
    el: video,
    onReady: (cb) => video.addEventListener('playing', cb, { once: true }),
    play: () => video.play().catch(() => {}),
    pause: () => video.pause(),
  };
}

function buildIframePlayer(src, origin, command) {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = 'Background video';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  const send = (action) => iframe.contentWindow?.postMessage(command(action), origin);
  return {
    el: iframe,
    // Embeds don't report playback without their SDKs; give the player a moment
    // to start so its loading UI never flashes over the hero image.
    onReady: (cb) => iframe.addEventListener('load', () => setTimeout(cb, 1200), { once: true }),
    play: () => send('play'),
    pause: () => send('pause'),
  };
}

function buildPlayer(video) {
  if (video.type === 'youtube') {
    const params = new URLSearchParams({
      autoplay: 1,
      mute: 1,
      loop: 1,
      playlist: video.id,
      controls: 0,
      disablekb: 1,
      playsinline: 1,
      rel: 0,
      enablejsapi: 1,
      origin: window.location.origin,
    });
    return buildIframePlayer(
      `${YOUTUBE_ORIGIN}/embed/${video.id}?${params}`,
      YOUTUBE_ORIGIN,
      (action) => JSON.stringify({ event: 'command', func: `${action}Video`, args: [] }),
    );
  }
  if (video.type === 'vimeo') {
    const params = new URLSearchParams({ background: 1, dnt: 1 });
    if (video.hash) params.set('h', video.hash);
    return buildIframePlayer(
      `${VIMEO_ORIGIN}/video/${video.id}?${params}`,
      VIMEO_ORIGIN,
      (action) => JSON.stringify({ method: action }),
    );
  }
  return buildFilePlayer(video.src);
}

function buildToggle(player) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hero-video-toggle';
  const setPaused = (paused) => {
    button.classList.toggle('is-paused', paused);
    button.setAttribute('aria-label', paused ? 'Play background video' : 'Pause background video');
  };
  setPaused(false);
  button.addEventListener('click', () => {
    const paused = !button.classList.contains('is-paused');
    if (paused) player.pause(); else player.play();
    setPaused(paused);
  });
  return { button, setPaused };
}

const canPlay = () => DESKTOP.matches && !REDUCED_MOTION.matches;

const afterPageLoad = () => new Promise((resolve) => {
  if (document.readyState === 'complete') resolve();
  else window.addEventListener('load', resolve, { once: true });
});

function startVideo(block, video) {
  const player = buildPlayer(video);
  const media = document.createElement('div');
  media.className = 'hero-video-media';
  media.append(player.el);
  // After the authored content: same z-layer as the picture, so it paints on top of it.
  block.append(media);

  const { button, setPaused } = buildToggle(player);
  player.onReady(() => {
    media.classList.add('is-playing');
    block.append(button);
  });

  // Stop motion if the visitor turns on reduced motion or the hero shrinks to phone size.
  const stopIfNeeded = () => {
    if (canPlay()) return;
    player.pause();
    setPaused(true);
  };
  REDUCED_MOTION.addEventListener('change', stopIfNeeded);
  DESKTOP.addEventListener('change', stopIfNeeded);
}

export default function decorate(block) {
  const link = [...block.querySelectorAll('a[href]')]
    .find((a) => !a.classList.contains('button') && parseVideo(a.href));
  if (!link) return;

  const video = parseVideo(link.href);
  const p = link.closest('p');
  if (p && p.textContent.trim() === link.textContent.trim()) p.remove();
  else link.remove();

  block.classList.add('hero-video');

  // Never compete with the LCP image; phones and reduced motion keep the image only.
  const tryStart = () => {
    if (block.dataset.videoStarted || !canPlay()) return;
    block.dataset.videoStarted = 'true';
    startVideo(block, video);
  };
  afterPageLoad().then(() => {
    tryStart();
    DESKTOP.addEventListener('change', tryStart);
    REDUCED_MOTION.addEventListener('change', tryStart);
  });
}
