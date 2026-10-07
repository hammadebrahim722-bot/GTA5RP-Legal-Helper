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
// ОФИЦИАЛЬНЫЕ СТРАНИЦЫ GTA5RP
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
// ИЗВЕСТНЫЕ АКТУАЛЬНЫЕ ДОКУМЕНТЫ
// ============================================================

const GTA_DIRECT_DOCUMENTS = {
  Richman: [
    {
      title:
        "Уголовный кодекс штата Сан-Андреас — редакция от 08 сентября 2026 года",

      url:
        "https://forum.gta5rp.com/threads/ugolovnyi-kodeks-shtata-san-andreas-redaktsiya-ot-08-sentyabrya-2026-goda.3364593/",

      kind: "law"
    }
  ]
};


// ============================================================
// OOC-ТЕРМИНЫ
//
// Это НЕ IC-законодательство.
// Эти термины относятся к игровым / общим правилам.
// ============================================================

const OOC_TERMS = {
  db: [
    "db",
    "дб",
    "deathmatch",
    "дмг",
    "убийство транспортом"
  ],

  dm: [
    "dm",
    "дм",
    "deathmatch"
  ],

  mg: [
    "mg",
    "мг",
    "metagaming",
    "метагейминг"
  ],

  pg: [
    "pg",
    "пг",
    "powergaming",
    "пауэргейминг"
  ],

  rk: [
    "rk",
    "рк",
    "revenge kill"
  ],

  tk: [
    "tk",
    "тк",
    "team kill",
    "teamkill"
  ],

  sk: [
    "sk",
    "ск",
    "spawn kill",
    "spawnkill"
  ],

  "fear rp": [
    "fear rp",
    "fearrp",
    "фир рп",
    "фиррп"
  ],

  "non rp": [
    "non rp",
    "non-rp",
    "nonrp",
    "нон рп",
    "нон-рп"
  ],

  "nrp": [
    "nrp",
    "нрп"
  ]
};


// ============================================================
// НАСТРОЙКИ КОНТЕКСТА
// ============================================================

// Главное ограничение для Groq.
// Не отправляем огромные страницы форума.
const MAX_RESULTS = 2;

const MAX_CANDIDATES = 8;

const MAX_GENERAL_CONTEXT = 3000;

const MAX_TERM_CONTEXT = 2800;

const MAX_ARTICLE_CONTEXT = 4200;

const MAX_OUTPUT_TOKENS = 900;

const CACHE_TTL = 60 * 1000;


// ============================================================
// CACHE
// ============================================================

const cache = new Map();

