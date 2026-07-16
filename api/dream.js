const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://wnbgwonqpjwzdgcngkxi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hOXpOVD4w7BZURRbVUr75Q_JOpI98X5';
const SITE_URL = 'https://dreamgrid.ink';
const DEFAULT_IMAGE = `${SITE_URL}/og-default.png`;

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = async (req, res) => {
  const id = req.query.id;

  let title = 'A dream on Dream Grid';
  let description = "Explore this dream on Dream Grid — the world's map of dreams.";
  let image = DEFAULT_IMAGE;

  if (id) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/dreams?id=eq.${encodeURIComponent(id)}&select=title,description,photo_url&status=eq.active`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const data = await r.json();
      if (Array.isArray(data) && data[0]) {
        if (data[0].title) title = data[0].title;
        if (data[0].description) description = data[0].description.slice(0, 200);
        if (data[0].photo_url) image = data[0].photo_url;
      }
    } catch (e) {
      console.error('OG fetch failed', e);
    }
  }

  const fullTitle = `${title} — Dream Grid`;
  const url = `${SITE_URL}/dream/${id || ''}`;

  const metaBlock = `<!-- OG_META_START -->
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(fullTitle)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<!-- OG_META_END -->`;

  try {
    const filePath = path.join(process.cwd(), 'dream.html');
    let html = fs.readFileSync(filePath, 'utf8');
    html = html.replace(/<!-- OG_META_START -->[\s\S]*?<!-- OG_META_END -->/, metaBlock);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (e) {
    console.error('Could not read dream.html', e);
    res.status(500).send('Something went wrong loading this dream.');
  }
};
