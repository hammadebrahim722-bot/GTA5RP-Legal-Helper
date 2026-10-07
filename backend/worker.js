const APP_VERSION = '3.4.0';
const DOWNLOAD_URL = 'https://YOUR-SITE.pages.dev/GTA5RP-Legal-Helper.zip';

const MAX_QUESTION = 1200;
const MAX_RESULTS = 6;
const CACHE_TTL = 900;
const MAX_CATEGORY_THREADS = 35;
const MAX_RULE_PAGES = 8;

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

/*
 * ============================================================
 * КАТАЛОГ ПРОЕКТОВ
 * ============================================================
 */

const CATALOG = {
  GTA5RP: {
    name: 'GTA5RP',
    home: 'https://forum.gta5rp.com/',
    rulesIndex:
      'https://forum.gta5rp.com/threads/obshchiye-pravila-proyekta.3414615/',

    /*
     * Именно 13 серверов, которые ты указал.
     */
    servers: [
      'Downtown',
      'Strawberry',
      'Blackberry',
      'Insquad',
      'Sunrise',
      'Richman',
      'Eclipse',
      'Rockford',
      'Redwood',
      'Murrieta',
      'La Puerta',
      'Chiliad',
      'Mirror',
    ],
  },

  /*
   * Majestic пока оставляем в каталоге.
   * Его отдельные серверные источники будем подключать
   * через ту же архитектуру.
   */
  'Majestic RP': {
    name: 'Majestic RP',
    home: 'https://forum.majestic-rp.ru/',
    rulesIndex:
      'https://forum.majestic-rp.ru/threads/pravila.3122888/',
    servers: [
      'Detroit',
      'Chicago',
      'New York',
      'Atlanta',
      'San Diego',
      'Miami',
      'Las Vegas',
      'Los Angeles',
      'San Francisco',
      'Washington',
      'Dallas',
      'Boston',
      'Houston',
      'Seattle',
      'Denver',
      'Memphis',
    ],
  },

  'Russia Online': {
    name: 'Russia Online',
    home: 'https://forum.russia.online/',
    rulesIndex: 'https://russiaonline.wiki/wiki/rules',
    servers: [
      'Арбатский',
      'Тверской',
      'Кутузовский',
      'Невский',
      'Ленинский',
      'Советский',
      'Центральный',
    ],
  },
};

/*
 * ============================================================
 * ОФИЦИАЛЬНЫЕ РАЗДЕЛЫ 13 СЕРВЕРОВ GTA5RP
 * ============================================================
 *
 * Это именно страницы серверов.
 *
 * Дальше Worker САМ на странице сервера ищет:
 *
 *   Правила сервера
 *   Государственные организации
 *      -> Government
 *          -> Законодательная база
 *
 * Названия могут отличаться, поэтому поиск сделан
 * не по ID, а по названию раздела.
 */

const GTA_SERVER_PAGES = {
  Downtown:
    'https://forum.gta5rp.com/forums/server-downtown.14/',

  Strawberry:
    'https://forum.gta5rp.com/forums/server-strawberry.89/',

  Blackberry:
    'https://forum.gta5rp.com/forums/server-blackberry.223/',

  Insquad:
    'https://forum.gta5rp.com/forums/server-insquad.296/',

  Sunrise:
    'https://forum.gta5rp.com/forums/server-sunrise.364/',

  Richman:
    'https://forum.gta5rp.com/forums/server-richman.487/',

  Eclipse:
    'https://forum.gta5rp.com/forums/server-eclipse.556/',

  Rockford:
    'https://forum.gta5rp.com/forums/server-rockford.883/',

  Redwood:
    'https://forum.gta5rp.com/forums/server-redwood.1421/',

  Murrieta:
    'https://forum.gta5rp.com/forums/server-murrieta.1689/',

  'La Puerta':
    'https://forum.gta5rp.com/forums/server-la-puerta.1949/',

  Chiliad:
    'https://forum.gta5rp.com/forums/server-chiliad.2094/',

  Mirror:
    'https://forum.gta5rp.com/forums/server-mirror.2163/',
};

/*
 * ============================================================
 * НАДЁЖНЫЕ ПРЯМЫЕ ДОКУМЕНТЫ
 * ============================================================
 *
 * Пока используем как аварийный fallback.
 * Основной механизм всё равно идёт через форум выбранного
 * сервера.
 *
 * Это особенно важно для Richman, где мы уже знаем
 * актуальную редакцию УК.
 */