function cacheGet(key) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  if (
    Date.now() - item.time >
    CACHE_TTL
  ) {
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
// НОРМАЛИЗАЦИЯ
// ============================================================

function normalizeServer(server) {
  let value = String(
    server || ""
  )
    .trim()
    .replace(/·\s*#\d+/gi, "")
    .replace(/\s+/g, " ");

  if (
    value.toLowerCase() ===
    "inscout"
  ) {
    return "Insquad";
  }

  if (
    value.toLowerCase() ===
    "richmond"
  ) {
    return "Richman";
  }

  return value;
}


function normalizeMode(mode) {
  const value =
    String(mode || "")
      .trim()
      .toLowerCase();

  if (
    value === "rules" ||
    value.includes("правил") ||
    value.includes("игров")
  ) {
    return "rules";
  }

  return "laws";
}


// ============================================================
// ОПРЕДЕЛЕНИЕ OOC-ТЕРМИНА
// ============================================================

function detectOocTerm(question) {
  const q =
    String(question || "")
      .toLowerCase()
      .replace(/[()[\],.!?:;"']/g, " ");

  // Сначала длинные варианты.
  const allTerms = [];

  for (const [key, variants] of Object.entries(
    OOC_TERMS
  )) {
    for (const variant of variants) {
      allTerms.push({
        key,
        variant
      });
    }
  }

  allTerms.sort(
    (a, b) =>
      b.variant.length -
      a.variant.length
  );

  for (const item of allTerms) {
    const escaped =
      item.variant.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const regex =
      new RegExp(
        `(^|[^a-zа-яё0-9])${escaped}([^a-zа-яё0-9]|$)`,
        "i"
      );

    if (regex.test(q)) {
      return item.key;
    }
  }

  return null;
}


// ============================================================
// ПОИСК КЛЮЧЕВЫХ СЛОВ OOC
// ============================================================

function getOocVariants(term) {
  return (
    OOC_TERMS[term] || [term]
  );
}


// ============================================================
// HTML
// ============================================================

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(
      /&#(\d+);/g,
      (_, n) => {
        try {
          return String.fromCodePoint(
            Number(n)
          );
        } catch {
          return "";
        }
      }
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) => {
        try {
          return String.fromCodePoint(
            parseInt(n, 16)
          );
        } catch {
          return "";
        }
      }
    );
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

  text =
    text.replace(
      /<script[\s\S]*?<\/script>/gi,
      " "
    );

  text =
    text.replace(
      /<style[\s\S]*?<\/style>/gi,
      " "
    );

  text =
    text.replace(
      /<noscript[\s\S]*?<\/noscript>/gi,
      " "
    );

  text =
    text.replace(
      /<svg[\s\S]*?<\/svg>/gi,
      " "
    );

  text =
    text.replace(
      /<(br|\/p|\/div|\/li|\/tr|\/h[1-6])[^>]*>/gi,
      "\n"
    );

  text =
    text.replace(
      /<[^>]+>/g,
      " "
    );

  return cleanText(text);
}


// ============================================================
// ССЫЛКИ
// ============================================================

function extractLinks(
  html,
  baseUrl
) {
  const result = [];

  const regex =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = regex.exec(html)) !==
    null
  ) {
    const href =
      decodeHtml(
        match[1]
      ).trim();

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
      url =
        new URL(
          href,
          baseUrl
        ).href;
    } catch {
      continue;
    }

    const title =
      cleanText(
        match[2]
      );

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
// FETCH
// ============================================================

async function fetchPage(url) {
  const cached =
    cacheGet(`page:${url}`);

  if (cached) {
    return cached;
  }

  try {
    const response =
      await fetch(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",

            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

            "Accept-Language":
              "ru-RU,ru;q=0.9,en;q=0.7"
          },

          cf: {
            cacheTtl: 30
          }
        }
      );

    if (!response.ok) {
      return null;
    }

    const html =
      await response.text();

    const result = {
      url,
      html,
      text:
        htmlToText(html)
    };

    cacheSet(
      `page:${url}`,
      result
    );

    return result;
  } catch {
    return null;
  }
}


// ============================================================
// СТАТЬИ
// ============================================================

function getArticleNumbers(
  question
) {
  const result =
    new Set();

  const text =
    String(question || "");

  const patterns = [
    /ст\.?\s*(\d+(?:\.\d+){0,3})/gi,

    /статья\s*(\d+(?:\.\d+){0,3})/gi,

    /статьи\s*(\d+(?:\.\d+){0,3})/gi
  ];

  for (const regex of patterns) {
    let match;

    while (
      (match =
        regex.exec(text)) !==
      null
    ) {
      result.add(
        match[1]
      );
    }
  }

  // Чистый запрос "17.1"
  const bare =
    text.match(
      /\b\d+\.\d+(?:\.\d+){0,2}\b/g
    );

  if (bare) {
    for (const item of bare) {
      result.add(item);
    }
  }

  return [
    ...result
  ];
}


// ============================================================
// КОНТЕКСТ СТАТЬИ
// ============================================================

