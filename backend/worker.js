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

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json;charset=utf-8',
      ...cors,
    },
  });

const CATALOG = {
  GTA5RP: {
    name: 'GTA5RP',
    home: 'https://forum.gta5rp.com/',
    rulesIndex:
      'https://forum.gta5rp.com/threads/obshchiye-pravila-proyekta.3414615/',
    servers: [
      'Downtown · #1',
      'Vinewood · #2',
      'Richman · #3',
      'Eclipse · #4',
      'Rockford · #5',
      'Redwood · #6',
      'Sunrise · #7',
      'Insquad · #8',
      'Strawberry · #9',
      'Blackberry · #10',
      'La Puerta · #11',
      'Murrieta · #12',
      'Chiliad · #13',
      'Mirror · #14',
      'Milton · #15',
    ],
  },

  'Majestic RP': {
    name: 'Majestic RP',
    home: 'https://forum.majestic-rp.ru/',
    rulesIndex:
      'https://forum.majestic-rp.ru/threads/pravila.3122888/',
    servers: [
      'Detroit · #1',
      'Chicago · #2',
      'New York · #3',
      'Atlanta · #4',
      'San Diego · #5',
      'Miami · #6',
      'Las Vegas · #7',
      'Los Angeles · #8',
      'San Francisco · #9',
      'Washington · #10',
      'Dallas · #11',
      'Boston · #12',
      'Houston · #13',
      'Seattle · #14',
      'Denver · #15',
      'Memphis · #16',
    ],
  },

  'Russia Online': {
    name: 'Russia Online',
    home: 'https://forum.russia.online/',
    rulesIndex: 'https://russiaonline.wiki/wiki/rules',
    servers: [
      'Арбатский · #1',
      'Тверской · #2',
      'Кутузовский · #3',
      'Невский · #4',
      'Ленинский · #5',
      'Советский · #6',
      'Центральный · #7',
    ],
  },
};

const memoryCache = new Map();
const rateMap = new Map();

function normalizeServer(value) {
  return String(value || '')
    .replace(/\s*·\s*#\d+\s*$/u, '')
    .trim();
}

function cleanText(value) {
  return String(value || '')
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
  let text = String(html || '');

  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return cleanText(text)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLinks(html, baseUrl) {
  const links = [];
  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html || ''))) {
    const href = String(match[1] || '').trim();

    const title = cleanText(
      String(match[2] || '').replace(/<[^>]+>/g, ' ')
    );

    if (!href || !title) continue;

    try {
      const url = new URL(href, baseUrl).href;

      if (
        url.startsWith('https://') ||
        url.startsWith('http://')
      ) {
        links.push({
          title,
          url,
        });
      }
    } catch {
      // Ignore malformed links.
    }
  }

  const seen = new Set();

  return links.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

