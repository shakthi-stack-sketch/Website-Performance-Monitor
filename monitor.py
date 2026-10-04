import time
import socket
import ipaddress
from urllib.parse import urlparse
from typing import Dict, Any, Tuple
import requests

def format_bytes(num_bytes: int) -> str:
    """Formats raw byte counts into human-readable strings (B, KB, MB)."""
    if num_bytes < 0:
        return "Not available"
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024.0:.1f} KB"
    else:
        return f"{num_bytes / (1024.0 * 1024.0):.2f} MB"

def validate_and_normalize_url(url_input: str) -> Tuple[bool, str, str]:
    """
    Validates and normalizes user input URL.
    Appends https:// if missing.
    Enforces HTTP/HTTPS protocols and SSRF protection.
    Returns: (is_valid: bool, normalized_url_or_error: str, website_name_fallback: str)
    """
    if not url_input or not url_input.strip():
        return False, "URL cannot be empty.", ""

    url_str = url_input.strip()

    # Prepend protocol if missing
    if not url_str.startswith(('http://', 'https://')):
        url_str = 'https://' + url_str

    try:
        parsed = urlparse(url_str)
    except Exception:
        return False, "Invalid URL structure.", ""

    if parsed.scheme not in ('http', 'https'):
        return False, "Only http:// and https:// URLs are supported.", ""

    hostname = parsed.hostname
    if not hostname:
        return False, "Invalid domain or hostname in URL.", ""

    hostname_lower = hostname.lower()

    # SSRF Protection: Block localhost and internal hostnames/IPs
    blocked_hostnames = {
        'localhost', 'localhost.localdomain', '127.0.0.1', '0.0.0.0', 
        '::1', '[::1]', '0', 'broadcasthost'
    }
    if hostname_lower in blocked_hostnames:
        return False, f"Access to internal host '{hostname}' is restricted for security (SSRF Protection).", ""

    # Check for direct IP address input or private IP ranges
    try:
        ip_obj = ipaddress.ip_address(hostname_lower)
        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved or ip_obj.is_multicast:
            return False, f"Access to private/internal IP '{hostname}' is restricted.", ""
    except ValueError:
        # Not a direct IP literal, check hostname structure
        if '.' not in hostname_lower and hostname_lower != 'localhost':
            return False, f"Invalid domain name format '{hostname}'.", ""
            
        # Optional DNS resolution test for SSRF against resolved private IPs
        try:
            resolved_ip = socket.gethostbyname(hostname_lower)
            ip_obj = ipaddress.ip_address(resolved_ip)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local:
                return False, f"Domain '{hostname}' resolves to a private IP address ({resolved_ip}). Access restricted.", ""
        except (socket.gaierror, ValueError):
            # If DNS resolution fails here, we still allow adding the URL so monitor can attempt check
            pass

    return True, url_str, hostname

def perform_http_check(url: str, timeout: int = 10) -> Dict[str, Any]:
    """
    Performs an actual HTTP GET request and calculates metrics:
    - Status (ONLINE, DEGRADED, OFFLINE)
    - HTTP status code
    - Response time (ms)
    - Response size
    - Error message (if applicable)
    """
    headers = {
        'User-Agent': 'PulseWatch-Observability/1.0 (+https://pulsewatch.local)'
    }
    
    start_time = time.perf_counter()
    try:
        response = requests.get(url, timeout=timeout, headers=headers, allow_redirects=True)
        end_time = time.perf_counter()
        
        response_time_ms = round((end_time - start_time) * 1000.0, 2)
        
        # Calculate response size
        content_len = response.headers.get('Content-Length')
        if content_len and content_len.isdigit():
            size_bytes = int(content_len)
        else:
            size_bytes = len(response.content)
            
        formatted_size = format_bytes(size_bytes)
        http_code = response.status_code
        
        if 200 <= http_code < 400:
            if response_time_ms > 1000.0:
                status = 'DEGRADED'
                error_msg = f"Slow response time ({response_time_ms} ms exceeds 1000 ms threshold)"
            else:
                status = 'ONLINE'
                error_msg = None
        else:
            status = 'OFFLINE'
            error_msg = f"HTTP {http_code} Server Error"

        return {
            'status': status,
            'http_status': http_code,
            'response_time': response_time_ms,
            'response_size': formatted_size,
            'error_message': error_msg
        }

    except requests.exceptions.Timeout:
        return {
            'status': 'OFFLINE',
            'http_status': None,
            'response_time': None,
            'response_size': 'Not available',
            'error_message': f'Connection timed out ({timeout}s threshold exceeded)'
        }
    except requests.exceptions.SSLError:
        return {
            'status': 'OFFLINE',
            'http_status': None,
            'response_time': None,
            'response_size': 'Not available',
            'error_message': 'SSL Certificate Verification Failed'
        }
    except requests.exceptions.ConnectionError:
        return {
            'status': 'OFFLINE',
            'http_status': None,
            'response_time': None,
            'response_size': 'Not available',
            'error_message': 'Unable to reach website (DNS resolution failed or connection refused)'
        }
    except requests.exceptions.RequestException as e:
        return {
            'status': 'OFFLINE',
            'http_status': None,
            'response_time': None,
            'response_size': 'Not available',
            'error_message': f'HTTP Request failed: {str(e)}'
        }
