# Scraper

Данный проект состоит из двух основных компонентов:

- **Плагин для Chrome** – извлекает данные со страниц сайта [CyberLeninka](https://cyberleninka.ru).
- **Сервер на Python** – принимает данные от плагина и сохраняет их в базу данных SQLite.

---

## Плагин

Плагин разработан для работы на сайте [CyberLeninka](https://cyberleninka.ru). Для его использования выполните следующие шаги:

1. Перейдите на страницу интересующей статьи.
2. Нажмите на иконку плагина.

### Извлекаемые параметры

Плагин собирает следующие данные со страницы:

- **Заголовок**  
  Извлекается с помощью XPath, который находит соответствующий элемент заголовка статьи.

- **Авторы**  
  Извлекается список авторов.

- **Аннотация**  
  Извлекается описание статьи, расположенное после заголовка «Аннотация» с помощью соответствующего XPath.

- **Содержание**  
  Полный текст статьи, извлекается из основного контента страницы.

- **URL статьи**  
  Получается напрямую.

Перед отправкой на сервер плагин устанавливает дополнительный флаг, который имеет следующие значения:

- **0** — статья по теме.
- **1** — статья не по теме.

Плагин формирует JSON-пакет с указанными параметрами и отправляет его на сервер посредством HTTP POST-запроса.

---

## Сервер

Сервер реализован на Python с использованием Flask. Его основные функции:

- **Слушает порт 8000:** Принимает POST-запросы с данными от плагина.
- **Создает таблицу для статей:** Если таблица отсутствует, сервер создает её в базе данных SQLite.
- **Уникальность по полю title:** Каждая статья идентифицируется уникальным заголовком, что предотвращает дублирование записей.
- **Обработка CORS:** Сервер добавляет необходимые заголовки, чтобы принимать запросы с других доменов.

### Структура таблицы `articles`

| Поле         | Описание                                                                           |
|--------------|------------------------------------------------------------------------------------|
| **id**       | Автоинкрементный идентификатор записи.                                             |
| **title**    | Заголовок статьи. Уникальное значение.                                             |
| **authors**  | Список авторов, представленный в виде строки (имена разделены запятыми).             |
| **annotation**   | Аннотация статьи.                                                                 |
| **articleText**  | Полный текст статьи.                                                              |
| **sourceUrl**    | URL страницы статьи.                                                              |
| **flag**         | Флаг: 0 — статья по теме, 1 — статья не по теме.                                  |

При получении данных сервер проверяет наличие всех обязательных полей. Если запись с данным заголовком уже существует, возвращается ошибка с кодом 409.
