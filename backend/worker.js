const CATALOG = {
  "GTA5RP": {
    servers: [
      "Downtown",
      "Strawberry",
      "Blackberry",
      "Inscout",
      "Sunrise",
      "Richman",
      "Eclipse",
      "Rockford",
      "Redwood",
      "Murrieta",
      "La Puerta",
      "Chiliad",
      "Mirror"
    ]
  },

  "Majestic RP": {
    servers: [
      "Aurora",
      "Atlantis",
      "Olympus",
      "Valhalla"
    ]
  },

  "Russia Online": {
    servers: [
      "Основной"
    ]
  }
};


// ============================================================
// GTA5RP — официальные разделы серверов
// ============================================================

const GTA_SERVER_PAGES = {
  Downtown:
    "https://forum.gta5rp.com/forums/server-downtown.14/",

  Strawberry:
    "https://forum.gta5rp.com/forums/server-strawberry.89/",

  Blackberry:
    "https://forum.gta5rp.com/forums/server-blackberry.223/",

  Insquad:
    "https://forum.gta5rp.com/forums/server-insquad.296/",

  Sunrise:
    "https://forum.gta5rp.com/forums/server-sunrise.364/",

  Richman:
    "https://forum.gta5rp.com/forums/server-richman.487/",

  Eclipse:
    "https://forum.gta5rp.com/forums/server-eclipse.556/",

  Rockford:
    "https://forum.gta5rp.com/forums/server-rockford.883/",

  Redwood:
    "https://forum.gta5rp.com/forums/server-redwood.1421/",

  Murrieta:
    "https://forum.gta5rp.com/forums/server-murrieta.1689/",

  "La Puerta":
    "https://forum.gta5rp.com/forums/server-la-puerta.1949/",

  Chiliad:
    "https://forum.gta5rp.com/forums/server-chiliad.2094/",

  Mirror:
    "https://forum.gta5rp.com/forums/server-mirror.2163/"
};


// ============================================================
// Точные документы, которые нужно использовать напрямую,
// если они известны.
// ============================================================

const GTA_DIRECT_DOCUMENTS = {
  Richman: [
    {
      title:
        "Уголовный кодекс штата Сан-Андреас — редакция от 08 сентября 2026 года",

      url:
        "https://forum.gta5rp.com/threads/ugolovnyi-kodeks-shtata-san-andreas-redaktsiya-ot-08-sentyabrya-2026-goda.3364593/"
    }
  ]
};


// ============================================================
// Настройки
// ============================================================

// ВАЖНО:
// Groq сейчас имеет ограничение около 8000 TPM.
// Поэтому намеренно держим контекст маленьким.
const MAX_RESULTS = 3;

const MAX_SOURCE_CHARS = 4500;

const MAX_RULE_CONTEXT_CHARS = 2600;

const MAX_ARTICLE_CONTEXT_CHARS = 4000;

const MAX_CANDIDATES = 6;

const MAX_OUTPUT_TOKENS = 1000;

const CACHE_TTL = 60 * 1000;


// ============================================================
// Простое кэширование
// ============================================================

const cache = new Map();

function cacheGet(key) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  if (Date.now() - item.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return item.value;
}

function cacheSet(key, value) {
  cache.set(key, {
    time: Date.now(),
    value
  });

  return value;
}


// ============================================================
// Нормализация
// ============================================================

function normalizeServer(server) {
  if (!server) {
    return "";
  }

  let value = String(server)
    .trim()
    .replace(/·\s*#\d+/gi, "")
    .replace(/\s+/g, " ");

  if (value.toLowerCase() === "inscout") {
    return "Insquad";
  }

  if (value.toLowerCase() === "richmond") {
    return "Richman";
  }

  return value;
}


function normalizeMode(mode) {
  const value = String(mode || "")
    .trim()
    .toLowerCase();

  if (
    value.includes("правил") ||
    value.includes("rule") ||
    value === "rules"
  ) {
    return "rules";
  }

  return "laws";
}


// ============================================================
// HTML → текст
// ============================================================

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try {
        return String.fromCodePoint(parseInt(n, 16));
      } catch {
        return "";
      }
    });
}


