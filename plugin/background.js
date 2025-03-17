/**
 * Функция, которая будет инжектироваться в код страницы.
 * Весь код, использующий document.evaluate, выполняется в контексте страницы.
 */
function extractAndSendData() {
  // Константы XPath-выражений для поиска элементов на странице
  const XPATH_TITLE = "//*[@id='body']//i[@itemprop='headline']"; // Заголовок статьи
  // XPath для получения списка всех <span> внутри <li itemprop="author"> в списке авторов
  const XPATH_AUTHOR = "//*[@id='body']//ul[@class='author-list']/li[@itemprop='author']/span[@class='hl to-search']";
  const XPATH_ARTICLE_TEXT = "//*[@id='body']//div[@itemprop='articleBody']"; // Текст статьи
  const XPATH_ANNOTATION = "//div[contains(@class, 'abstract') or contains(@class, 'full')]//h2[contains(., 'Аннотация')]/following-sibling::p[@itemprop='description']";

  // Дополнительный флаг
  const FLAG_PARAM = true;

  // Фраза, которую необходимо удалить из параметров
  const REMOVE_PHRASE = "Не можете найти то, что вам нужно? Попробуйте сервис подбора литературы.";

  /**
   * Очищает текст от лишних пробелов и заданной фразы.
   * @param {string} text - Исходный текст.
   * @returns {string} Очищенный текст.
   */
  function cleanText(text) {
    if (typeof text !== 'string') return text;
    return text.replace(REMOVE_PHRASE, "").trim();
  }

  /**
   * Извлекает данные с использованием XPath.
   * document.evaluate выполняется непосредственно в контексте страницы.
   * @param {string} xpath - XPath выражение для поиска.
   * @returns {string|null} Текстовое содержимое или значение атрибута найденного узла, либо null.
   */
  function extractDataByXPath(xpath) {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      if (result && result.singleNodeValue) {
        return result.singleNodeValue.nodeType === Node.ATTRIBUTE_NODE
          ? result.singleNodeValue.value
          : cleanText(result.singleNodeValue.textContent);
      } else {
        console.error(`Элемент не найден для XPath: ${xpath}`);
        return null;
      }
    } catch (error) {
      console.error(`Ошибка при выполнении XPath (${xpath}): ${error.message}`);
      return null;
    }
  }

  /**
   * Извлекает список данных с использованием XPath.
   * document.evaluate выполняется непосредственно в контексте страницы.
   * @param {string} xpath - XPath выражение для поиска.
   * @returns {Array} Массив строк с данными, либо пустой массив, если данные не найдены.
   */
  function extractListByXPath(xpath) {
    try {
      const resultsSnapshot = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      const results = [];
      for (let i = 0; i < resultsSnapshot.snapshotLength; i++) {
        const node = resultsSnapshot.snapshotItem(i);
        const value = node.nodeType === Node.ATTRIBUTE_NODE
          ? node.value
          : cleanText(node.textContent);
        if (value) {
          results.push(value);
        }
      }
      if (results.length === 0) {
        console.error(`Элементы не найдены для XPath: ${xpath}`);
      }
      return results;
    } catch (error) {
      console.error(`Ошибка при выполнении XPath (список) (${xpath}): ${error.message}`);
      return [];
    }
  }

  try {
    // Извлекаем параметры с сайта
    const title = extractDataByXPath(XPATH_TITLE);
    const authorList = extractListByXPath(XPATH_AUTHOR);
    const annotation = extractDataByXPath(XPATH_ANNOTATION);
    const articleText = extractDataByXPath(XPATH_ARTICLE_TEXT);

    // Получаем URL страницы напрямую
    const sourceUrl = window.location.href;

    // Проверяем, что все параметры найдены
    if (title && authorList.length > 0 && annotation && articleText && sourceUrl) {
      const payload = {
        title: title,
        authors: authorList,
        annotation: annotation,
        articleText: articleText,
        sourceUrl: sourceUrl,
        flag: FLAG_PARAM
      };
      console.log(JSON.stringify(payload));
      // Отправляем данные на сервер через HTTP POST
      fetch('http://localhost:8000', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
        .then((response) => {
          if (!response.ok) {
            console.error(`Ошибка при отправке данных. Сервер вернул статус: ${response.status}`);
          }
        })
        .catch((error) => {
          console.error(`Ошибка при отправке данных: ${error.message}`);
        });
    } else {
      console.error('Не все параметры найдены. Отправка данных не выполняется.');
    }
  } catch (error) {
    console.error(`Ошибка в процессе извлечения и отправки данных: ${error.message}`);
  }
}

/**
 * Обработчик нажатия на иконку расширения.
 * Инжектирует функцию extractAndSendData в активную вкладку, чтобы document.evaluate выполнялся в коде страницы.
 */
chrome.action.onClicked.addListener((tab) => {
  try {
    if (tab.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: extractAndSendData
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error(`Ошибка при инжекции скрипта: ${chrome.runtime.lastError.message}`);
        }
      });
    } else {
      console.error('ID вкладки не найден.');
    }
  } catch (error) {
    console.error(`Ошибка при обработке нажатия на иконку: ${error.message}`);
  }
});