function extractArticleContext(
  text,
  articleNumber
) {
  if (
    !text ||
    !articleNumber
  ) {
    return "";
  }

  const escaped =
    articleNumber.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const patterns = [
    new RegExp(
      `(?:статья|ст\\.)\\s*${escaped}\\b`,
      "i"
    ),

    new RegExp(
      `\\b${escaped}\\b`,
      "i"
    )
  ];

  let match = null;

  for (const regex of patterns) {
    match =
      regex.exec(text);

    if (match) {
      break;
    }
  }

  if (!match) {
    return "";
  }

  const start =
    Math.max(
      0,
      match.index - 500
    );

  return text.slice(
    start,
    start +
      MAX_ARTICLE_CONTEXT
  );
}


// ============================================================
// КОНТЕКСТ OOC-ТЕРМИНА
//
// Самая важная часть.
//
// Мы не берём первое случайное упоминание.
// Сначала ищем предложения/абзацы,
// где термин используется как определение.
// ============================================================

function extractOocContext(
  text,
  term
) {
  if (
    !text ||
    !term
  ) {
    return "";
  }

  const variants =
    getOocVariants(term);

  const lower =
    text.toLowerCase();

  const candidates = [];

  for (const variant of variants) {
    const v =
      variant.toLowerCase();

    let position = 0;

    while (position < lower.length) {
      const index =
        lower.indexOf(
          v,
          position
        );

      if (index < 0) {
        break;
      }

      const before =
        index === 0
          ? " "
          : lower[index - 1];

      const after =
        index + v.length >=
        lower.length
          ? " "
          : lower[
              index + v.length
            ];

      const validBefore =
        /[^a-zа-яё0-9]/i.test(
          before
        );

      const validAfter =
        /[^a-zа-яё0-9]/i.test(
          after
        );

      if (
        validBefore &&
        validAfter
      ) {
        candidates.push(
          index
        );
      }

      position =
        index +
        Math.max(
          1,
          v.length
        );
    }
  }

  if (
    candidates.length === 0
  ) {
    return "";
  }

  // ----------------------------------------------------------
  // Сначала пытаемся найти определение.
  // ----------------------------------------------------------

  const definitionWords = [
    "это",
    "является",
    "означает",
    "определяется",
    "расшифровывается",
    "представляет собой",
    "запрещено",
    "запрещается",
    "наказывается",
    "подразумевает",
    "считается"
  ];

  let best =
    null;

  let bestScore =
    -Infinity;

  for (const index of candidates) {
    const start =
      Math.max(
        0,
        index - 700
      );

    const end =
      Math.min(
        text.length,
        index +
          1900
      );

    const chunk =
      text.slice(
        start,
        end
      );

    const chunkLower =
      chunk.toLowerCase();

    let score = 0;

    // Сам термин.
    score += 20;

    // Определяющие слова.
    for (
      const word
      of definitionWords
    ) {
      if (
        chunkLower.includes(
          word
        )
      ) {
        score += 12;
      }
    }

    // Заголовок/пункт.
    if (
      /(^|\n)\s*(?:\d+\.)+\s+/i.test(
        chunk
      )
    ) {
      score += 8;
    }

    // Если рядом есть "DB —" / "DB:" / "DB (".
    const variant =
      variants[0];

    if (
      new RegExp(
        `\\b${variant.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\s*(?:[-–—:]|\\()`,
        "i"
      ).test(chunk)
    ) {
      score += 35;
    }

    // Слишком общий документный контекст
    // немного понижаем.
    if (
      chunkLower.includes(
        "структура cda"
      )
    ) {
      score -= 30;
    }

    if (
      chunkLower.includes(
        "структура"
      ) &&
      !chunkLower.includes(
        "означает"
      ) &&
      !chunkLower.includes(
        "запрещено"
      )
    ) {
      score -= 10;
    }

    if (
      score >
      bestScore
    ) {
      bestScore =
        score;

      best = chunk;
    }
  }

  if (!best) {
    return "";
  }

  return best.slice(
    0,
    MAX_TERM_CONTEXT
  );
}


// ============================================================
// ИГРОВОЕ НАКАЗАНИЕ
//
// Берём ТОЛЬКО готовое значение с форума.
// ============================================================

