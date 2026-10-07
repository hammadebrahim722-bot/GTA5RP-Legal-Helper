const APP_VERSION = '3.4.0';
const DOWNLOAD_URL = 'https://YOUR-SITE.pages.dev/GTA5RP-Legal-Helper.zip';
const MAX_QUESTION = 1200;
const MAX_RESULTS = 5;
const CACHE_TTL = 900;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const json = (x, status = 200, extra = {}) =>
  new Response(JSON.stringify(x), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8', ...cors, ...extra },
  });

const CATALOG = {
  GTA5RP: {
    name: 'GTA5RP',
    home: 'https://forum.gta5rp.com/',
    rulesIndex: 'https://forum.gta5rp.com/threads/obshchiye-pravila-proyekta.3414615/',
    servers: [
      'Downtown · #1', 'Vinewood · #2', 'Richman · #3', 'Eclipse · #4', 'Rockford · #5',
      'Redwood · #6', 'Sunrise · #7', 'Insquad · #8', 'Strawberry · #9', 'Blackberry · #10',
      'La Puerta · #11', 'Murrieta · #12', 'Chiliad · #13', 'Mirror · #14', 'Milton · #15'
    ]
  },
  'Majestic RP': {
    name: 'Majestic RP',
    home: 'https://forum.majestic-rp.ru/',
    rulesIndex: 'https://forum.majestic-rp.ru/threads/pravila.3122888/',
    servers: [
      'Detroit · #1', 'Chicago · #2', 'New York · #3', 'Atlanta · #4', 'San Diego · #5',
      'Miami · #6', 'Las Vegas · #7', 'Los Angeles · #8', 'San Francisco · #9',
      'Washington · #10', 'Dallas · #11', 'Boston · #12', 'Houston · #13',
      'Seattle · #14', 'Denver · #15', 'Memphis · #16'
    ]
  },
  'Russia Online': {
    name: 'Russia Online',
    home: 'https://forum.russia.online/',
    rulesIndex: 'https://russiaonline.wiki/wiki/rules',
    servers: [
      'Арбатский · #1', 'Тверской · #2', 'Кутузовский · #3', 'Невский · #4',
      'Ленинский · #5', 'Советский · #6', 'Центральный · #7'
    ]
  }
};

const memoryCache = new Map();
const rateMap = new Map();

function normalizeServer(value) {
  return String(value || '').replace(/\s*·\s*#\d+\s*$/u, '').trim();
}

function cleanText(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToText(html) {
  let t = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[^]*?-->/g, ' ');

  const blocks = [];
  const re = /<(article|div)[^>]*(?:class|id)=["'][^"']*(?:message-body|message|bbWrapper|article-content|content|post|p-body)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(t)) && blocks.length < 10) blocks.push(m[2]);
  if (blocks.length) t = blocks.join('\n\n');

  return cleanText(t
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html || ''))) {
    const href = m[1].trim();
    const title = cleanText(m[2].replace(/<[^>]+>/g, ' '));
    if (!href || !title) continue;
    try {
      const url = new URL(href, baseUrl).href;
      if (url.startsWith('http://') || url.startsWith('https://')) out.push({ title, url });
    } catch {}
  }
  const seen = new Set();
  return out.filter(x => !seen.has(x.url) && seen.add(x.url));
}

async function fetchHtml(url) {
  const now = Date.now();
  const hit = memoryCache.get(url);
  if (hit && now - hit.at < CACHE_TTL * 1000) return hit.html;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
      headers: {
        'user-agent': 'GTA5RP-Legal-Helper/3.4 (+live forum reader)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = (await response.text()).slice(0, 1000000);
    memoryCache.set(url, { html, at: now });
    return html;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  return htmlToText(await fetchHtml(url));
}

function scoreText(text, question) {
  const lower = text.toLowerCase();
  const words = String(question || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]+/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);
  let score = 0;
  for (const word of words) score += lower.includes(word) ? (word.length >= 5 ? 3 : 1) : 0;
  for (const n of String(question).match(/\d+(?:\.\d+)*/g) || []) if (lower.includes(n)) score += 10;
  return score;
}

