#!/usr/bin/env python3
"""Generate a ~50MB SQLite delta database with varied column types."""

import sqlite3
import random
import string
import os
import json
from datetime import datetime, timedelta

FIRST_NAMES = [
    "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Hank",
    "Ivy", "Jack", "Karen", "Leo", "Mona", "Nick", "Olivia", "Paul",
    "Quinn", "Rita", "Sam", "Tina", "Uma", "Vic", "Wendy", "Xander",
    "Yara", "Zane",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
]

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "delta.db")
TARGET_SIZE = 50 * 1024 * 1024

CATEGORIES = ["Electronics", "Books", "Clothing", "Food", "Sports", "Home", "Toys", "Music", "Health", "Garden"]
LOG_LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled", "returned"]


def random_string(length):
    return "".join(random.choices(string.ascii_letters + string.digits + " ", k=length))


def random_email(name):
    domains = ["example.com", "test.org", "sample.net", "demo.io"]
    local = name.lower().replace(" ", ".") + str(random.randint(1, 9999))
    return f"{local}@{random.choice(domains)}"


def random_datetime(start_year=2020, end_year=2024):
    start = datetime(start_year, 1, 1)
    end = datetime(end_year, 12, 31)
    delta = end - start
    offset = timedelta(seconds=random.randint(0, int(delta.total_seconds())))
    return (start + offset).isoformat()


def random_blob(min_size=256, max_size=2048):
    return os.urandom(random.randint(min_size, max_size))


def random_json_metadata():
    return json.dumps({
        "ip": f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}",
        "user_agent": random_string(random.randint(20, 80)),
        "tags": [random_string(random.randint(3, 10)) for _ in range(random.randint(1, 5))],
        "score": round(random.uniform(0, 100), 2),
    })


def create_tables(cursor):
    cursor.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            age INTEGER,
            balance REAL DEFAULT 0.0,
            bio TEXT,
            avatar BLOB,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE products (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            weight REAL,
            category TEXT,
            in_stock INTEGER NOT NULL DEFAULT 1,
            image BLOB,
            created_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            total REAL NOT NULL,
            discount REAL DEFAULT 0.0,
            status TEXT NOT NULL,
            notes TEXT,
            ordered_at TEXT NOT NULL,
            shipped_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    """)
    cursor.execute("""
        CREATE TABLE logs (
            id INTEGER PRIMARY KEY,
            timestamp TEXT NOT NULL,
            level TEXT NOT NULL,
            source TEXT,
            message TEXT NOT NULL,
            metadata TEXT,
            payload BLOB,
            acknowledged INTEGER DEFAULT 0
        )
    """)


def main():
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)

    conn = sqlite3.connect(OUTPUT_FILE)
    cursor = conn.cursor()
    create_tables(cursor)

    batch_size = 1000
    user_id = 0
    product_id = 0
    order_id = 0
    log_id = 0

    while os.path.getsize(OUTPUT_FILE) < TARGET_SIZE:
        users = []
        for _ in range(batch_size):
            user_id += 1
            name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
            users.append((
                user_id, name, random_email(name),
                random.randint(18, 90),
                round(random.uniform(-1000, 50000), 2),
                random_string(random.randint(50, 500)),
                random_blob(128, 1024),
                random.randint(0, 1),
                random_datetime(),
            ))
        cursor.executemany("INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)", users)

        products = []
        for _ in range(batch_size // 2):
            product_id += 1
            products.append((
                product_id,
                random_string(random.randint(10, 50)),
                random_string(random.randint(100, 1000)),
                round(random.uniform(0.99, 9999.99), 2),
                round(random.uniform(0.01, 500.0), 3),
                random.choice(CATEGORIES),
                random.randint(0, 1),
                random_blob(512, 4096),
                random_datetime(),
            ))
        cursor.executemany("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)", products)

        orders = []
        for _ in range(batch_size * 2):
            order_id += 1
            qty = random.randint(1, 20)
            price = round(random.uniform(0.99, 999.99), 2)
            discount = round(random.uniform(0, 0.3), 2)
            orders.append((
                order_id,
                random.randint(1, max(1, user_id)),
                random.randint(1, max(1, product_id)),
                qty, price,
                round(qty * price * (1 - discount), 2),
                discount,
                random.choice(STATUSES),
                random_string(random.randint(0, 200)) if random.random() > 0.5 else None,
                random_datetime(),
                random_datetime(2024, 2024) if random.random() > 0.3 else None,
            ))
        cursor.executemany("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?)", orders)

        logs = []
        for _ in range(batch_size):
            log_id += 1
            logs.append((
                log_id,
                random_datetime(),
                random.choice(LOG_LEVELS),
                random_string(random.randint(5, 30)),
                random_string(random.randint(20, 500)),
                random_json_metadata() if random.random() > 0.3 else None,
                random_blob(64, 2048) if random.random() > 0.5 else None,
                random.randint(0, 1),
            ))
        cursor.executemany("INSERT INTO logs VALUES (?,?,?,?,?,?,?,?)", logs)

        conn.commit()
        current_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
        print(f"\r{current_mb:.1f} MB ...", end="", flush=True)

    conn.close()
    final_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"\nCreated {OUTPUT_FILE} ({final_mb:.1f} MB)")


if __name__ == "__main__":
    main()