const GTA_DIRECT_DOCUMENTS = {
  Richman: [
    {
      title:
        'Уголовный кодекс штата Сан-Андреас — редакция от 08 сентября 2026 года',
      url:
        'https://forum.gta5rp.com/threads/ugolovnyi-kodeks-shtata-san-andreas-redaktsiya-ot-08-sentyabrya-2026-goda.3364593/',
      priority: 100,
    },
  ],
};

/*
 * ============================================================
 * КЭШ
 * ============================================================
 */

const memoryCache = new Map();
const rateMap = new Map();

/*
 * ============================================================
 * НОРМАЛИЗАЦИЯ
 * ============================================================
 */

function normalizeServer(value) {
  let result = String(value || '')
    .replace(/\s*·\s*#\d+\s*$/u, '')
    .trim();

  /*
   * На форуме сервер называется Insquad.
   * Если клиент когда-нибудь пришлёт Inscout,
   * всё равно направляем его в Insquad.
   */
  if (/^inscout$/i.test(result)) {
    result = 'Insquad';
  }

  return result;
}

function normalizeProject(value) {
  const raw = String(value || '').trim();

  if (/^gta\s*5\s*rp$/i.test(raw)) {
    return 'GTA5RP';
  }

  if (/^majestic/i.test(raw)) {
    return 'Majestic RP';
  }

  if (/^russia\s*online/i.test(raw)) {
    return 'Russia Online';
  }

  return raw;
}

/*
 * ============================================================
 * HTML -> TEXT
 * ============================================================
 */

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCodePoint(Number(code));
      } catch {
        return ' ';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 16));
      } catch {
        return ' ';
      }
    });
}

function cleanText(value) {
  return decodeHtml(String(value || ''))
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
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
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/th>/gi, ' ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return cleanText(text);
}

/*
 * ============================================================
 * ССЫЛКИ
 * ============================================================
 */

function extractLinks(html, baseUrl) {
  const links = [];

  /*
   * XenForo может располагать атрибуты <a> в разном порядке,
   * поэтому не привязываемся к конкретному порядку атрибутов.
   */
  const anchorRegex =
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = anchorRegex.exec(html || ''))) {
    const attrs = match[1] || '';
    const inner = match[2] || '';

    const hrefMatch =
      attrs.match(
        /\bhref\s*=\s*["']([^"']+)["']/i
      );

    if (!hrefMatch) {
      continue;
    }

    const href = decodeHtml(hrefMatch[1]).trim();

    const title = cleanText(
      inner
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    );

    if (!href || !title) {
      continue;
    }

    try {
      const url = new URL(href, baseUrl).href;

      if (
        !url.startsWith('https://') &&
        !url.startsWith('http://')
      ) {
        continue;
      }

      links.push({
        title,
        url,
      });
    } catch {
      // Игнорируем битые ссылки.
    }
  }

  return uniqueItems(links);
}

/*
 * ============================================================
 * FETCH
 * ============================================================
 */