function cleanText(value) {
  return decodeHtml(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function htmlToText(html) {
  if (!html) {
    return "";
  }

  let text = String(html);

  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  text = text.replace(
    /<(br|\/p|\/div|\/li|\/tr|\/h[1-6])[^>]*>/gi,
    "\n"
  );

  text = text.replace(/<[^>]+>/g, " ");

  return cleanText(text);
}


// ============================================================
// Ссылки
// ============================================================

function extractLinks(html, baseUrl) {
  const result = [];

  const regex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = decodeHtml(match[1]).trim();

    if (!href) {
      continue;
    }

    if (
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:")
    ) {
      continue;
    }

    let url;

    try {
      url = new URL(href, baseUrl).href;
    } catch {
      continue;
    }

    const title = cleanText(match[2]);

    if (!title) {
      continue;
    }

    result.push({
      title,
      url
    });
  }

  return result;
}


// ============================================================
// Fetch официального форума
// ============================================================

async function fetchPage(url) {
  const cached = cacheGet(`page:${url}`);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7"
      },
      cf: {
        cacheTtl: 30
      }
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    const result = {
      url,
      html,
      text: htmlToText(html)
    };

    cacheSet(`page:${url}`, result);

    return result;
  } catch {
    return null;
  }
}


// ============================================================
// Номера статей
// ============================================================

function getArticleNumbers(question) {
  const result = new Set();

  const text = String(question || "");

  const patterns = [
    /ст\.?\s*(\d+(?:\.\d+){0,3})/gi,
    /статья\s*(\d+(?:\.\d+){0,3})/gi,
    /статьи\s*(\d+(?:\.\d+){0,3})/gi,
    /артикул[а-я]*\s*(\d+(?:\.\d+){0,3})/gi
  ];

  for (const regex of patterns) {
    let match;

    while ((match = regex.exec(text)) !== null) {
      result.add(match[1]);
    }
  }

  // Если пользователь просто пишет "17.1"
  const bare = text.match(/\b\d+\.\d+(?:\.\d+){0,2}\b/g);

  if (bare) {
    for (const item of bare) {
      result.add(item);
    }
  }

  return [...result];
}


// ============================================================
// Извлечение статьи
// ============================================================

function extractArticleContext(text, articleNumber) {
  if (!text || !articleNumber) {
    return "";
  }

  const escaped = articleNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(
    `(?:статья|ст\\.)\\s*${escaped}\\b`,
    "i"
  );

  const match = regex.exec(text);

  if (!match) {
    return "";
  }

  const start = Math.max(0, match.index - 300);

  return text.slice(
    start,
    start + MAX_ARTICLE_CONTEXT_CHARS
  );
}


// ============================================================
// Извлечение игрового наказания.
//
// НИКОГДА НЕ ПЕРЕСЧИТЫВАЕМ.
// Берём только то, что реально написано на форуме.
// ============================================================

function extractGamePenalty(text) {
  if (!text) {
    return "";
  }

  const patterns = [
    /\(\(\s*[^)]{0,120}?\d+(?:[.,]\d+)?\s*(?:мин|минут|минуты|минуту|час|часа|часов|день|дня|дней)\b[^)]{0,120}\)\)/gi,
    /\(\(\s*[^)]{0,120}\)\)/gi
  ];

  for (const regex of patterns) {
    const matches = text.match(regex);

    if (!matches) {
      continue;
    }

    for (const match of matches) {
      if (
        /\d+\s*(?:мин|минут|минуты|минуту|час|часа|часов|день|дня|дней)/i.test(
          match
        )
      ) {
        return match.trim();
      }
    }
  }

  return "";
}


// ============================================================
// Поиск правил DB / DM / MG / PG и т.п.
// ============================================================

function extractRuleContext(text, question) {
  if (!text) {
    return "";
  }

  const q = String(question || "").toLowerCase();

  const abbreviations = [
    "db",
    "dm",
    "mg",
    "pg",
    "rk",
    "tk",
    "ck",
    "bh",
    "fear rp",
    "non rp",
    "nvvp",
    "rp"
  ];

  let selected = [];

  for (const abbreviation of abbreviations) {
    if (
      new RegExp(
        `(^|[^a-zа-яё])${abbreviation.replace(" ", "\\s+")}([^a-zа-яё]|$)`,
        "i"
      ).test(q)
    ) {
      selected.push(abbreviation);
    }
  }

  // Для DB, DM, MG и т.п. ищем именно соответствующее место
  if (selected.length > 0) {
    for (const abbreviation of selected) {
      const regex = new RegExp(
        `(^|[^a-zа-яё])${abbreviation.replace(" ", "\\s+")}(?=[^a-zа-яё]|$)`,
        "i"
      );

      const match = regex.exec(text);

      if (match) {
        const start = Math.max(
          0,
          match.index - 500
        );

        return text.slice(
          start,
          start + MAX_RULE_CONTEXT_CHARS
        );
      }
    }
  }

  // Если пользователь задаёт обычный вопрос,
  // ищем совпадения по словам вопроса.
  const words = q
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .split(/\s+/)
    .filter(word => word.length >= 4)
    .slice(0, 8);

  let bestIndex = -1;
  let bestScore = 0;

  for (const word of words) {
    const index = text.toLowerCase().indexOf(word);

    if (index >= 0) {
      if (word.length > bestScore) {
        bestScore = word.length;
        bestIndex = index;
      }
    }
  }

  if (bestIndex >= 0) {
    const start = Math.max(
      0,
      bestIndex - 700
    );

    return text.slice(
      start,
      start + MAX_RULE_CONTEXT_CHARS
    );
  }

  return text.slice(0, MAX_RULE_CONTEXT_CHARS);
}