async function fetchHtml(url) {
  const cached = memoryCache.get(url);
  const now = Date.now();

  if (cached && now - cached.at < CACHE_TTL * 1000) {
    return cached.html;
  }

  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: 'https://forum.gta5rp.com/',
      'Cache-Control': 'no-cache',
    },
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} при запросе ${url}: ${body.slice(
        0,
        300
      )}`
    );
  }

  const html = body.slice(0, 2_000_000);

  memoryCache.set(url, {
    html,
    at: now,
  });

  return html;
}

async function fetchText(url) {
  return fetchHtml(url);
}

function scoreText(text, question) {
  const lower = String(text || '').toLowerCase();

  const words = String(question || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]+/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  let score = 0;

  for (const word of words) {
    if (lower.includes(word)) {
      score += word.length >= 5 ? 3 : 1;
    }
  }

  const numbers =
    String(question || '').match(/\d+(?:\.\d+)*/g) || [];

  for (const number of numbers) {
    if (lower.includes(number)) {
      score += 20;
    }
  }

  return score;
}

/*
 * Актуальные разделы Richman.
 *
 * Форум показывает:
 * Сервер Richman
 *   Государственные организации
 *     Government
 *       Законодательная база
 */
const GTA_SERVER_CATEGORIES = {
  Richman: {
    rules:
      'https://forum.gta5rp.com/threads/pravila-servera-richman.1794719/',
    government:
      'https://forum.gta5rp.com/forums/government.490/',
    laws:
      'https://forum.gta5rp.com/forums/zakonodatel-naya-baza.1268/',
  },
};

async function discoverGtaServer(project, server, mode) {
  if (project !== 'GTA5RP') {
    return discoverGeneric(
      CATALOG[project],
      normalizeServer(server),
      mode
    );
  }

  const serverName = normalizeServer(server);

  /*
   * Для Richman используем официальный раздел напрямую.
   * Это намного надёжнее, чем пытаться найти его
   * через общий индекс правил проекта.
   */
  if (serverName === 'Richman') {
    if (mode === 'laws') {
      return {
        serverName,
        roots: [
          {
            title: 'Законодательная база — Richman',
            url: GTA_SERVER_CATEGORIES.Richman.laws,
          },
        ],
        note: null,
      };
    }

    return {
      serverName,
      roots: [
        {
          title: 'Правила сервера Richman',
          url: GTA_SERVER_CATEGORIES.Richman.rules,
        },
      ],
      note: null,
    };
  }

  /*
   * Для остальных серверов сохраняем автоматический поиск.
   */
  const indexHtml = await fetchHtml(CATALOG.GTA5RP.rulesIndex);

  const links = extractLinks(
    indexHtml,
    CATALOG.GTA5RP.rulesIndex
  );

  const serverLower = serverName.toLowerCase();

  const serverLink = links.find((item) => {
    const title = item.title.toLowerCase();

    return (
      title.includes(`правила сервера ${serverLower}`) ||
      (title.includes(serverLower) &&
        item.url.includes('/threads/'))
    );
  });

  if (!serverLink) {
    return {
      serverName,
      roots: [],
      note: `Не найден официальный раздел сервера «${serverName}».`,
    };
  }

  const serverHtml = await fetchHtml(serverLink.url);

  const serverLinks = extractLinks(
    serverHtml,
    serverLink.url
  );

  if (mode === 'laws') {
    const lawLink = serverLinks.find((item) =>
      /законодатель|законы|кодекс/i.test(item.title)
    );

    if (!lawLink) {
      return {
        serverName,
        roots: [],
        note:
          `Для сервера ${serverName} не найден отдельный официальный раздел законодательной базы.`,
      };
    }

    return collectThreads(
      lawLink.url,
      lawLink.title,
      serverName,
      'laws'
    );
  }

  const ruleLinks = serverLinks.filter(
    (item) =>
      item.url.includes('/threads/') &&
      /правил|правило|дополнен|переопредел|организац|фракц|зон/i.test(
        item.title
      )
  );

  return {
    serverName,
    roots: uniqueItems([
      {
        title: `Правила сервера ${serverName}`,
        url: serverLink.url,
      },
      ...ruleLinks.slice(0, 10),
    ]),
    note: null,
  };
}

async function discoverGeneric(cfg, serverName, mode) {
  const html = await fetchHtml(cfg.rulesIndex);

  const links = extractLinks(
    html,
    cfg.rulesIndex
  );

  const terms =
    mode === 'laws'
      ? /закон|кодекс|законодатель|право|constitution|law/i
      : /правил|rules/i;

  const serverMatch =
    serverName &&
    links.find(
      (item) =>
        item.url.includes('/threads/') &&
        item.title
          .toLowerCase()
          .includes(serverName.toLowerCase())
    );

  const selected = links
    .filter(
      (item) =>
        terms.test(item.title) &&
        item.url.includes('/threads/')
    )
    .slice(0, 12);

  return {
    serverName,
    roots: uniqueItems([
      ...(serverMatch
        ? [
            {
              title: serverMatch.title,
              url: serverMatch.url,
            },
          ]
        : []),
      ...selected,
    ]),
    note: null,
  };
}

async function collectThreads(
  categoryUrl,
  categoryTitle,
  serverName,
  mode
) {
  const html = await fetchHtml(categoryUrl);

  const links = extractLinks(
    html,
    categoryUrl
  );

  const pattern =
    mode === 'laws'
      ? /закон|кодекс|конституц|акт|право|трудовой|административ|уголов|процессуал|гражданск|дорожн/i
      : /правил|фракц|организац|мероприят|зон|дополнен|переопредел/i;

  const threads = links
    .filter(
      (item) =>
        item.url.includes('/threads/') &&
        pattern.test(item.title)
    )
    .slice(0, 20);

  return {
    serverName,
    roots: uniqueItems([
      {
        title: categoryTitle,
        url: categoryUrl,
      },
      ...threads,
    ]),
    note: null,
  };
}

function uniqueItems(items) {
  const seen = new Set();

  return items.filter((item) => {
    if (!item?.url || seen.has(item.url)) {
      return false;
    }

    seen.add(item.url);
    return true;
  });
}

async function gatherContext(
  project,
  server,
  mode,
  question
) {
  const discovered = await discoverGtaServer(
    project,
    server,
    mode
  );

  if (!discovered.roots.length) {
    return {
      context: '',
      sources: [],
      meta: [],
      note: discovered.note || null,
    };
  }

  const results = [];

  await Promise.all(
    discovered.roots
      .slice(0, 12)
      .map(async (item) => {
        try {
          const html = await fetchText(item.url);
          const text = htmlToText(html);

          if (text.length < 120) return;

          results.push({
            ...item,
            text,
            score: scoreText(text, question),
          });
        } catch (error) {
          results.push({
            ...item,
            text: '',
            score: -1,
            error: String(
              error?.message || error
            ),
          });
        }
      })
  );

  results.sort((a, b) => b.score - a.score);

  const chosen = results
    .filter((item) => item.text)
    .slice(0, MAX_RESULTS);

  const context = chosen
    .map(
      (item, index) =>
        `[ИСТОЧНИК ${index + 1}] ${item.title}