async function discoverGtaServer(project, server, mode) {
  const cfg = CATALOG[project];
  if (!cfg) throw new Error('Проект не найден');
  const serverName = normalizeServer(server);

  if (project !== 'GTA5RP') {
    return discoverGeneric(cfg, serverName, mode);
  }

  const indexHtml = await fetchHtml(cfg.rulesIndex);
  const links = extractLinks(indexHtml, cfg.rulesIndex);
  const serverLink = links.find(x =>
    x.title.toLowerCase().includes(`правила сервера ${serverName.toLowerCase()}`) ||
    x.title.toLowerCase().includes(serverName.toLowerCase()) && x.url.includes('server-')
  );

  if (!serverLink) {
    throw new Error(`Не найден официальный раздел сервера «${serverName}» на форуме GTA5RP.`);
  }

  const serverHtml = await fetchHtml(serverLink.url);
  const serverLinks = extractLinks(serverHtml, serverLink.url);

  if (mode === 'laws') {
    const lawLink = serverLinks.find(x => /законодательн|законы|кодекс/i.test(x.title));
    if (!lawLink) {
      return {
        serverName,
        roots: [],
        note: `Для сервера ${serverName} не найден отдельный официальный раздел законодательной базы.`
      };
    }
    return collectThreads(lawLink.url, lawLink.title, serverName, 'laws');
  }

  const ruleLinks = serverLinks.filter(x =>
    x.url.includes('/threads/') && /правил|правило|дополнен|переопредел|организац|фракц|зон/i.test(x.title)
  );
  const roots = [
    { title: `Правила сервера ${serverName}`, url: serverLink.url },
    ...ruleLinks.slice(0, 10)
  ];
  return { serverName, roots: uniqueItems(roots), note: null };
}

async function discoverGeneric(cfg, serverName, mode) {
  const html = await fetchHtml(cfg.rulesIndex);
  const links = extractLinks(html, cfg.rulesIndex);
  const terms = mode === 'laws'
    ? /закон|кодекс|законодатель|право|constitution|law/i
    : /правил|rules/i;
  const serverMatch = serverName && links.find(x =>
    x.url.includes('/threads/') && x.title.toLowerCase().includes(serverName.toLowerCase())
  );
  const selected = links.filter(x => terms.test(x.title) && x.url.includes('/threads/')).slice(0, 12);
  return {
    serverName,
    roots: uniqueItems([
      ...(serverMatch ? [{ title: serverMatch.title, url: serverMatch.url }] : []),
      ...selected
    ]),
    note: null
  };
}

async function collectThreads(categoryUrl, categoryTitle, serverName, mode) {
  const html = await fetchHtml(categoryUrl);
  const links = extractLinks(html, categoryUrl);
  const pattern = mode === 'laws'
    ? /закон|кодекс|конституц|прецедент|изменен|акт|право/i
    : /правил|фракц|организац|мероприят|зон|дополнен|переопредел/i;
  const threads = links.filter(x => x.url.includes('/threads/') && pattern.test(x.title)).slice(0, 14);
  return {
    serverName,
    roots: uniqueItems([{ title: categoryTitle, url: categoryUrl }, ...threads]),
    note: null
  };
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter(x => !seen.has(x.url) && seen.add(x.url));
}

async function gatherContext(project, server, mode, question) {
  const discovered = await discoverGtaServer(project, server, mode);
  if (!discovered.roots.length) {
    return { context: '', sources: [], meta: [], note: discovered.note || null };
  }

  const results = [];
  await Promise.all(discovered.roots.slice(0, 12).map(async item => {
    try {
      const text = await fetchText(item.url);
      if (text.length < 120) return;
      results.push({ ...item, text, score: scoreText(text, question) });
    } catch (e) {
      results.push({ ...item, text: '', score: -1, error: String(e?.message || e) });
    }
  }));

  results.sort((a, b) => b.score - a.score);
  const chosen = results.filter(x => x.text).slice(0, MAX_RESULTS);
  const context = chosen.map((x, i) =>
    `[ИСТОЧНИК ${i + 1}] ${x.title}\nURL: ${x.url}\n${x.text.slice(0, 6500)}`
  ).join('\n\n---\n\n');

  return {
    context,
    sources: chosen.map(x => x.url),
    meta: results.map(x => ({ title: x.title, url: x.url, score: x.score, chars: x.text.length, error: x.error || null })),
    note: discovered.note || null
  };
}