// ============================================================
// Скоринг источника
// ============================================================

function scoreText(text, question, articleNumbers = []) {
  if (!text) {
    return 0;
  }

  const source = text.toLowerCase();
  const q = String(question || "").toLowerCase();

  let score = 0;

  const words = q
    .replace(/[^a-zа-яё0-9.]+/gi, " ")
    .split(/\s+/)
    .filter(x => x.length >= 3)
    .slice(0, 15);

  for (const word of words) {
    if (source.includes(word)) {
      score += 2;
    }
  }

  for (const article of articleNumbers) {
    if (
      source.includes(`статья ${article}`) ||
      source.includes(`ст. ${article}`) ||
      source.includes(`ст ${article}`)
    ) {
      score += 30;
    }

    if (source.includes(article)) {
      score += 10;
    }
  }

  const abbreviations = [
    "db",
    "dm",
    "mg",
    "pg",
    "rk",
    "tk"
  ];

  for (const item of abbreviations) {
    if (
      new RegExp(
        `(^|[^a-zа-яё])${item}([^a-zа-яё]|$)`,
        "i"
      ).test(q)
    ) {
      if (
        new RegExp(
          `(^|[^a-zа-яё])${item}([^a-zа-яё]|$)`,
          "i"
        ).test(source)
      ) {
        score += 25;
      }
    }
  }

  return score;
}


// ============================================================
// Оценка названия документа
// ============================================================

