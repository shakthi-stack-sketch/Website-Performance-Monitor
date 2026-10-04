import os
import sqlite3
from typing import List, Dict, Any, Optional

DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DB_PATH = os.path.join(DB_DIR, 'monitor.db')

def get_db_connection():
    """Establishes and returns a database connection with Row factory."""
    if not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """Initializes the database schema if tables do not exist."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS websites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        http_status INTEGER,
        response_time REAL,
        response_size TEXT,
        checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        error_message TEXT,
        FOREIGN KEY (website_id) REFERENCES websites (id) ON DELETE CASCADE
    );
    """)
    
    conn.commit()
    conn.close()

def row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    """Converts a sqlite3.Row object to a standard Python dict."""
    if row is None:
        return None
    return dict(row)

def add_website(name: str, url: str) -> Dict[str, Any]:
    """Adds a new website to the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check for duplicate URL
    cursor.execute("SELECT id FROM websites WHERE url = ?", (url,))
    if cursor.fetchone():
        conn.close()
        raise ValueError(f"Website with URL '{url}' is already being monitored.")
    
    cursor.execute("INSERT INTO websites (name, url) VALUES (?, ?)", (name, url))
    conn.commit()
    website_id = cursor.lastrowid
    
    cursor.execute("SELECT * FROM websites WHERE id = ?", (website_id,))
    row = cursor.fetchone()
    conn.close()
    return row_to_dict(row)

def get_websites() -> List[Dict[str, Any]]:
    """Retrieves all monitored websites with their latest check data."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT 
        w.id, w.name, w.url, w.created_at,
        c.id as latest_check_id,
        c.status as latest_status,
        c.http_status as latest_http_status,
        c.response_time as latest_response_time,
        c.response_size as latest_response_size,
        c.checked_at as last_checked_at,
        c.error_message as latest_error_message
    FROM websites w
    LEFT JOIN (
        SELECT c1.*
        FROM checks c1
        INNER JOIN (
            SELECT website_id, MAX(id) as max_id
            FROM checks
            GROUP BY website_id
        ) c2 ON c1.id = c2.max_id
    ) c ON w.id = c.website_id
    ORDER BY w.id DESC
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]

def get_website_by_id(website_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves a single website with its latest check data."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT 
        w.id, w.name, w.url, w.created_at,
        c.id as latest_check_id,
        c.status as latest_status,
        c.http_status as latest_http_status,
        c.response_time as latest_response_time,
        c.response_size as latest_response_size,
        c.checked_at as last_checked_at,
        c.error_message as latest_error_message
    FROM websites w
    LEFT JOIN (
        SELECT c1.*
        FROM checks c1
        INNER JOIN (
            SELECT website_id, MAX(id) as max_id
            FROM checks
            GROUP BY website_id
        ) c2 ON c1.id = c2.max_id
    ) c ON w.id = c.website_id
    WHERE w.id = ?
    """
    
    cursor.execute(query, (website_id,))
    row = cursor.fetchone()
    conn.close()
    return row_to_dict(row)

def delete_website(website_id: int) -> bool:
    """Deletes a website and all associated check history."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM websites WHERE id = ?", (website_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def add_check(website_id: int, status: str, http_status: Optional[int], 
              response_time: Optional[float], response_size: Optional[str], 
              error_message: Optional[str] = None) -> Dict[str, Any]:
    """Records a new HTTP check for a website."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    INSERT INTO checks (website_id, status, http_status, response_time, response_size, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (website_id, status, http_status, response_time, response_size, error_message))
    
    conn.commit()
    check_id = cursor.lastrowid
    
    cursor.execute("SELECT * FROM checks WHERE id = ?", (check_id,))
    row = cursor.fetchone()
    conn.close()
    return row_to_dict(row)

def get_website_history(website_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves check history for a specific website."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT id, website_id, status, http_status, response_time, response_size, checked_at, error_message
    FROM checks
    WHERE website_id = ?
    ORDER BY id DESC
    LIMIT ?
    """
    
    cursor.execute(query, (website_id, limit))
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]

def get_all_recent_checks(limit: int = 30) -> List[Dict[str, Any]]:
    """Retrieves recent checks across all websites."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT 
        c.id, c.website_id, w.name as website_name, w.url as website_url,
        c.status, c.http_status, c.response_time, c.response_size, c.checked_at, c.error_message
    FROM checks c
    JOIN websites w ON c.website_id = w.id
    ORDER BY c.id DESC
    LIMIT ?
    """
    
    cursor.execute(query, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]

def get_dashboard_summary() -> Dict[str, Any]:
    """Calculates live dashboard overview metrics from database records."""
    websites = get_websites()
    total_websites = len(websites)
    
    online_count = 0
    degraded_count = 0
    offline_count = 0
    unckecked_count = 0
    
    for w in websites:
        st = w.get('latest_status')
        if st == 'ONLINE':
            online_count += 1
        elif st == 'DEGRADED':
            degraded_count += 1
        elif st == 'OFFLINE':
            offline_count += 1
        else:
            unckecked_count += 1
            
    return {
        'total_websites': total_websites,
        'online_count': online_count,
        'degraded_count': degraded_count,
        'offline_count': offline_count,
        'unchecked_count': unckecked_count
    }
