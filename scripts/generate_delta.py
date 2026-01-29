#!/usr/bin/env python3
"""Generate a SQLite delta database with 100 random user records."""

import sqlite3
import random
import string
import os
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


def random_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def random_created_at():
    base = datetime(2024, 1, 1)
    offset = timedelta(seconds=random.randint(0, 365 * 24 * 3600))
    return (base + offset).isoformat()


def main():
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)

    conn = sqlite3.connect(OUTPUT_FILE)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            created_at TEXT NOT NULL,
            name TEXT NOT NULL
        )
    """)

    rows = [(i, random_created_at(), random_name()) for i in range(1, 101)]
    cursor.executemany("INSERT INTO users VALUES (?, ?, ?)", rows)

    conn.commit()
    conn.close()
    print(f"Created {OUTPUT_FILE} with 100 records")


if __name__ == "__main__":
    main()
