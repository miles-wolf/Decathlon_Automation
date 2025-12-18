#!/usr/bin/env python3
"""
export_db_tables.py

Export Postgres tables to CSV/XLSX. Also optionally run the lunch-job assignment
(using lunch_jobs_v2.generate_lunch_job_sql) and export those results too.

New UX features:
- --all to export every table in a schema (default: camp)
- --list to list tables and exit
- Interactive selection if neither --tables nor --all is provided

Examples:

# List tables in camp
python export_db_tables.py ... --list

# Export selected tables to CSVs
python export_db_tables.py ... --tables camp.staff camp.role camp.job --format csv --outdir ./exports

# Export ALL tables in schema camp to CSVs
python export_db_tables.py ... --all --schema camp --format csv --outdir ./exports

# Interactive selection (no --tables and no --all)
python export_db_tables.py ...

# One Excel with multiple sheets + lunch jobs
python export_db_tables.py ... --all --format xlsx --outfile ./exports/camp_dump.xlsx \
  --export-lunch-jobs --session-id 1015 \
  --assignments '[{"staff_id":1141,"job_id":1001}]' --days monday tuesday wednesday thursday
"""

import argparse
import json
from pathlib import Path
from typing import List, Tuple

import pandas as pd
import psycopg2
from psycopg2 import sql

from lunch_jobs_v2 import connect_to_postgres, generate_lunch_job_sql

# ---------------------------
# Helpers
# ---------------------------

def parse_table_name(qualified: str) -> Tuple[str, str]:
    parts = qualified.split(".")
    if len(parts) == 1:
        return "public", parts[0]
    if len(parts) == 2:
        return parts[0], parts[1]
    raise ValueError(f"Invalid table name: {qualified}")

def list_relations(conn, schema: str, include_views: bool = False) -> List[str]:
    """
    Returns fully qualified names like 'schema.table' for all base tables
    (and optionally views) in the given schema.
    """
    q = """
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema = %s
          AND table_type IN ({types})
        ORDER BY table_name
    """.format(types=("%s,%s" if include_views else "%s"))
    with conn.cursor() as c:
        if include_views:
            c.execute(q, (schema, "BASE TABLE", "VIEW"))
        else:
            c.execute(q, (schema, "BASE TABLE"))
        rows = c.fetchall()
    return [f"{s}.{t}" for s, t in rows]

def read_entire_table(conn, schema: str, table: str) -> pd.DataFrame:
    query = sql.SQL("SELECT * FROM {s}.{t}").format(
        s=sql.Identifier(schema), t=sql.Identifier(table)
    )
    return pd.read_sql(query.as_string(conn), conn)

def build_lunch_jobs_df(cur, conn, assignments: List[dict], session_id: int, days: List[str] = None) -> pd.DataFrame:
    sql_str = generate_lunch_job_sql(cur, assignments, session_id=session_id, days=days)
    return pd.read_sql(sql_str, conn)

