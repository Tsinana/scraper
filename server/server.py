import sqlite3
from flask import Flask, request, jsonify

# Константа для файла базы данных
DATABASE = 'data.db'

app = Flask(__name__)

def init_db():
    """
    Инициализирует базу данных SQLite и создает таблицу articles,
    если она еще не существует.
    Поле title имеет уникальное ограничение.
    """
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT UNIQUE,
                authors TEXT,
                annotation TEXT,
                articleText TEXT,
                sourceUrl TEXT,
                flag INTEGER
            )
        ''')
        conn.commit()
    except Exception as error:
        print(f"Ошибка инициализации базы данных: {error}")
    finally:
        conn.close()

@app.after_request
def add_cors_headers(response):
    """
    Добавляет заголовки CORS ко всем ответам сервера.
    Это необходимо для корректной работы запросов с других доменов.
    """
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

@app.route('/', methods=['POST', 'OPTIONS'])
def receive_data():
    """
    Обрабатывает POST-запросы с JSON-данными от плагина.
    При preflight-запросе (OPTIONS) возвращает пустой ответ с нужными заголовками.
    Если запись с таким title уже существует, возвращается ошибка.
    """
    if request.method == 'OPTIONS':
        # Обработка preflight-запроса
        return '', 200

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Нет данных"}), 400

        # Проверка наличия обязательных полей
        required_fields = ['title', 'authors', 'annotation', 'articleText', 'sourceUrl', 'flag']
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Отсутствует поле: {field}"}), 400

        # Преобразование списка авторов в строку
        authors_value = ', '.join(data['authors']) if isinstance(data['authors'], list) else data['authors']
        flag_value = 1 if data['flag'] else 0

        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO articles (title, authors, annotation, articleText, sourceUrl, flag)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (data['title'], authors_value, data['annotation'], data['articleText'], data['sourceUrl'], flag_value))
            conn.commit()
        except sqlite3.IntegrityError:
            # Запись с таким заголовком уже существует
            return jsonify({"error": "Запись с таким заголовком уже существует"}), 409
        finally:
            conn.close()

        return jsonify({"message": "Данные успешно сохранены"}), 201
    except Exception as error:
        return jsonify({"error": str(error)}), 500

if __name__ == '__main__':
    init_db()
    # Запуск сервера на порту 8000
    app.run(port=8000, debug=True)