function extractGamePenalty(
  text
) {
  if (!text) {
    return "";
  }

  const regex =
    /\(\(\s*[^)]{0,150}?\d+(?:[.,]\d+)?\s*(?:мин|минут|минуты|минуту|час|часа|часов|день|дня|дней)\b[^)]{0,150}\)\)/gi;

  const matches =
    text.match(regex);

  if (!matches) {
    return "";
  }

  for (
    const match
    of matches
  ) {
    if (
      /\d+\s*(?:мин|минут|минуты|минуту|час|часа|часов|день|дня|дней)/i.test(
        match
      )
    ) {
      return match.trim();
    }
  }

  return "";
}


// ============================================================
// ОЦЕНКА ТЕКСТА
// ============================================================

function scoreText(
  text,
  question,
  articleNumbers,
  oocTerm
) {
  if (!text) {
    return 0;
  }

  const source =
    text.toLowerCase();

  const q =
    String(question || "")
      .toLowerCase();

  let score = 0;

  // ----------------------------------------------------------
  // Статья
  // ----------------------------------------------------------

  for (
    const article
    of articleNumbers
  ) {
    if (
      source.includes(
        `статья ${article}`
      )
    ) {
      score += 100;
    }

    if (
      source.includes(
        `ст. ${article}`
      )
    ) {
      score += 100;
    }

    if (
      source.includes(
        article
      )
    ) {
      score += 15;
    }
  }

  // ----------------------------------------------------------
  // OOC
  // ----------------------------------------------------------

  if (oocTerm) {
    const variants =
      getOocVariants(
        oocTerm
      );

    for (
      const variant
      of variants
    ) {
      if (
        source.includes(
          variant.toLowerCase()
        )
      ) {
        score += 40;
      }
    }

    const definitionWords = [
      "это",
      "означает",
      "запрещено",
      "запрещается",
      "считается",
      "наказывается"
    ];

    for (
      const word
      of definitionWords
    ) {
      if (
        source.includes(
          word
        )
      ) {
        score += 8;
      }
    }
  }

  // ----------------------------------------------------------
  // Общие слова вопроса
  // ----------------------------------------------------------

  const words =
    q
      .replace(
        /[^a-zа-яё0-9.]+/gi,
        " "
      )
      .split(/\s+/)
      .filter(
        x => x.length >= 4
      )
      .slice(
        0,
        10
      );

  for (
    const word
    of words
  ) {
    if (
      source.includes(
        word
      )
    ) {
      score += 2;
    }
  }

  return score;
}


// ============================================================
// ОЦЕНКА НАЗВАНИЯ ДОКУМЕНТА
// ============================================================

function documentTitleScore(
  title,
  mode,
  oocTerm
) {
  const value =
    String(title || "")
      .toLowerCase();

  let score = 0;

  // ----------------------------------------------------------
  // Законодательство
  // ----------------------------------------------------------

  if (
    mode === "laws"
  ) {
    const words = [
      "кодекс",
      "закон",
      "законодатель",
      "устав",
      "уголовн",
      "административ",
      "положение"
    ];

    for (
      const word
      of words
    ) {
      if (
        value.includes(
          word
        )
      ) {
        score += 20;
      }
    }
  }

  // ----------------------------------------------------------
  // Общие правила
  // ----------------------------------------------------------

  if (
    mode === "rules"
  ) {
    const words = [
      "правила",
      "игровые правила",
      "общие правила",
      "rules"
    ];

    for (
      const word
      of words
    ) {
      if (
        value.includes(
          word
        )
      ) {
        score += 20;
      }
    }

    // Для OOC терминов особенно важны
    // документы с правилами.
    if (oocTerm) {
      score += 20;
    }
  }

  // ----------------------------------------------------------
  // Архив / история изменений
  // ----------------------------------------------------------

  if (
    value.includes("архив") ||
    value.includes("изменени") ||
    value.includes("история")
  ) {
    score -= 40;
  }

  return score;
}


