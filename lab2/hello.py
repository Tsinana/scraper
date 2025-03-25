import pandas as pd
import sqlite3
import itertools
import time
from typing import Dict, Any, List
import re

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import KNeighborsClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.metrics import classification_report, accuracy_score
import nltk
import pymorphy2
from nltk.corpus import stopwords

nltk.download('stopwords')
# Строитель для подготовки данных
class DatasetBuilder:
    def __init__(self, db_path):
        self.db_path = db_path
        self.data = None
    
    def load_data(self, min_category_count=100, max_category_count=1000, balance_categories=True):
        conn = sqlite3.connect(self.db_path)
        query = """
                SELECT
                    flag AS category,
                    articleText AS text
                FROM articles
                WHERE articleText IS NOT NULL AND flag IS NOT NULL
                """
        self.data = pd.read_sql(query, conn)
        conn.close()
        
        # Подсчёт количества записей по каждой категории
        category_counts = self.data['category'].value_counts()
        
        # Убираем категории, у которых меньше минимального количества записей
        valid_categories = category_counts[category_counts >= min_category_count].index
        self.data = self.data[self.data['category'].isin(valid_categories)]
        
        if balance_categories:
            # Балансируем категории с большим количеством записей
            balanced_data = pd.DataFrame()
            for category in valid_categories:
                category_df = self.data[self.data['category'] == category]
                if len(category_df) > max_category_count:
                    category_df = category_df.sample(max_category_count, random_state=42)
                balanced_data = pd.concat([balanced_data, category_df], ignore_index=True)
            self.data = balanced_data
            print("✅ Балансировка выполнена.")
        else:
            print("⚠️ Балансировка отключена.")
        
        print(f"Фильтрация завершена, количество записей: {len(self.data)}")
        print(self.data['category'].value_counts())
        
        return self
    
    def preprocess(self):
        russian_stopwords = set(stopwords.words("russian"))
        morph = pymorphy2.MorphAnalyzer()
        
        def preprocess_text(text):
            # 1. Нижний регистр
            text = text.lower()
            
            # 2. Замена "ё" на "е"
            text = text.replace("ё", "е")
            
            # 3. Удаление всех символов, кроме кириллицы и пробелов
            text = re.sub(r"[^а-я\s]", "", text)
            
            # 4. Удаление лишних пробелов
            text = re.sub(r"\s+", " ", text).strip()
            
            # 5. Токенизация
            tokens = text.split()
            
            # 6. Удаление стоп-слов
            tokens = [word for word in tokens if word not in russian_stopwords]
            
            # 7. Удаление слов длиной ≤ 2 символа
            tokens = [word for word in tokens if len(word) > 2]
            
            # 8. Оставляем только слова, известные словарю pymorphy2
            tokens = [word for word in tokens if morph.word_is_known(word)]
            
            return " ".join(tokens)
        
        self.data['text'] = self.data['text'].apply(preprocess_text)
        return self

    def encode_labels(self):
        categories = self.data['category'].astype('category')
        self.data['category'] = categories.cat.codes
        self.label_names = categories.cat.categories.astype(str)
        return self
    
    def split_data(self, test_size=0.2):
        X = self.data['text']
        y = self.data['category']
        return (*train_test_split(X, y, test_size=test_size, random_state=42), self.label_names)


# Класс для тестирования моделей
class ModelTester:
    def __init__(self, model, name, params):
        self.model = model
        self.name = name
        self.params = params

    def evaluate(self, X_train, X_test, y_train, y_test, labels):
        start_time = time.time()
        vectorizer = TfidfVectorizer()
        X_train_tfidf = vectorizer.fit_transform(X_train)
        X_test_tfidf = vectorizer.transform(X_test)

        self.model.fit(X_train_tfidf, y_train)
        y_pred = self.model.predict(X_test_tfidf)

        accuracy = accuracy_score(y_test, y_pred)
        report = classification_report(y_test, y_pred, target_names=labels, zero_division=0)

        elapsed_time = time.time() - start_time
        model_info = f"{self.name} ({self.params})"

        print(f"\n✅ Завершено: {model_info} | Время: {elapsed_time:.2f} сек.")

        return {
            'model': model_info,
            'accuracy': accuracy,
            'classification_report': report,
            'time': elapsed_time
        }

# Генерация всех комбинаций параметров
def get_param_combinations(param_dict: Dict[str, List[Any]]) -> List[Dict[str, Any]]:
    keys = param_dict.keys()
    combinations = itertools.product(*param_dict.values())
    return [dict(zip(keys, combination)) for combination in combinations]

# Основной процесс
def main():
    DB_PATH = "../lab1/server/data.db"
    OUTPUT_FILE = "model_results.txt"

    raw_builder = DatasetBuilder(DB_PATH).load_data().encode_labels()
    proc_builder = DatasetBuilder(DB_PATH).load_data().preprocess().encode_labels()
   
    datasets = {
        "Необработанные данные": raw_builder.split_data(),
        "Предобработанные данные": proc_builder.split_data()
    }
    model_params = {
        "KNeighborsClassifier": {
            "n_neighbors": [3, 9],
            "weights": ['uniform', 'distance'],
            "metric": ['euclidean', 'manhattan'],
            "algorithm": ['auto', 'brute']
        },
        "LogisticRegression": {
            "C": [0.1, 1.0],
            "solver": ['liblinear', 'lbfgs'],
            "max_iter": [100, 500]
        },
        "MultinomialNB": {
            "alpha": [0.5, 1.0],
            "fit_prior": [True, False]
        }
    }

    results = []
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f_out:
        for dataset_name, (X_train, X_test, y_train, y_test, labels) in datasets.items():
            f_out.write(f"\n==== {dataset_name} ====\n")
            print(f"\nЗапуск на {dataset_name}")

            for model_name, params_dict in model_params.items():
                param_combinations = get_param_combinations(params_dict)
                for params in param_combinations:
                    if model_name == "KNeighborsClassifier":
                        model = KNeighborsClassifier(**params)
                    elif model_name == "LogisticRegression":
                        model = LogisticRegression(**params, random_state=42)
                    elif model_name == "MultinomialNB":
                        model = MultinomialNB(**params)

                    tester = ModelTester(model, model_name, params)
                    result = tester.evaluate(X_train, X_test, y_train, y_test, labels)

                    # Логирование в файл
                    f_out.write(f"\n--- Модель: {result['model']} ---\n")
                    f_out.write(f"Accuracy: {result['accuracy']:.2f}\n")
                    f_out.write(f"Время: {result['time']:.2f} сек.\n")
                    f_out.write(result['classification_report'])
                    f_out.write("\n" + "="*50 + "\n")

                    results.append(result)

    print(f"\nВсе результаты записаны в файл {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