async function fetchHtml(url) {
  const cached = memoryCache.get(url);
  const now = Date.now();

  if (
    cached &&
    now - cached.at < CACHE_TTL * 1000
  ) {
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
      'Accept-Language':
        'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer:
        'https://forum.gta5rp.com/',
      'Cache-Control':
        'no-cache',
    },
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${body.slice(0, 300)}`
    );
  }

  const html = body.slice(0, 2_500_000);

  memoryCache.set(url, {
    html,
    at: now,
  });

  return html;
}

/*
 * ============================================================
 * ОБЩИЕ УТИЛИТЫ
 * ============================================================
 */

function uniqueItems(items) {
  const seen = new Set();

  return (items || []).filter((item) => {
    if (!item?.url || seen.has(item.url)) {
      return false;
    }

    seen.add(item.url);
    return true;
  });
}

function isForumThread(url) {
  return String(url || '').includes('/threads/');
}

function isForumPage(url) {
  return (
    String(url || '').includes('forum.gta5rp.com/')
  );
}

function hasArchiveWord(title) {
  return /\bархив\b/i.test(
    String(title || '')
  );
}

/*
 * ============================================================
 * ДАТА В НАЗВАНИИ ДОКУМЕНТА
 * ============================================================
 */

function extractDateScore(title) {
  const text = String(title || '');

  const numeric =
    text.match(
      /(\d{1,2})[./](\d{1,2})[./](20\d{2})/
    );

  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);

    return Date.UTC(year, month - 1, day);
  }

  const monthMap = {
    января: 0,
    февраля: 1,
    марта: 2,
    апреля: 3,
    мая: 4,
    июня: 5,
    июля: 6,
    августа: 7,
    сентября: 8,
    октября: 9,
    ноября: 10,
    декабря: 11,
  };

  const verbal =
    text.match(
      /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(20\d{2})/i
    );

  if (verbal) {
    const day = Number(verbal[1]);
    const month = monthMap[
      verbal[2].toLowerCase()
    ];
    const year = Number(verbal[3]);

    return Date.UTC(year, month, day);
  }

  return 0;
}

/*
 * ============================================================
 * СТАТЬЯ ИЗ ВОПРОСА
 * ============================================================
 */

function getArticleNumbers(question) {
  const text = String(question || '');

  const found = [];

  const patterns = [
    /\bст\.?\s*(\d+(?:\.\d+){0,3})\b/giu,
    /\bстать(?:я|и|е|ю|ёй|ей)?\s*(\d+(?:\.\d+){0,3})\b/giu,
    /(?:^|\s)(\d+(?:\.\d+){0,3})(?:\s*$)/gu,
  ];

  for (const regex of patterns) {
    let match;

    while ((match = regex.exec(text))) {
      if (match[1]) {
        found.push(match[1]);
      }
    }
  }

  return [...new Set(found)];
}

/*
 * ============================================================
 * ВЫРЕЗАНИЕ СТАТЬИ
 * ============================================================
 */

function extractArticleContext(
  text,
  articleNumbers
) {
  const source = String(text || '');

  if (!articleNumbers.length) {
    return source;
  }

  for (const number of articleNumbers) {
    const escaped =
      number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const regex = new RegExp(
      `(?:^|\\n|\\s)Статья\\s+${escaped}(?=\\s|\\.|:|\\(|-)`,
      'iu'
    );

    const match = regex.exec(source);

    if (!match) {
      continue;
    }

    const start = Math.max(
      0,
      match.index - 500
    );

    /*
     * Берём большой кусок, чтобы захватить:
     * - название статьи
     * - описание
     * - части статьи
     * - наказание
     * - ((минуты))
     * - исключения
     */
    const fragment = source.slice(
      start,
      start + 10000
    );

    return fragment;
  }

  return '';
}

/*
 * ============================================================
 * ИЗВЛЕЧЕНИЕ ИГРОВОГО НАКАЗАНИЯ
 * ============================================================
 *
 * НИЧЕГО НЕ ПЕРЕСЧИТЫВАЕМ.
 *
 * Если на форуме написано:
 *
 * 8-12 лет ((80-120 мин))
 *
 * берём именно 80-120 мин.
 */

function extractGamePenalty(text) {
  const source = String(text || '');

  const matches =
    source.match(
      /\(\(\s*[^()]{0,250}?\b(?:мин|минут|минуты|дней|дня|час(?:а|ов)?)\b[^()]{0,250}?\)\)/giu
    ) || [];

  return [...new Set(
    matches.map((item) => item.trim())
  )].slice(0, 8);
}

/*
 * ============================================================
 * СКОРИНГ
 * ============================================================
 */

function scoreText(
  text,
  question,
  title = ''
) {
  const lower =
    String(text || '').toLowerCase();

  const titleLower =
    String(title || '').toLowerCase();

  const q =
    String(question || '')
      .toLowerCase();

  const words = q
    .replace(/[^\p{L}\p{N}\s.]+/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  let score = 0;

  for (const word of words) {
    if (lower.includes(word)) {
      score += word.length >= 6 ? 4 : 1;
    }

    if (titleLower.includes(word)) {
      score += word.length >= 6 ? 12 : 4;
    }
  }

  const numbers =
    q.match(/\d+(?:\.\d+)*/g) || [];

  for (const number of numbers) {
    const articleRegex = new RegExp(
      `\\b${number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
    );

    if (articleRegex.test(lower)) {
      score += 20;
    }

    if (
      new RegExp(
        `статья\\s+${number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i'
      ).test(lower)
    ) {
      score += 100;
    }
  }

  /*
   * Если вопрос похож на DB/DM/MG/PG и т.д.,
   * правила проекта становятся особенно важными.
   */
  const abbreviations =
    q.match(/\b(?:db|dm|mg|pg|rk|nlr|tk|sk|nonrp|fearrp)\b/gi) || [];

  for (const abbreviation of abbreviations) {
    if (
      lower.includes(abbreviation.toLowerCase())
    ) {
      score += 80;
    }
  }

  return score;
}

/*
 * ============================================================
 * ОПРЕДЕЛЕНИЕ НУЖНОГО ДОКУМЕНТА
 * ============================================================
 */

function documentTitleScore(
  title,
  question,
  mode
) {
  const t =
    String(title || '').toLowerCase();

  const q =
    String(question || '').toLowerCase();

  let score = 0;

  /*
   * Для статей типа 17.1 почти всегда нужен УК.
   */
  const articleNumbers =
    getArticleNumbers(question);

  if (articleNumbers.length) {
    if (
      /уголов|уголовно|административ/.test(t)
    ) {
      score += 100;
    }

    if (/кодекс/.test(t)) {
      score += 25;
    }
  }

  /*
   * Законодательные вопросы.
   */
  if (mode === 'laws') {
    if (/уголов/.test(q) && /уголов/.test(t)) {
      score += 80;
    }

    if (
      /админ|штраф|парков|дорож|скорост/.test(q) &&
      /административ|дорожн/.test(t)
    ) {
      score += 70;
    }

    if (
      /суд|иск|адвокат|прокурат|доказатель/.test(q) &&
      /процессуал|судеб/.test(t)
    ) {
      score += 60;
    }

    if (
      /работ|увольн|зарплат|отпуск/.test(q) &&
      /труд/.test(t)
    ) {
      score += 60;
    }

    if (
      /конституц|презумпц|права граждан|свобод/.test(q) &&
      /конституц/.test(t)
    ) {
      score += 60;
    }
  }

  /*
   * Для игровых правил.
   */
  if (mode === 'rules') {
    if (
      /\bdb\b|\bdm\b|\bmg\b|\bpg\b|\brk\b|\bnlr\b|\btk\b|\bsk\b/i.test(q)
    ) {
      if (
        /правил|общие|игров|roleplay|rp/.test(t)
      ) {
        score += 70;
      }
    }

    if (
      /гос|government|фракц/.test(q) &&
      /государ|фракц/.test(t)
    ) {
      score += 50;
    }

    if (
      /криминал|банда|мафия/.test(q) &&
      /криминал/.test(t)
    ) {
      score += 50;
    }
  }

  /*
   * Более новая редакция важнее старой.
   */
  const date = extractDateScore(title);

  if (date) {
    score +=
      Math.floor(
        date / 86_400_000_000
      );
  }

  if (hasArchiveWord(title)) {
    score -= 500;
  }

  return score;
}

/*
 * ============================================================
 * ПОИСК ПОДФОРУМА НА СТРАНИЦЕ СЕРВЕРА
 * ============================================================
 */

function findLawSection(links) {
  const exact = links.find((item) => {
    const title =
      String(item.title || '')
        .trim()
        .toLowerCase();

    return (
      title === 'законодательная база' ||
      title === 'законодательство'
    );
  });

  if (exact) {
    return exact;
  }

  return links.find((item) =>
    /законодательная база|законодательство/i.test(
      item.title
    )
  );
}

function findRulesSections(links) {
  return links.filter((item) => {
    if (!item.url) {
      return false;
    }

    if (
      !item.url.includes('/forums/')
    ) {
      return false;
    }

    return /общие правила|правила для государственных|правила для государственных фракций|правила для криминальных|правила криминальных|правила неофициальных|дополнительные правила|правила сервера/i.test(
      item.title
    );
  });
}

/*
 * ============================================================
 * СБОР ТЕМ ИЗ КАТЕГОРИИ
 * ============================================================
 */

async function collectCategoryThreads(
  categoryUrl,
  categoryTitle,
  mode
) {
  const firstHtml =
    await fetchHtml(categoryUrl);

  const allLinks = [];

  /*
   * Первая страница.
   */
  allLinks.push(
    ...extractLinks(
      firstHtml,
      categoryUrl
    )
  );

  /*
   * Пытаемся найти страницы пагинации.
   */
  const pagination =
    extractLinks(
      firstHtml,
      categoryUrl
    )
      .filter((item) =>
        item.url.includes('/page-')
      )
      .slice(0, 4);

  for (const page of pagination) {
    try {
      const pageHtml =
        await fetchHtml(page.url);

      allLinks.push(
        ...extractLinks(
          pageHtml,
          page.url
        )
      );
    } catch {
      // Не критично.
    }
  }

  const pattern =
    mode === 'laws'
      ? /закон|кодекс|конституц|акт|право|трудовой|административ|уголов|процессуал|гражданск|дорожн|судебн|прокурат|полици|шериф|government/i
      : /правил|фракц|организац|дополнен|переопредел|roleplay|rp/i;

  const threads = uniqueItems(
    allLinks
      .filter((item) => {
        if (!isForumThread(item.url)) {
          return false;
        }

        if (hasArchiveWord(item.title)) {
          return false;
        }

        return pattern.test(
          item.title
        );
      })
      .slice(0, MAX_CATEGORY_THREADS)
  );

  return {
    title: categoryTitle,
    url: categoryUrl,
    threads,
  };
}

/*
 * ============================================================
 * ОБНАРУЖЕНИЕ ИСТОЧНИКОВ GTA5RP
 * ============================================================
 */

async function discoverGtaServer(
  server,
  mode,
  question
) {
  const serverName =
    normalizeServer(server);

  const serverPage =
    GTA_SERVER_PAGES[serverName];

  if (!serverPage) {
    return {
      serverName,
      roots: [],
      note:
        `Для сервера «${serverName}» не найден официальный форум.`,
    };
  }

  const html =
    await fetchHtml(serverPage);

  const links =
    extractLinks(
      html,
      serverPage
    );

  /*
   * ========================================================
   * ЗАКОНОДАТЕЛЬНАЯ БАЗА
   * ========================================================
   */

  if (mode === 'laws') {
    const lawSection =
      findLawSection(links);

    const roots = [];

    if (lawSection) {
      roots.push({
        title:
          `${lawSection.title} — ${serverName}`,
        url:
          lawSection.url,
        priority: 50,
      });

      try {
        const category =
          await collectCategoryThreads(
            lawSection.url,
            lawSection.title,
            'laws'
          );

        for (const thread of category.threads) {
          roots.push({
            ...thread,
            priority:
              documentTitleScore(
                thread.title,
                question,
                'laws'
              ),
          });
        }
      } catch {
        // Ниже будет fallback.
      }
    }

    /*
     * Для Richman добавляем известный актуальный УК.
     */
    if (GTA_DIRECT_DOCUMENTS[serverName]) {
      roots.push(
        ...GTA_DIRECT_DOCUMENTS[serverName]
      );
    }

    /*
     * Если раздел не нашёлся автоматически,
     * всё равно пробуем прямой документ.
     */
    if (!roots.length) {
      return {
        serverName,
        roots: [],
        note:
          `На официальном форуме сервера ${serverName} не удалось автоматически найти раздел законодательной базы.`,
      };
    }

    return {
      serverName,
      roots: uniqueItems(
        roots
          .sort(
            (a, b) =>
              (b.priority || 0) -
              (a.priority || 0)
          )
          .slice(0, 30)
      ),
      note: null,
    };
  }

  /*
   * ========================================================
   * ИГРОВЫЕ ПРАВИЛА
   * ========================================================
   */

  const roots = [];

  /*
   * Глобальные правила проекта.
   */
  roots.push({
    title:
      'Общие правила проекта GTA5RP',
    url:
      CATALOG.GTA5RP.rulesIndex,
    priority: 80,
  });

  /*
   * Страница правил сервера.
   */
  const serverRules =
    links.find((item) =>
      /правила сервера/i.test(
        item.title
      )
    );

  if (serverRules) {
    roots.push({
      title:
        serverRules.title,
      url:
        serverRules.url,
      priority: 70,
    });
  }

  /*
   * Общие правила / гос / крим / неоф.
   */
  const ruleSections =
    findRulesSections(links);

  for (const section of ruleSections) {
    roots.push({
      title:
        `${section.title} — ${serverName}`,
      url:
        section.url,
      priority:
        documentTitleScore(
          section.title,
          question,
          'rules'
        ),
    });
  }

  /*
   * Специальные дополнения / переопределения.
   */
  const additionalRules =
    links.filter((item) =>
      /переопредел|дополнен.*правил|дополнительные правила/i.test(
        item.title
      )
    );

  for (const item of additionalRules) {
    roots.push({
      title:
        `${item.title} — ${serverName}`,
      url:
        item.url,
      priority: 90,
    });
  }

  return {
    serverName,
    roots: uniqueItems(roots),
    note: null,
  };
}

/*
 * ============================================================
 * ДРУГИЕ ПРОЕКТЫ
 * ============================================================
 */

async function discoverGeneric(
  project,
  server,
  mode,
  question
) {
  const cfg =
    CATALOG[project];

  if (!cfg) {
    return {
      roots: [],
      note:
        'Неизвестный проект.',
    };
  }

  /*
   * Для Majestic/Russia Online пока используем
   * официальный общий раздел.
   *
   * Архитектура уже готова для серверных разделов.
   */
  const roots = [];

  roots.push({
    title:
      mode === 'laws'
        ? `${project} — законодательство`
        : `${project} — правила проекта`,
    url:
      cfg.rulesIndex,
    priority: 80,
  });

  try {
    const html =
      await fetchHtml(
        cfg.rulesIndex
      );

    const links =
      extractLinks(
        html,
        cfg.rulesIndex
      );

    const terms =
      mode === 'laws'
        ? /закон|кодекс|законодатель|право|constitution|law/i
        : /правил|rules|db|dm|mg|pg/i;

    const selected =
      links
        .filter((item) =>
          isForumThread(item.url) &&
          terms.test(item.title) &&
          !hasArchiveWord(item.title)
        )
        .map((item) => ({
          ...item,
          priority:
            documentTitleScore(
              item.title,
              question,
              mode
            ),
        }))
        .sort(
          (a, b) =>
            (b.priority || 0) -
            (a.priority || 0)
        )
        .slice(0, 15);

    roots.push(
      ...selected
    );
  } catch {
    // Общая страница всё равно останется источником.
  }

  return {
    roots:
      uniqueItems(roots),
    note: null,
  };
}

/*
 * ============================================================
 * ОБЩЕЕ ОБНАРУЖЕНИЕ
 * ============================================================
 */

async function discoverSources(
  project,
  server,
  mode,
  question
) {
  if (project === 'GTA5RP') {
    return discoverGtaServer(
      server,
      mode,
      question
    );
  }

  return discoverGeneric(
    project,
    server,
    mode,
    question
  );
}

/*
 * ============================================================
 * СБОР КОНТЕКСТА
 * ============================================================
 */

async function gatherContext(
  project,
  server,
  mode,
  question
) {
  const discovered =
    await discoverSources(
      project,
      server,
      mode,
      question
    );

  if (!discovered.roots.length) {
    return {
      context: '',
      sources: [],
      meta: [],
      note:
        discovered.note ||
        null,
    };
  }

  const articleNumbers =
    getArticleNumbers(question);

  const candidates =
    discovered.roots
      .map((item) => ({
        ...item,
        titleScore:
          documentTitleScore(
            item.title,
            question,
            mode
          ),
      }))
      .sort(
        (a, b) =>
          (b.titleScore || 0) -
          (a.titleScore || 0)
      )
      .slice(0, 18);

  const results = [];

  await Promise.all(
    candidates.map(
      async (item) => {
        try {
          const html =
            await fetchHtml(
              item.url
            );

          const text =
            htmlToText(html);

          if (text.length < 100) {
            return;
          }

          /*
           * Если пользователь указал статью,
           * пытаемся найти именно её.
           */
          let articleText = '';

          if (
            mode === 'laws' &&
            articleNumbers.length
          ) {
            articleText =
              extractArticleContext(
                text,
                articleNumbers
              );
          }

          const relevantText =
            articleText ||
            text;

          const score =
            scoreText(
              relevantText,
              question,
              item.title
            ) +
            (item.titleScore || 0);

          results.push({
            ...item,
            text,
            relevantText,
            score,
            articleFound:
              Boolean(articleText),
            gamePenalty:
              extractGamePenalty(
                relevantText
              ),
          });
        } catch (error) {
          results.push({
            ...item,
            text: '',
            relevantText: '',
            score:
              (item.titleScore || 0) - 100,
            articleFound: false,
            gamePenalty: [],
            error:
              String(
                error?.message ||
                error
              ),
          });
        }
      }
    )
  );

  /*
   * Если искали конкретную статью,
   * документы с найденной статьёй должны идти первыми.
   */
  results.sort(
    (a, b) => {
      if (
        a.articleFound &&
        !b.articleFound
      ) {
        return -1;
      }

      if (
        !a.articleFound &&
        b.articleFound
      ) {
        return 1;
      }

      return b.score - a.score;
    }
  );

  const chosen =
    results
      .filter(
        (item) => item.text
      )
      .slice(0, MAX_RESULTS);

  if (!chosen.length) {
    return {
      context: '',
      sources: [],
      meta: results.map(
        (item) => ({
          title: item.title,
          url: item.url,
          score: item.score,
          chars:
            item.text?.length || 0,
          error:
            item.error || null,
        })
      ),
      note:
        discovered.note ||
        'Официальные страницы найдены, но получить их содержимое не удалось.',
    };
  }

  /*
   * Для статьи передаём AI именно релевантный фрагмент,
   * а не всю страницу.
   */
  const context =
    chosen
      .map(
        (item, index) => {
          const text =
            item.relevantText ||
            item.text;

          return [
            `[ИСТОЧНИК ${index + 1}] ${item.title}`,
            `URL: ${item.url}`,
            `СЕРВЕР: ${normalizeServer(server)}`,
            `РАЗДЕЛ: ${
              mode === 'laws'
                ? 'Законодательная база'
                : 'Игровые правила'
            }`,
            '',
            text.slice(
              0,
              12000
            ),
          ].join('\n');
        }
      )
      .join(
        '\n\n============================\n\n'
      );

  return {
    context,
    sources:
      chosen.map(
        (item) =>
          item.url
      ),
    meta:
      results.map(
        (item) => ({
          title:
            item.title,
          url:
            item.url,
          score:
            item.score,
          chars:
            item.text?.length ||
            0,
          articleFound:
            Boolean(
              item.articleFound
            ),
          gamePenalty:
            item.gamePenalty ||
            [],
          error:
            item.error ||
            null,
        })
      ),
    note:
      discovered.note ||
      null,
  };
}

/*
 * ============================================================
 * RATE LIMIT
 * ============================================================
 */

function rateLimit(req) {
  const ip =
    req.headers.get(
      'CF-Connecting-IP'
    ) ||
    req.headers.get(
      'x-forwarded-for'
    ) ||
    'unknown';

  const now =
    Date.now();

  const hit =
    rateMap.get(ip);

  if (
    !hit ||
    now - hit.at > 60_000
  ) {
    rateMap.set(ip, {
      at: now,
      count: 1,
    });

    return true;
  }

  hit.count++;

  return hit.count <= 12;
}

/*
 * ============================================================
 * AI
 * ============================================================
 */

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
    body =
      await req.json();
  } catch {
    return json(
      {
        error:
          'Неверный JSON.',
      },
      400
    );
  }

  const project =
    normalizeProject(
      body.project ||
      'GTA5RP'
    );

  const server =
    String(
      body.server ||
      ''
    ).trim();

  const mode =
    body.mode === 'laws'
      ? 'laws'
      : 'rules';

  const question =
    String(
      body.question ||
      ''
    ).trim();

  if (!CATALOG[project]) {
    return json(
      {
        error:
          'Неизвестный проект.',
      },
      400
    );
  }

  if (!server) {
    return json(
      {
        error:
          'Не выбран сервер.',
      },
      400
    );
  }

  if (!question) {
    return json(
      {
        error:
          'Напиши вопрос.',
      },
      400
    );
  }

  if (
    question.length >
    MAX_QUESTION
  ) {
    return json(
      {
        error:
          `Вопрос слишком длинный. Максимум ${MAX_QUESTION} символов.`,
      },
      400
    );
  }

  try {
    const gathered =
      await gatherContext(
        project,
        server,
        mode,
        question
      );

    const {
      context,
      sources,
      meta,
      note,
    } = gathered;

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
     * Если ключ отсутствует, всё равно возвращаем
     * найденный официальный текст.
     */
    if (!env.LLM_API_KEY) {
      return json({
        answer:
          'LLM_API_KEY ещё не подключён.\n\n' +
          'Найденный официальный материал:\n\n' +
          context.slice(
            0,
            12000
          ),
        sources,
        meta,
      });
    }

    /*
     * ========================================================
     * SYSTEM PROMPT
     * ========================================================
     */

    const sectionName =
      mode === 'laws'
        ? 'Законодательная база'
        : 'Игровые правила';

    const system = [
      'Ты GTA 5 RP Legal Helper.',
      'Отвечай только на русском языке.',
      '',
      `Проект: ${project}.`,
      `Сервер: ${normalizeServer(server)}.`,
      `Раздел: ${sectionName}.`,
      '',
      'ТЫ НЕ ИМЕЕШЬ ПРАВА ПРИДУМЫВАТЬ НОРМЫ.',
      'Используй только предоставленный официальный контекст.',
      '',
      'ОСОБО ВАЖНО:',
      '1. Не выдумывай статьи.',
      '2. Не выдумывай пункты.',
      '3. Не выдумывай наказания.',
      '4. Не пересчитывай годы в минуты самостоятельно.',
      '5. Если на форуме рядом с наказанием есть ((минуты)), бери именно это значение.',
      '6. Если на форуме написано ((дни)), ((часы)) или другой игровой эквивалент — показывай именно его.',
      '7. Если игрового эквивалента в источнике нет — НЕ придумывай его.',
      '8. Не используй старую редакцию, если в контексте есть более новая редакция того же документа.',
      '9. Архивные документы не должны перебивать действующий документ.',
      '10. Если пользователь написал номер статьи, обязательно укажи номер статьи.',
      '11. Если вопрос задан бытовым языком, самостоятельно сопоставь его с найденной нормой.',
      '12. Если точного ответа в официальном контексте нет — честно скажи, что точного основания не найдено.',
      '',
      'ФОРМАТ ДЛЯ ЗАКОНОДАТЕЛЬНОЙ БАЗЫ:',
      '',
      '⚖️ Статья X.X — название',
      '',
      '📖 Суть:',
      'Кратко и понятно объясни, что запрещает/регулирует статья.',
      '',
      '🔒 Наказание:',
      'Укажи наказание так, как оно написано в источнике.',
      '',
      '🎮 Игровой срок:',
      'Покажи ((минуты/дни/часы)), только если они реально указаны в источнике.',
      '',
      '📚 Основание:',
      'Название кодекса/закона и статья.',
      '',
      'Если в статье несколько частей — разделяй их.',
      'Если есть альтернативные наказания — обязательно укажи их.',
      '',
      'ФОРМАТ ДЛЯ ИГРОВЫХ ПРАВИЛ:',
      '',
      '🎮 Термин/правило',
      '',
      '📖 Что означает:',
      'Краткое понятное объяснение.',
      '',
      '⚠️ Нарушение:',
      'Что именно запрещено.',
      '',
      '🔒 Наказание:',
      'Только наказание из официального источника.',
      '',
      '📚 Основание:',
      'Номер пункта и название правил, если они есть.',
      '',
      'Не пиши длинную воду.',
      'Сначала дай прямой ответ пользователю, затем основание.',
      '',
      'КОНТЕКСТ ОФИЦИАЛЬНОГО ФОРУМА:',
      context,
    ].join('\n');

    const base =
      (
        env.LLM_BASE ||
        'https://api.groq.com/openai/v1'
      ).replace(
        /\/$/,
        ''
      );

    const model =
      env.LLM_MODEL ||
      'openai/gpt-oss-120b';

    const llm =
      await fetch(
        `${base}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type':
              'application/json',
            authorization:
              `Bearer ${env.LLM_API_KEY}`,
          },
          body:
            JSON.stringify({
              model,
              temperature: 0.1,
              max_tokens: 1600,
              messages: [
                {
                  role: 'system',
                  content:
                    system,
                },
                {
                  role: 'user',
                  content:
                    question,
                },
              ],
            }),
        }
      );

    if (!llm.ok) {
      return json(
        {
          error:
            'Ошибка AI-сервера.',
          detail:
            (
              await llm.text()
            ).slice(
              0,
              700
            ),
        },
        502
      );
    }

    const data =
      await llm.json();

    const answer =
      data.choices?.[0]?.message?.content ||
      'AI не вернул ответ.';

    return json({
      answer,
      sources,
      meta,
    });
  } catch (error) {
    return json(
      {
        error:
          'Ошибка чтения официального форума.',
        detail:
          String(
            error?.message ||
            error
          ).slice(
            0,
            1000
          ),
      },
      502
    );
  }
}