// ============================================================
// ПОИСК РАЗДЕЛА ЗАКОНОДАТЕЛЬСТВА
// ============================================================

function findLawSections(
  links
) {
  const result = [];

  for (
    const link
    of links
  ) {
    const title =
      link.title
        .toLowerCase()
        .replace(/\s+/g, " ");

    if (
      title.includes(
        "законодательная база"
      ) ||
      title ===
        "законодательство" ||
      title.includes(
        "законодательство"
      )
    ) {
      result.push(
        link
      );
    }
  }

  return result;
}


// ============================================================
// ПОИСК РАЗДЕЛОВ ПРАВИЛ
// ============================================================

function findRuleSections(
  links
) {
  const result = [];

  for (
    const link
    of links
  ) {
    const title =
      link.title
        .toLowerCase()
        .replace(/\s+/g, " ");

    // ВАЖНО:
    // ищем общие/игровые правила,
    // но не считаем любое слово "правила"
    // полноценным источником автоматически.

    if (
      title.includes(
        "общие правила"
      ) ||
      title.includes(
        "игровые правила"
      ) ||
      title ===
        "правила проекта" ||
      title.includes(
        "правила сервера"
      ) ||
      title.includes(
        "правила gta5rp"
      ) ||
      title.includes(
        "rules"
      )
    ) {
      result.push(
        link
      );
    }
  }

  return result;
}


// ============================================================
// ПОЛУЧЕНИЕ ТЕМ ИЗ РАЗДЕЛА
// ============================================================

async function collectCategoryThreads(
  categoryUrl
) {
  const result = [];

  const pages = [
    categoryUrl,
    `${categoryUrl}page-2`,
    `${categoryUrl}page-3`,
    `${categoryUrl}page-4`
  ];

  for (
    const pageUrl
    of pages
  ) {
    const page =
      await fetchPage(
        pageUrl
      );

    if (!page) {
      continue;
    }

    const links =
      extractLinks(
        page.html,
        pageUrl
      );

    for (
      const link
      of links
    ) {
      if (
        !link.url.includes(
          "/threads/"
        )
      ) {
        continue;
      }

      if (
        !result.some(
          x =>
            x.url ===
            link.url
        )
      ) {
        result.push(
          link
        );
      }
    }
  }

  return result.slice(
    0,
    30
  );
}


// ============================================================
// ОБЩИЕ ПРАВИЛА GTA5RP
//
// Здесь дополнительно используем форумный поиск через
// категории сервера, но не смешиваем их с законодательством.
// ============================================================

async function discoverGtaServer(
  server,
  mode,
  oocTerm
) {
  const normalized =
    normalizeServer(
      server
    );

  const serverUrl =
    GTA_SERVER_PAGES[
      normalized
    ];

  if (!serverUrl) {
    return [];
  }

  const result = [];

  const page =
    await fetchPage(
      serverUrl
    );

  if (!page) {
    return [];
  }

  const links =
    extractLinks(
      page.html,
      serverUrl
    );

  // ==========================================================
  // ЗАКОНОДАТЕЛЬСТВО
  // ==========================================================

  if (
    mode === "laws"
  ) {
    const sections =
      findLawSections(
        links
      );

    for (
      const section
      of sections.slice(
        0,
        2
      )
    ) {
      const threads =
        await collectCategoryThreads(
          section.url
        );

      result.push(
        ...threads.map(
          item => ({
            ...item,
            kind: "law"
          })
        )
      );
    }

    // Известный актуальный документ.
    const direct =
      GTA_DIRECT_DOCUMENTS[
        normalized
      ] || [];

    result.push(
      ...direct
    );
  }


  // ==========================================================
  // ИГРОВЫЕ / ОБЩИЕ ПРАВИЛА
  // ==========================================================

  if (
    mode === "rules"
  ) {
    const sections =
      findRuleSections(
        links
      );

    for (
      const section
      of sections.slice(
        0,
        3
      )
    ) {
      const threads =
        await collectCategoryThreads(
          section.url
        );

      result.push(
        ...threads.map(
          item => ({
            ...item,
            kind: "rule"
          })
        )
      );
    }

    // Если найден OOC термин,
    // дополнительно ищем темы,
    // в заголовке которых он встречается.
    if (oocTerm) {
      const variants =
        getOocVariants(
          oocTerm
        );

      for (
        const link
        of links
      ) {
        const title =
          link.title
            .toLowerCase();

        if (
          variants.some(
            variant =>
              title.includes(
                variant.toLowerCase()
              )
          )
        ) {
          result.push({
            ...link,
            kind:
              "rule-term"
          });
        }
      }
    }
  }

  // Удаляем дубли.
  const unique = [];

  for (
    const item
    of result
  ) {
    if (
      !unique.some(
        x =>
          x.url ===
          item.url
      )
    ) {
      unique.push(
        item
      );
    }
  }

  return unique;
}


