// XPath-константы
const ARTICLES_XPATH = "/html/body/div[3]/div/div[1]/div[3]/ul/li/h2/a";
const NEXT_PAGE_XPATH = "//ul[@class='paginator']/li/span[@class='active']/parent::li/following-sibling::li[1]/a";

// Выполнение скрипта в контексте страницы и получение результата через Promise
async function execScript(tabId, func, args = []) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    function: func,
    args,
  });
  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message);
  }
  return result;
}

// Возвращает список ссылок на статьи и nextPageUrl (рассчитывается вручную)
function getLinksFromPage(articlesXpath) {
  const evaluateXPath = (xpath) => {
    const snapshot = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return Array.from({ length: snapshot.snapshotLength }, (_, i) => snapshot.snapshotItem(i));
  };

  const articleLinks = evaluateXPath(articlesXpath).map(el => el.href);
  const currentUrl = window.location.href;

  // Находим &page= или ?page=
  const match = currentUrl.match(/[?&]page=(\d+)/);
  const currentPage = match ? parseInt(match[1], 10) : 1;

  const nextPageUrl = currentUrl.replace(/([?&]page=)(\d+)/, (_, prefix) => `${prefix}${currentPage + 1}`);

  return { articleLinks, nextPageUrl };
}


// Парсинг данных статьи в контексте страницы
function parseHtmlAndExtractData(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const REMOVE_PHRASE = "Не можете найти то, что вам нужно? Попробуйте сервис подбора литературы.";

  const cleanText = text => text?.replace(REMOVE_PHRASE, '').trim();

  const extractByXPath = (xpath) => {
    const result = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue ? cleanText(result.singleNodeValue.textContent) : null;
  };

  const extractListByXPath = (xpath) => {
    const snapshot = doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return Array.from({ length: snapshot.snapshotLength }, (_, i) => cleanText(snapshot.snapshotItem(i).textContent));
  };
  const authors = extractListByXPath(
  "//*[@id='body']//ul[@class='author-list']/li[@itemprop='author']/span[@class='hl to-search']"
);

  // fallback если стандартный список пуст
  if (authors.length === 0) {
    const fallbackAuthors = extractAuthorsFromFallback("//h2[contains(text(), 'Похожие темы')]/span");
    authors.push(...fallbackAuthors);
  }

  const payload = {
    title: extractByXPath("//*[@id='body']//i[@itemprop='headline']"),
    authors: authors,
    annotation: extractByXPath("//div[contains(@class, 'abstract') or contains(@class, 'full')]//h2[contains(., 'Аннотация')]/following-sibling::p[@itemprop='description']"),
    articleText: extractByXPath("//*[@id='body']//div[@itemprop='articleBody']"),
    sourceUrl: url,
    flag: false
  };

  return (payload.title && payload.authors.length && payload.annotation && payload.articleText) ? payload : null;

  function extractAuthorsFromFallback(xpath) {
  const result = doc.evaluate(xpath, doc, null, XPathResult.STRING_TYPE, null);
  const text = result.stringValue;

  // Ищем часть после тире — и разделяем по запятой
  const match = text.match(/—\s*(.+)/);
  if (!match) return [];

  return match[1]
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
}

}

// Асинхронная функция для обработки страницы статей
async function processArticles(tabId) {
  try {
    const { articleLinks, nextPageUrl } = await execScript(tabId, getLinksFromPage, [ARTICLES_XPATH]);

    for (const url of articleLinks) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Ошибка HTTP ${res.status}`);

        const html = await res.text();
        const payload = await execScript(tabId, parseHtmlAndExtractData, [html, url]);

        if (payload) {
          await fetch('http://localhost:8000', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          console.log(`Отправлены данные для: ${url}`);
        } else {
          console.error(`Данные не извлечены: ${url}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Ошибка обработки статьи ${url}:`, error);
      }
    }

    if (nextPageUrl) {
      await chrome.tabs.update(tabId, { url: nextPageUrl });
      await waitForTabLoad(tabId);
      setTimeout(() => processArticles(tabId), 2000);
    } else {
      console.log('Обработка завершена, страниц больше нет.');
    }
  } catch (error) {
    console.error('Ошибка обработки страницы:', error);
  }
}

// Ожидание завершения загрузки страницы
function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

// Запуск по нажатию на иконку расширения
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await processArticles(tab.id);
  } else {
    console.error('Не найден ID вкладки.');
  }
});
