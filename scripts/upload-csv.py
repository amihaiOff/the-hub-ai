#!/usr/bin/env python3
"""
Upload a Riseup CSV file to The Hub AI.

Usage:
    python scripts/upload-csv.py path/to/transactions.csv
    python scripts/upload-csv.py path/to/transactions.csv prod
    python scripts/upload-csv.py path/to/transactions.csv local
"""

import argparse
import sys
from pathlib import Path

import requests

API_KEY = "H6HsrWFztNcYfHsPbItSa9B5odpzj9Qs"
LOCAL_URL = "http://localhost:3001"
PROD_URL = "https://the-hub-ai-ten.vercel.app"


def upload_csv(file_path: str, base_url: str) -> None:
    path = Path(file_path)
    if not path.exists():
        print(f"Error: File not found: {path}")
        sys.exit(1)
    if not path.suffix.lower() == ".csv":
        print(f"Error: File must be a .csv file, got: {path.suffix}")
        sys.exit(1)

    url = f"{base_url.rstrip('/')}/api/budget/transactions/import-csv"

    print(f"Uploading {path.name} to {url} ...")

    with open(path, "rb") as f:
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"file": (path.name, f, "text/csv")},
        )

    if resp.status_code == 200:
        data = resp.json().get("data", {})
        print(f"Success!")
        print(f"  Created:           {data.get('created', 0)}")
        print(f"  Duplicates skipped: {data.get('duplicatesSkipped', 0)}")
        payees = data.get("payeesCreated", [])
        if payees:
            print(f"  New payees:        {', '.join(payees)}")
    else:
        print(f"Error ({resp.status_code}): {resp.text}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Upload a Riseup CSV to The Hub AI")
    parser.add_argument("file", help="Path to the CSV file")
    parser.add_argument(
        "deployment",
        nargs="?",
        default="local",
        choices=["local", "prod"],
        help="Deployment target (default: local)",
    )
    args = parser.parse_args()

    base_url = PROD_URL if args.deployment == "prod" else LOCAL_URL
    upload_csv(args.file, base_url)