URL: ${item.url}
${item.text.slice(0, 8000)}`
    )
    .join('\n\n---\n\n');

  return {
    context,
    sources: chosen.map((item) => item.url),
    meta: results.map((item) => ({
      title: item.title,
      url: item.url,
      score: item.score,
      chars: item.text.length,
      error: item.error || null,
    })),
    note: discovered.note || null,
  };
}

function rateLimit(req) {
  const ip =
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('x-forwarded-for') ||
    'unknown';

  const now = Date.now();
  const hit = rateMap.get(ip);

  if (!hit || now - hit.at > 60_000) {
    rateMap.set(ip, {
      at: now,
      count: 1,
    });

    return true;
  }

  hit.count++;

  return hit.count <= 12;
}

async function ask(req, env) {
  if (!rateLimit(req)) {
    return json(
      {
        error:
          'Слишком много запросов. Подожди около минуты.',
      },
      429
    );
  }

  let body;

  try {
    body = await req.json();
  } catch {
    return json(
      {
        error: 'Неверный JSON.',
      },
      400
    );
  }

  const project = String(
    body.project || 'GTA5RP'
  ).trim();

  const server = String(
    body.server || ''
  ).trim();

  const mode =
    body.mode === 'laws'
      ? 'laws'
      : 'rules';

  const question = String(
    body.question || ''
  ).trim();

  if (!CATALOG[project]) {
    return json(
      {
        error: 'Неизвестный проект.',
      },
      400
    );
  }

  if (!server) {
    return json(
      {
        error: 'Не выбран сервер.',
      },
      400
    );
  }

  if (!question) {
    return json(
      {
        error: 'Напиши вопрос.',
      },
      400
    );
  }

  if (question.length > MAX_QUESTION) {
    return json(
      {
        error:
          `Вопрос слишком длинный. Максимум ${MAX_QUESTION} символов.`,
      },
      400
    );
  }

  try {
    const {
      context,
      sources,
      meta,
      note,
    } = await gatherContext(
      project,
      server,
      mode,
      question
    );

    if (!context) {
      return json({
        answer:
          note ||
          'Не удалось найти подходящие официальные страницы.',
        sources: [],
        meta,
      });
    }

    /*
     * Пока Groq не подключён, возвращаем найденный
     * официальный текст. Это позволяет отдельно
     * проверить работу форума.
     */
    if (!env.LLM_API_KEY) {
      return json({
        answer:
          'LLM_API_KEY ещё не подключён.\n\n' +
          'Найденный официальный материал:\n\n' +
          context.slice(0, 10000),
        sources,
        meta,
      });
    }

    const system = [
      'Ты GTA 5 RP Legal Helper.',
      'Отвечай только на русском языке.',
      `Проект: ${project}.`,
      `Сервер: ${normalizeServer(server)}.`,
      `Раздел: ${
        mode === 'laws'
          ? 'Законодательная база'
          : 'Правила сервера'
      }.`,
      '',
      'Используй ТОЛЬКО предоставленный контекст.',
      'Не выдумывай статьи, пункты, наказания, сроки и исключения.',
      'Если точного ответа нет в контексте, так и скажи.',
      'Если есть номер статьи, обязательно укажи его.',
      '',
      'КОНТЕКСТ:',
      context,
    ].join('\n');

    const base = (
      env.LLM_BASE ||
      'https://api.groq.com/openai/v1'
    ).replace(/\/$/, '');

    const model =
      env.LLM_MODEL ||
      'llama-3.3-70b-versatile';

    const llm = await fetch(
      `${base}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type':
            'application/json',
          authorization:
            `Bearer ${env.LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 1200,
          messages: [
            {
              role: 'system',
              content: system,
            },
            {
              role: 'user',
              content: question,
            },
          ],
        }),
      }
    );

    if (!llm.ok) {
      return json(
        {
          error: 'Ошибка AI-сервера.',
          detail: (
            await llm.text()
          ).slice(0, 500),
        },
        502
      );
    }

    const data = await llm.json();

    return json({
      answer:
        data.choices?.[0]?.message?.content ||
        'AI не вернул ответ.',
      sources,
      meta,
    });
  } catch (error) {
    return json(
      {
        error:
          'Ошибка чтения официального форума.',
        detail: String(
          error?.message || error
        ),
      },
      502
    );
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response('', {
        status: 204,
        headers: cors,
      });
    }

    if (
      url.pathname === '/api/catalog' &&
      req.method === 'GET'
    ) {
      return json({
        version:
          env.APP_VERSION ||
          APP_VERSION,
        projects: CATALOG,
      });
    }

    if (
      url.pathname === '/api/health' &&
      req.method === 'GET'
    ) {
      return json({
        service:
          'GTA5RP Legal Helper API',
        status: 'ok',
        mode: 'live-forum',
        database: 'none',
        version:
          env.APP_VERSION ||
          APP_VERSION,
        llmConfigured:
          !!env.LLM_API_KEY,
        projects:
          Object.keys(CATALOG),
      });
    }

    if (
      url.pathname === '/api/version' &&
      req.method === 'GET'
    ) {
      return json({
        version:
          env.APP_VERSION ||
          APP_VERSION,
        downloadUrl:
          env.DOWNLOAD_URL ||
          DOWNLOAD_URL,
        minClientVersion:
          env.APP_VERSION ||
          APP_VERSION,
      });
    }

    if (
      url.pathname === '/api/ask' &&
      req.method === 'POST'
    ) {
      return ask(req, env);
    }

    if (
      url.pathname === '/' &&
      req.method === 'GET'
    ) {
      return json({
        service:
          'GTA5RP Legal Helper API',
        status: 'ok',
        mode: 'live-forum',
      });
    }

    return json(
      {
        error: 'not found',
      },
      404
    );
  },
};
