import sqlite3

DATABASE = 'data.db'

def update_flag_values():
    """
    Обновляет все записи в таблице articles, у которых flag = 0,
    устанавливая flag = 10.
    """
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()

        cursor.execute("UPDATE articles SET flag = 20 WHERE flag = 0")
        affected = cursor.rowcount
        conn.commit()

        print(f"Обновлено записей: {affected}")
    except Exception as e:
        print(f"Ошибка при обновлении флагов: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    update_flag_values()