function documentTitleScore(title, question, mode) {
  const value = String(title || "").toLowerCase();

  let score = 0;

  if (mode === "laws") {
    const legalWords = [
      "кодекс",
      "закон",
      "законодатель",
      "устав",
      "положение",
      "уголовн",
      "административ"
    ];

    for (const word of legalWords) {
      if (value.includes(word)) {
        score += 15;
      }
    }
  }

  if (mode === "rules") {
    const ruleWords = [
      "правил",
      "общие правила",
      "игровые правила",
      "правила проекта",
      "rules"
    ];

    for (const word of ruleWords) {
      if (value.includes(word)) {
        score += 15;
      }
    }
  }

  // Архивы не должны побеждать актуальные документы.
  if (
    value.includes("архив") ||
    value.includes("изменени") ||
    value.includes("стар")
  ) {
    score -= 25;
  }

  // Более свежие редакции обычно важнее старых.
  const dates = value.match(
    /\b(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/
  );

  if (dates) {
    score += Number(dates[1]) - 2020;
  }

  return score;
}


// ============================================================
// Поиск раздела законодательной базы
// ============================================================

function findLawSection(links) {
  const preferred = [];

  for (const link of links) {
    const title = link.title.toLowerCase();

    if (
      title.includes("законодательная база") ||
      title === "законодательство" ||
      title.includes("законодательство")
    ) {
      preferred.push(link);
    }
  }

  return preferred;
}


// ============================================================
// Поиск разделов правил
// ============================================================

function findRulesSections(links) {
  const result = [];

  for (const link of links) {
    const title = link.title.toLowerCase();

    if (
      title.includes("правил") ||
      title.includes("игровые правила") ||
      title.includes("общие правила") ||
      title.includes("rules")
    ) {
      result.push(link);
    }
  }

  return result;
}


// ============================================================
// Получение тем из категории
// ============================================================

async function collectCategoryThreads(categoryUrl) {
  const result = [];

  const pages = [
    categoryUrl,
    `${categoryUrl}page-2`,
    `${categoryUrl}page-3`,
    `${categoryUrl}page-4`
  ];

  for (const pageUrl of pages) {
    const page = await fetchPage(pageUrl);

    if (!page) {
      continue;
    }

    const links = extractLinks(
      page.html,
      pageUrl
    );

    for (const link of links) {
      if (!link.url.includes("/threads/")) {
        continue;
      }

      if (
        !result.some(
          x => x.url === link.url
        )
      ) {
        result.push(link);
      }
    }
  }

  return result.slice(0, 20);
}


// ============================================================
// Определяем источники конкретного GTA5RP сервера
// ============================================================

async function discoverGtaServer(
  server,
  mode
) {
  const normalized = normalizeServer(server);

  const serverUrl =
    GTA_SERVER_PAGES[normalized];

  if (!serverUrl) {
    return [];
  }

  const result = [];

  // ----------------------------------------------------------
  // Законодательная база
  // ----------------------------------------------------------

  if (mode === "laws") {
    const page = await fetchPage(serverUrl);

    if (page) {
      const links = extractLinks(
        page.html,
        serverUrl
      );

      const lawSections =
        findLawSection(links);

      for (const section of lawSections.slice(0, 2)) {
        const threads =
          await collectCategoryThreads(
            section.url
          );

        result.push(
          ...threads.map(item => ({
            ...item,
            kind: "law"
          }))
        );
      }
    }

    // Добавляем известный актуальный прямой документ.
    const direct =
      GTA_DIRECT_DOCUMENTS[normalized] || [];

    result.push(
      ...direct.map(item => ({
        ...item,
        kind: "law-direct"
      }))
    );
  }

  // ----------------------------------------------------------
  // Игровые правила
  // ----------------------------------------------------------

  if (mode === "rules") {
    const page = await fetchPage(serverUrl);

    if (page) {
      const links = extractLinks(
        page.html,
        serverUrl
      );

      const ruleSections =
        findRulesSections(links);

      for (const section of ruleSections.slice(0, 2)) {
        const threads =
          await collectCategoryThreads(
            section.url
          );

        result.push(
          ...threads.map(item => ({
            ...item,
            kind: "rule"
          }))
        );
      }
    }

    // Глобальные правила GTA5RP.
    result.push({
      title: "Общие правила GTA5RP",
      url: "https://forum.gta5rp.com/forums/",
      kind: "global-rules"
    });
  }

  // Удаляем дубли.
  const unique = [];

  for (const item of result) {
    if (
      !unique.some(
        x => x.url === item.url
      )
    ) {
      unique.push(item);
    }
  }

  return unique;
}


// ============================================================
// Подготовка одного источника
// ============================================================

async function prepareSource(
  source,
  question,
  mode,
  articleNumbers
) {
  const page = await fetchPage(
    source.url
  );

  if (!page) {
    return null;
  }

  let context = "";

  // Для законодательства стараемся найти
  // именно нужную статью.
  if (
    mode === "laws" &&
    articleNumbers.length > 0
  ) {
    for (const article of articleNumbers) {
      const extracted =
        extractArticleContext(
          page.text,
          article
        );

      if (extracted) {
        context = extracted;
        break;
      }
    }
  }

  // Для правил DB/DM/MG/PG и обычных вопросов
  // берём только небольшой релевантный кусок.
  if (!context && mode === "rules") {
    context = extractRuleContext(
      page.text,
      question
    );
  }

  // Для закона без номера статьи.
  if (!context) {
    context = page.text.slice(
      0,
      MAX_SOURCE_CHARS
    );
  }

  const penalty =
    extractGamePenalty(context) ||
    extractGamePenalty(page.text);

  const score =
    scoreText(
      context,
      question,
      articleNumbers
    ) +
    documentTitleScore(
      source.title,
      question,
      mode
    );

  return {
    ...source,
    context,
    penalty,
    score
  };
}


// ============================================================
// Сбор контекста
// ============================================================

async function gatherContext({
  project,
  server,
  mode,
  question
}) {
  const normalizedMode =
    normalizeMode(mode);

  const normalizedServer =
    normalizeServer(server);

  const articleNumbers =
    getArticleNumbers(question);

  let sources = [];

  if (
    project.toLowerCase() === "gta5rp"
  ) {
    sources =
      await discoverGtaServer(
        normalizedServer,
        normalizedMode
      );
  }

  // Пока другие проекты не имеют подключённых
  // официальных баз. Не выдумываем источники.
  if (sources.length === 0) {
    return {
      sources: [],
      context: "",
      articleNumbers
    };
  }

  // Не даём сотням страниц попасть в Groq.
  sources = sources.slice(
    0,
    MAX_CANDIDATES
  );

  const prepared = [];

  for (const source of sources) {
    const item =
      await prepareSource(
        source,
        question,
        normalizedMode,
        articleNumbers
      );

    if (item) {
      prepared.push(item);
    }
  }

  prepared.sort(
    (a, b) => b.score - a.score
  );

  const selected =
    prepared.slice(
      0,
      MAX_RESULTS
    );

  // Контекст ещё раз ограничиваем.
  const chunks = [];

  for (const item of selected) {
    let chunk =
      item.context || "";

    if (chunk.length > MAX_SOURCE_CHARS) {
      chunk =
        chunk.slice(
          0,
          MAX_SOURCE_CHARS
        );
    }

    chunks.push(
      [
        `ИСТОЧНИК: ${item.title}`,
        `URL: ${item.url}`,
        `ТЕКСТ:`,
        chunk
      ].join("\n")
    );
  }

  return {
    sources: selected,
    context: chunks.join(
      "\n\n---\n\n"
    ),
    articleNumbers
  };
}


// ============================================================
// Системный промпт
// ============================================================

function buildSystemPrompt(
  mode
) {
  if (mode === "rules") {
    return `
Ты — справочный помощник GTA5RP.

Работай ТОЛЬКО по переданным официальным источникам.

Главные правила:
1. Не выдумывай правила.
2. Не выдумывай наказания.
3. Не выдумывай номера пунктов.
4. Не используй свои знания вместо источника.
5. Если в источнике есть игровое время в двойных скобках, например ((80–120 минут)), копируй его ТОЧНО.
6. Никогда самостоятельно не пересчитывай годы, дни или другие сроки в минуты.
7. Если игрового времени в источнике нет — так и скажи.
8. Если источник не позволяет уверенно ответить — скажи, что в найденном официальном источнике этого недостаточно.
9. Отвечай по-русски.
10. Не придумывай информацию ради красивого ответа.

Для вопросов DB, DM, MG, PG и других терминов:
- сначала найди соответствующий термин в переданном тексте;
- объясни его по источнику;
- не добавляй отсутствующие требования.

Формат:
- Термин / правило
- Что означает
- Что запрещено / разрешено
- Наказание, если оно есть в источнике
- Источник
`;
  }

  return `
Ты — справочный помощник по законодательной базе GTA5RP.

Работай ТОЛЬКО по переданным официальным источникам.

Главные правила:
1. Не выдумывай статьи.
2. Не выдумывай наказания.
3. Не выдумывай срок наказания.
4. Не используй старую редакцию, если передан актуальный документ.
5. Если в источнике есть игровое время в двойных скобках, например ((80–120 минут)), копируй его ТОЧНО.
6. Никогда не пересчитывай годы/дни в минуты самостоятельно.
7. Если игрового эквивалента нет — не придумывай его.
8. Если по вопросу невозможно уверенно определить статью — так и скажи.
9. Отвечай по-русски.
10. Источник важнее твоих общих знаний.

Для вопроса с номером статьи:
- найди именно эту статью;
- покажи номер и название;
- кратко объясни содержание;
- укажи наказание точно по источнику;
- укажи игровой эквивалент только если он есть.

Для ситуационного вопроса:
- определи подходящую норму только на основании переданного текста;
- не придумывай статью, если её нет в источнике.

Формат:
Статья X.X. Название

Кратко:
...

Наказание:
...

Игровой эквивалент:
...

Основание:
...
`;
}


// ============================================================
// Запрос к Groq
// ============================================================

async function askGroq(
  env,
  {
    project,
    server,
    mode,
    question,
    context
  }
) {
  if (!env.LLM_API_KEY) {
    throw new Error(
      "LLM_API_KEY не настроен"
    );
  }

  const system =
    buildSystemPrompt(mode);

  const userMessage = `
Проект: ${project}
Сервер: ${server}
Режим: ${
    mode === "rules"
      ? "Игровые правила"
      : "Законодательная база"
  }

Вопрос пользователя:
${question}

Официальный найденный контекст:
${context}
`;

  const response = await fetch(
    `${env.LLM_BASE}/chat/completions`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
        "Authorization":
          `Bearer ${env.LLM_API_KEY}`
      },

      body: JSON.stringify({
        model:
          env.LLM_MODEL ||
          "openai/gpt-oss-120b",

        messages: [
          {
            role: "system",
            content: system
          },
          {
            role: "user",
            content: userMessage
          }
        ],

        temperature: 0.1,

        max_tokens:
          MAX_OUTPUT_TOKENS
      })
    }
  );

  const raw =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Groq ${response.status}: ${raw}`
    );
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      "Groq вернул некорректный JSON"
    );
  }

  const answer =
    data?.choices?.[0]?.message?.content;

  if (!answer) {
    throw new Error(
      "Groq не вернул ответ"
    );
  }

  return answer.trim();
}


// ============================================================
// HTTP helpers
// ============================================================

function jsonResponse(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Access-Control-Allow-Origin":
          "*",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization",
        "Access-Control-Allow-Methods":
          "GET, POST, OPTIONS"
      }
    }
  );
}


function corsResponse(
  response
) {
  const headers =
    new Headers(
      response.headers
    );

  headers.set(
    "Access-Control-Allow-Origin",
    "*"
  );

  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  return new Response(
    response.body,
    {
      status: response.status,
      headers
    }
  );
}


// ============================================================
// API
// ============================================================

async function handleAsk(
  request,
  env
) {
  let body;

  try {
    body =
      await request.json();
  } catch {
    return jsonResponse(
      {
        ok: false,
        error:
          "Некорректный JSON"
      },
      400
    );
  }

  const project =
    String(
      body.project ||
      "GTA5RP"
    ).trim();

  const server =
    normalizeServer(
      body.server || ""
    );

  const mode =
    normalizeMode(
      body.mode
    );

  const question =
    String(
      body.question || ""
    ).trim();

  if (!server) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Не выбран сервер"
      },
      400
    );
  }

  if (!question) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Введите вопрос"
      },
      400
    );
  }

  try {
    const gathered =
      await gatherContext({
        project,
        server,
        mode,
        question
      });

    if (!gathered.context) {
      return jsonResponse({
        ok: true,

        answer:
          "Не удалось найти подходящий официальный источник на форуме для выбранного сервера.",

        sources: [],

        server,
        mode
      });
    }

    const answer =
      await askGroq(
        env,
        {
          project,
          server,
          mode,
          question,
          context:
            gathered.context
        }
      );

    return jsonResponse({
      ok: true,

      answer,

      server,

      mode,

      sources:
        gathered.sources.map(
          source => ({
            title:
              source.title,
            url:
              source.url
          })
        )
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      },
      500
    );
  }
}


// ============================================================
// Worker
// ============================================================

export default {
  async fetch(
    request,
    env
  ) {
    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin":
              "*",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization",
            "Access-Control-Allow-Methods":
              "GET, POST, OPTIONS"
          }
        }
      );
    }

    const url =
      new URL(
        request.url
      );

    // --------------------------------------------------------
    // Главная
    // --------------------------------------------------------

    if (
      url.pathname === "/" &&
      request.method === "GET"
    ) {
      return jsonResponse({
        ok: true,

        name:
          "GTA5RP Legal Helper API",

        version:
          env.APP_VERSION ||
          "3.4.0",

        status:
          "online"
      });
    }


    // --------------------------------------------------------
    // Каталог
    // --------------------------------------------------------

    if (
      url.pathname ===
        "/api/catalog" &&
      request.method === "GET"
    ) {
      return jsonResponse({
        ok: true,
        catalog: CATALOG
      });
    }


    // --------------------------------------------------------
    // Health
    // --------------------------------------------------------

    if (
      url.pathname ===
        "/api/health" &&
      request.method === "GET"
    ) {
      return jsonResponse({
        ok: true,
        status: "healthy",
        version:
          env.APP_VERSION ||
          "3.4.0"
      });
    }


    // --------------------------------------------------------
    // Версия
    // --------------------------------------------------------

    if (
      url.pathname ===
        "/api/version" &&
      request.method === "GET"
    ) {
      return jsonResponse({
        ok: true,

        version:
          env.APP_VERSION ||
          "3.4.0",

        download_url:
          env.DOWNLOAD_URL ||
          ""
      });
    }


    // --------------------------------------------------------
    // Ask
    // --------------------------------------------------------

    if (
      url.pathname ===
        "/api/ask" &&
      request.method === "POST"
    ) {
      return handleAsk(
        request,
        env
      );
    }


    // --------------------------------------------------------
    // 404
    // --------------------------------------------------------

    return jsonResponse(
      {
        ok: false,
        error:
          "Endpoint not found"
      },
      404
    );
  }
};