/*
 * ============================================================
 * HTTP
 * ============================================================
 */

export default {
  async fetch(
    req,
    env
  ) {
    const url =
      new URL(req.url);

    if (
      req.method ===
      'OPTIONS'
    ) {
      return new Response(
        '',
        {
          status: 204,
          headers: cors,
        }
      );
    }

    /*
     * ========================================================
     * CATALOG
     * ========================================================
     */

    if (
      url.pathname ===
        '/api/catalog' &&
      req.method ===
        'GET'
    ) {
      return json({
        version:
          env.APP_VERSION ||
          APP_VERSION,
        projects:
          CATALOG,
      });
    }

    /*
     * ========================================================
     * HEALTH
     * ========================================================
     */

    if (
      url.pathname ===
        '/api/health' &&
      req.method ===
        'GET'
    ) {
      return json({
        service:
          'GTA5RP Legal Helper API',
        status:
          'ok',
        mode:
          'live-forum',
        database:
          'none',
        version:
          env.APP_VERSION ||
          APP_VERSION,
        llmConfigured:
          Boolean(
            env.LLM_API_KEY
          ),
        projects:
          Object.keys(
            CATALOG
          ),
        gta5rpServers:
          CATALOG.GTA5RP.servers,
      });
    }

    /*
     * ========================================================
     * VERSION
     * ========================================================
     */

    if (
      url.pathname ===
        '/api/version' &&
      req.method ===
        'GET'
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

    /*
     * ========================================================
     * ASK
     * ========================================================
     */

    if (
      url.pathname ===
        '/api/ask' &&
      req.method ===
        'POST'
    ) {
      return ask(
        req,
        env
      );
    }

    /*
     * ========================================================
     * ROOT
     * ========================================================
     */

    if (
      url.pathname === '/' &&
      req.method === 'GET'
    ) {
      return json({
        service:
          'GTA5RP Legal Helper API',
        status:
          'ok',
        mode:
          'live-forum',
      });
    }

    return json(
      {
        error:
          'not found',
      },
      404
    );
  },
};