function rateLimit(req) {
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const hit = rateMap.get(ip);
  if (!hit || now - hit.at > 60_000) {
    rateMap.set(ip, { at: now, count: 1 });
    return true;
  }
  hit.count++;
  return hit.count <= 12;
}

async function ask(req, env) {
  if (!rateLimit(req)) return json({ error: 'Слишком много запросов. Подожди около минуты.' }, 429);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Неверный JSON.' }, 400); }

  const project = String(body.project || 'GTA5RP').trim();
  const server = String(body.server || '').trim();
  const mode = body.mode === 'laws' ? 'laws' : 'rules';
  const question = String(body.question || '').trim();

  if (!CATALOG[project]) return json({ error: 'Неизвестный проект.' }, 400);
  if (!server) return json({ error: 'Не выбран сервер.' }, 400);
  if (!question) return json({ error: 'Напиши вопрос.' }, 400);
  if (question.length > MAX_QUESTION) return json({ error: `Вопрос слишком длинный. Максимум ${MAX_QUESTION} символов.` }, 400);

  try {
    const { context, sources, meta, note } = await gatherContext(project, server, mode, question);
    if (!context) {
      return json({
        answer: note || 'Не удалось найти подходящие официальные страницы для выбранного раздела. Ничего не буду выдумывать.',
        sources: [], meta
      });
    }

    if (!env.LLM_API_KEY) {
      return json({ answer: 'LLM_API_KEY ещё не подключён. Вот найденный текст с форума:\n\n' + context.slice(0, 5000), sources, meta });
    }

    const system = [
      'Ты GTA 5 RP Legal Helper. Отвечай только на русском.',
      `Проект: ${project}. Сервер: ${normalizeServer(server)}.`,
      `Раздел: ${mode === 'laws' ? 'Законодательная база' : 'Правила сервера'}.`,
      'Используй ТОЛЬКО предоставленный контекст с официальных страниц.',
      'Не выдумывай статьи, пункты, наказания, сроки и исключения.',
      'Если точного ответа в контексте нет, прямо скажи, что его не найдено.',
      'Если есть номер статьи/пункта, обязательно укажи его.',
      'В конце дай короткий список источников по URL из контекста.',
      '', 'КОНТЕКСТ:', context
    ].join('\n');

    const base = (env.LLM_BASE || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const model = env.LLM_MODEL || 'llama-3.3-70b-versatile';
    const llm = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({ model, temperature: 0.1, max_tokens: 1200, messages: [
        { role: 'system', content: system },
        { role: 'user', content: question }
      ] })
    });

    if (!llm.ok) return json({ error: 'Ошибка AI-сервера.', detail: (await llm.text()).slice(0, 500) }, 502);
    const data = await llm.json();
    return json({
      answer: data.choices?.[0]?.message?.content || 'AI не вернул ответ.',
      sources,
      meta
    });
  } catch (e) {
    return json({ error: 'Ошибка чтения официального форума.', detail: String(e?.message || e) }, 502);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: cors });

    if (url.pathname === '/api/catalog' && req.method === 'GET') {
      return json({ version: env.APP_VERSION || APP_VERSION, projects: CATALOG });
    }

    if (url.pathname === '/api/health' && req.method === 'GET') {
      return json({
        service: 'GTA5RP Legal Helper API',
        status: 'ok',
        mode: 'live-forum',
        database: 'none',
        version: env.APP_VERSION || APP_VERSION,
        llmConfigured: !!env.LLM_API_KEY,
        projects: Object.keys(CATALOG)
      });
    }

    if (url.pathname === '/api/version' && req.method === 'GET') {
      return json({
        version: env.APP_VERSION || APP_VERSION,
        downloadUrl: env.DOWNLOAD_URL || DOWNLOAD_URL,
        minClientVersion: env.APP_VERSION || APP_VERSION
      });
    }

    if (url.pathname === '/api/ask' && req.method === 'POST') return ask(req, env);
    if (url.pathname === '/' && req.method === 'GET') return json({ service: 'GTA5RP Legal Helper API', status: 'ok', mode: 'live-forum' });
    return json({ error: 'not found' }, 404);
  }
};