// ============================================================
// ПОДГОТОВКА ИСТОЧНИКА
// ============================================================

async function prepareSource(
  source,
  question,
  mode,
  articleNumbers,
  oocTerm
) {
  const page =
    await fetchPage(
      source.url
    );

  if (!page) {
    return null;
  }

  let context = "";

  // ----------------------------------------------------------
  // Законодательство + номер статьи
  // ----------------------------------------------------------

  if (
    mode === "laws" &&
    articleNumbers.length > 0
  ) {
    for (
      const article
      of articleNumbers
    ) {
      const extracted =
        extractArticleContext(
          page.text,
          article
        );

      if (extracted) {
        context =
          extracted;

        break;
      }
    }
  }


  // ----------------------------------------------------------
  // Правила + OOC термин
  // ----------------------------------------------------------

  if (
    mode === "rules" &&
    oocTerm
  ) {
    context =
      extractOocContext(
        page.text,
        oocTerm
      );
  }


  // ----------------------------------------------------------
  // Если точный контекст не найден
  // ----------------------------------------------------------

  if (!context) {
    context =
      page.text.slice(
        0,
        MAX_GENERAL_CONTEXT
      );
  }


  const penalty =
    extractGamePenalty(
      context
    ) ||
    extractGamePenalty(
      page.text
    );


  let score =
    scoreText(
      context,
      question,
      articleNumbers,
      oocTerm
    );

  score +=
    documentTitleScore(
      source.title,
      mode,
      oocTerm
    );


  // ----------------------------------------------------------
  // Для прямого актуального документа
  // ----------------------------------------------------------

  if (
    source.kind ===
    "law-direct"
  ) {
    score += 80;
  }


  // ----------------------------------------------------------
  // Для найденного термина
  // ----------------------------------------------------------

  if (
    source.kind ===
    "rule-term"
  ) {
    score += 70;
  }


  return {
    ...source,

    context,

    penalty,

    score
  };
}


// ============================================================
// СБОР КОНТЕКСТА
// ============================================================

