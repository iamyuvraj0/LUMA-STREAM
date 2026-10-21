// SHA-256 of the small, static theme bootstrap in public/index.html. Keeping a hash
// avoids enabling arbitrary inline scripts in the Content Security Policy.
const THEME_BOOTSTRAP_HASH = "'sha256-CrKH4h12qbUFO7o0nFi3hEMVeKOH6nvYLpoSCsCEH1s='";

const FRAME_ORIGINS = [
  'https://www.youtube.com',
  'https://youtube.com',
  'https://www.youtube-nocookie.com',
  'https://www.vidking.net',
  'https://cinesrc.st',
  'https://vidly.pro',
  'https://www.2embed.cc',
  'https://2embed.cc',
  'https://vidlink.pro',
  'https://embed.vidrift.net',
  'https://multiembed.mov',
  'https://embed.smashystream.com',
  'https://player.videasy.net',
  'https://vidsrc.cc',
  'https://watch.rivestream.app',

  'https://yapgrid.com',
  'https://player.vidplus.to',
  'https://player.vidzee.wtf',
  'https://frembed.bar',
  'https://www.frembed.bar',
  'https://www.primewire.tf',
  'https://iframe.pstream.org',
  'https://vidsrc.to',
  'https://vidsrc.tw',
  'https://vidsrc.link',
  'https://vidsrc.wiki',
  'https://vidsrc.sh',
  'https://vidcore.io',
  'https://vidcore.org',
];

export function securityHeaders(req, res, next) {
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${THEME_BOOTSTRAP_HASH}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://image.tmdb.org https://i.ytimg.com",
    "connect-src 'self'",
    `frame-src 'self' ${FRAME_ORIGINS.join(' ')}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', policy);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

export { FRAME_ORIGINS, THEME_BOOTSTRAP_HASH };