def write_csvs(dfs_by_name: dict, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, df in dfs_by_name.items():
        # flatten 'schema.table' to schema_table for filename
        fname = name.replace(".", "_") + ".csv"
        outpath = outdir / fname
        df.to_csv(outpath, index=False)
        paths.append(outpath)
    return paths

def write_xlsx(dfs_by_name: dict, outfile: Path):
    outfile.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(outfile, engine="xlsxwriter") as writer:
        for name, df in dfs_by_name.items():
            sheet = name.replace("/", "_").replace("\\", "_").replace(".", "_")[:31]
            df.to_excel(writer, sheet_name=sheet, index=False)
    return outfile

def interactive_select(options: List[str]) -> List[str]:
    """
    Prompt the user to select one or more items by number(s),
    ranges like 1-3, comma-separated, or 'all'.
    """
    print("\nAvailable tables/views:")
    for i, opt in enumerate(options, start=1):
        print(f"  [{i}] {opt}")
    print("\nEnter numbers (e.g., 1,3,5 or 2-6) or 'all': ", end="")
    choice = input().strip().lower()

    if choice in ("all", "a", "*"):
        return options

    picks = set()
    parts = [p.strip() for p in choice.split(",") if p.strip()]
    for p in parts:
        if "-" in p:
            a, b = p.split("-", 1)
            a, b = int(a), int(b)
            for k in range(min(a, b), max(a, b) + 1):
                if 1 <= k <= len(options):
                    picks.add(options[k - 1])
        else:
            k = int(p)
            if 1 <= k <= len(options):
                picks.add(options[k - 1])
    sel = sorted(picks, key=lambda x: options.index(x))
    if not sel:
        print("No valid selection made; nothing to export.")
    return sel

# ---------------------------
# Main
# ---------------------------

def main():
    ap = argparse.ArgumentParser(description="Export DB tables to CSV/XLSX; optional lunch-job export.")
    # DB
    ap.add_argument("--db-name")
    ap.add_argument("--db-user")
    ap.add_argument("--db-password")
    ap.add_argument("--db-host")
    ap.add_argument("--db-port", default="5432")

    ap.set_defaults(
        db_name="postgres",
        db_user="shop_analyst.ffnhexmowaiglsmmbycm",
        db_password="infinity",
        db_host="aws-0-us-west-1.pooler.supabase.com",
        db_port="5432",
    )

    # Discovery/selection
    ap.add_argument("--schema", default="camp", help="Schema to use when --all/interactive/list (default: camp)")
    ap.add_argument("--include-views", action="store_true", help="Include views in listings/exports")
    ap.add_argument("--list", action="store_true", help="List tables (and views if --include-views) and exit")
    ap.add_argument("--all", action="store_true", help="Export all tables (and views if --include-views) in --schema")
    ap.add_argument("--tables", nargs="*", default=[], help="Explicit tables like camp.staff camp.role")

    # Lunch jobs
    ap.add_argument("--export-lunch-jobs", action="store_true")
    ap.add_argument("--session-id", type=int)
    ap.add_argument("--assignments", type=str, default="[]",
                    help="JSON list of {'staff_id':int,'job_id':int}")
    ap.add_argument("--days", nargs="*")

    # Output
    ap.add_argument("--format", choices=["csv", "xlsx"], default="csv")
    ap.add_argument("--outdir", default="./exports")
    ap.add_argument("--outfile", default=None)

    args = ap.parse_args()

    conn, cur = connect_to_postgres(
        db_name=args.db_name,
        db_user=args.db_user,
        db_password=args.db_password,
        db_host=args.db_host,
        db_port=args.db_port,
    )
    if not conn or not cur:
        raise SystemExit("Database connection failed.")

    try:
        # Discovery modes
        available = list_relations(conn, args.schema, include_views=args.include_views)

        if args.list:
            print(f"Objects in schema '{args.schema}' ({'tables+views' if args.include_views else 'tables only'}):")
            for name in available:
                print(" -", name)
            return

        selection: List[str] = []

        if args.all:
            if not available:
                print(f"No objects found in schema '{args.schema}'.")
                return
            selection = available

        elif args.tables:
            # Use exactly what was passed (validate existence)
            missing = [t for t in args.tables if t not in available]
            if missing:
                print("Warning: the following were not found in the database and will be skipped:")
                for m in missing:
                    print("  -", m)
            selection = [t for t in args.tables if t in available]

        else:
            # Interactive selection
            if not available:
                print(f"No objects found in schema '{args.schema}'. Nothing to export.")
                return
            selection = interactive_select(available)
            if not selection:
                return

        dfs_by_name = {}

        # Dump selected relations
        for qname in selection:
            schema, table = parse_table_name(qname)
            df = read_entire_table(conn, schema, table)
            dfs_by_name[qname] = df

        # Optional lunch-job export
        if args.export_lunch_jobs:
            if not args.session_id:
                raise SystemExit("--session-id is required with --export-lunch-jobs")
            try:
                assignments = json.loads(args.assignments)
                if not isinstance(assignments, list):
                    raise ValueError
            except Exception:
                raise SystemExit("--assignments must be JSON list, e.g. '[{\"staff_id\":1141,\"job_id\":1001}]'")
            days = [d.lower() for d in (args.days or [])] or None
            lj_df = build_lunch_jobs_df(cur, conn, assignments, session_id=args.session_id, days=days)
            dfs_by_name[f"lunch_jobs_session_{args.session_id}"] = lj_df

        # Write outputs
        if args.format == "csv":
            written = write_csvs(dfs_by_name, Path(args.outdir))
            if written:
                print("\nWrote CSV files:")
                for p in written:
                    print(" -", p)
            else:
                print("No CSVs were written (empty selection).")
        else:
            outfile = Path(args.outfile or "./exports/export.xlsx")
            wrote = write_xlsx(dfs_by_name, outfile)
            print("\nWrote XLSX workbook:", wrote)

    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

if __name__ == "__main__":
    main()