async function gatherContext({
  project,
  server,
  mode,
  question
}) {
  const normalizedMode =
    normalizeMode(
      mode
    );

  const normalizedServer =
    normalizeServer(
      server
    );

  const articleNumbers =
    getArticleNumbers(
      question
    );

  // ----------------------------------------------------------
  // Сначала определяем OOC термин.
  // ----------------------------------------------------------

  const oocTerm =
    detectOocTerm(
      question
    );


  // ----------------------------------------------------------
  // Если пользователь выбрал законодательство,
  // OOC-логика НЕ применяется.
  // ----------------------------------------------------------

  const effectiveOocTerm =
    normalizedMode ===
    "rules"
      ? oocTerm
      : null;


  // ----------------------------------------------------------
  // Пока подключён GTA5RP.
  // ----------------------------------------------------------

  if (
    String(project)
      .toLowerCase() !==
    "gta5rp"
  ) {
    return {
      sources: [],
      context: "",
      articleNumbers,
      oocTerm:
        effectiveOocTerm
    };
  }


  // ----------------------------------------------------------
  // Получаем только нужный тип источников.
  // ----------------------------------------------------------

  let sources =
    await discoverGtaServer(
      normalizedServer,
      normalizedMode,
      effectiveOocTerm
    );


  if (
    sources.length === 0
  ) {
    return {
      sources: [],
      context: "",
      articleNumbers,
      oocTerm:
        effectiveOocTerm
    };
  }


  // Не даём слишком большому количеству
  // страниц уйти в обработку.
  sources =
    sources.slice(
      0,
      MAX_CANDIDATES
    );


  // ----------------------------------------------------------
  // Загружаем источники.
  // ----------------------------------------------------------

  const prepared = [];

  for (
    const source
    of sources
  ) {
    const item =
      await prepareSource(
        source,
        question,
        normalizedMode,
        articleNumbers,
        effectiveOocTerm
      );

    if (item) {
      prepared.push(
        item
      );
    }
  }


  // Лучшие сначала.
  prepared.sort(
    (a, b) =>
      b.score -
      a.score
  );


  // Берём максимум 2.
  const selected =
    prepared.slice(
      0,
      MAX_RESULTS
    );


  // ----------------------------------------------------------
  // Формируем маленький контекст.
  // ----------------------------------------------------------

  const chunks = [];

  for (
    const item
    of selected
  ) {
    let chunk =
      item.context ||
      "";

    if (
      chunk.length >
      MAX_GENERAL_CONTEXT
    ) {
      chunk =
        chunk.slice(
          0,
          MAX_GENERAL_CONTEXT
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
    sources:
      selected,

    context:
      chunks.join(
        "\n\n---\n\n"
      ),

    articleNumbers,

    oocTerm:
      effectiveOocTerm
  };
}


// ============================================================
// SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(
  mode,
  oocTerm
) {
  // ==========================================================
  // ИГРОВЫЕ / OOC ПРАВИЛА
  // ==========================================================

  if (
    mode === "rules"
  ) {
    return `
Ты — справочный помощник GTA5RP по игровым и общим правилам.

Тебе передаётся текст, найденный на официальном форуме GTA5RP.

Работай ТОЛЬКО по этому тексту.

ВАЖНО:

1. DB, DM, MG, PG, RK, TK, SK, Fear RP, NonRP и подобные термины относятся к игровым/OOC правилам, а не к законодательной базе штата.
2. Если пользователь спрашивает значение такого термина, ищи именно его определение или описание в правилах.
3. Не используй случайное упоминание термина как его определение.
4. Не делай вывод "DB означает X" только потому, что DB встретился в другом контексте.
5. Не смешивай правила фракций, правила мероприятий и законодательство.
6. Не выдумывай правила.
7. Не выдумывай наказания.
8. Не выдумывай расшифровку термина.
9. Если в найденном официальном тексте определения недостаточно — честно скажи об этом.
10. Если указано игровое время в формате ((...)), копируй его точно.
11. Никогда не пересчитывай годы, дни или часы в минуты самостоятельно.
12. Отвечай по-русски.

Если вопрос про термин:
- Название термина.
- Что означает по официальным правилам.
- Что считается нарушением.
- Наказание, если оно указано.
- Источник.

Если вопрос не про термин:
- отвечай только по найденному официальному тексту.

Не используй собственные знания GTA5RP, если их нет в источнике.
`;
  }


  // ==========================================================
  // ЗАКОНОДАТЕЛЬСТВО
  // ==========================================================

  return `
Ты — справочный помощник по законодательной базе GTA5RP.

Тебе передаётся текст, найденный на официальном форуме GTA5RP.

Работай ТОЛЬКО по этому тексту.

ВАЖНО:

1. Законодательная база — это IC-законы и официальные нормативные документы штата.
2. Не используй DB, DM, MG, PG и другие OOC-термины как замену законодательным статьям.
3. Не выдумывай статьи.
4. Не выдумывай номера статей.
5. Не выдумывай наказания.
6. Не выдумывай игровые сроки.
7. Если в источнике есть ((80–120 минут)), ((5 дней)) или другое значение в двойных скобках — копируй его ТОЧНО.
8. Никогда самостоятельно не пересчитывай годы, дни или часы в минуты.
9. Если игрового эквивалента в источнике нет — не придумывай его.
10. Если вопрос касается конкретной статьи, отвечай именно по этой статье.
11. Если вопрос описывает ситуацию, выбирай норму только если она подтверждается переданным текстом.
12. Если данных недостаточно — честно скажи об этом.
13. Отвечай по-русски.

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
// GROQ
// ============================================================

async function askGroq(
  env,
  {
    project,
    server,
    mode,
    question,
    context,
    oocTerm
  }
) {
  if (
    !env.LLM_API_KEY
  ) {
    throw new Error(
      "LLM_API_KEY не настроен"
    );
  }

  const system =
    buildSystemPrompt(
      mode,
      oocTerm
    );


  const userMessage = `
Проект: ${project}

Сервер: ${server}

Режим: ${
    mode === "rules"
      ? "Игровые / общие правила"
      : "Законодательная база"
  }

${
  oocTerm
    ? `Определённый OOC-термин: ${oocTerm}`
    : ""
}

Вопрос пользователя:
${question}

Официальный контекст:
${context}
`;


  const response =
    await fetch(
      `${
        env.LLM_BASE ||
        "https://api.groq.com/openai/v1"
      }/chat/completions`,
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
              role:
                "system",

              content:
                system
            },

            {
              role:
                "user",

              content:
                userMessage
            }
          ],

          temperature:
            0.1,

          max_tokens:
            MAX_OUTPUT_TOKENS
        })
      }
    );


  const raw =
    await response.text();


  if (
    !response.ok
  ) {
    throw new Error(
      `Groq ${response.status}: ${raw}`
    );
  }


  let data;

  try {
    data =
      JSON.parse(raw);
  } catch {
    throw new Error(
      "Groq вернул некорректный JSON"
    );
  }


  const answer =
    data?.choices?.[0]?.message
      ?.content;


  if (!answer) {
    throw new Error(
      "Groq не вернул ответ"
    );
  }


  return answer.trim();
}


// ============================================================
// JSON RESPONSE
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


// ============================================================
// ASK
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
      body.server ||
      ""
    );


  const mode =
    normalizeMode(
      body.mode
    );


  const question =
    String(
      body.question ||
      ""
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


    if (
      !gathered.context
    ) {
      return jsonResponse({
        ok: true,

        answer:
          "Не удалось найти подходящий официальный источник для выбранного режима и сервера.",

        sources: [],

        server,

        mode,

        ooc_term:
          gathered.oocTerm ||
          null
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
            gathered.context,

          oocTerm:
            gathered.oocTerm
        }
      );


    return jsonResponse({
      ok: true,

      answer,

      server,

      mode,

      ooc_term:
        gathered.oocTerm ||
        null,

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
// WORKER
// ============================================================

export default {
  async fetch(
    request,
    env
  ) {
    // --------------------------------------------------------
    // CORS
    // --------------------------------------------------------

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
    // /
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
    // /api/catalog
    // --------------------------------------------------------

    if (
      url.pathname ===
        "/api/catalog" &&
      request.method === "GET"
    ) {
      return jsonResponse({
        ok: true,

        catalog:
          CATALOG
      });
    }


    // --------------------------------------------------------
    // /api/health
    // --------------------------------------------------------

    if (
      url.pathname ===
        "/api/health" &&
      request.method === "GET"
    ) {
      return jsonResponse({
        ok: true,

        status:
          "healthy",

        version:
          env.APP_VERSION ||
          "3.4.0"
      });
    }


    // --------------------------------------------------------
    // /api/version
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
    // /api/ask
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
