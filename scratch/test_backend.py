import os
import sys
import unittest

# Add root folder to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database
import monitor
from app import app

class TestPulseWatchBackend(unittest.TestCase):

    def setUp(self):
        # Set up test database
        database.init_db()
        self.app = app.test_client()
        self.app.testing = True

    def test_url_validation_and_ssrf(self):
        print("\n--- Testing URL Validation & SSRF Security Protection ---")
        
        # Test valid URLs
        valid, url, fallback = monitor.validate_and_normalize_url("example.com")
        self.assertTrue(valid)
        self.assertEqual(url, "https://example.com")
        self.assertEqual(fallback, "example.com")
        
        valid, url, _ = monitor.validate_and_normalize_url("http://google.com")
        self.assertTrue(valid)
        self.assertEqual(url, "http://google.com")

        # Test SSRF & localhost blocking
        valid, err, _ = monitor.validate_and_normalize_url("http://localhost:5000")
        self.assertFalse(valid)
        self.assertIn("SSRF Protection", err)

        valid, err, _ = monitor.validate_and_normalize_url("http://127.0.0.1:8080")
        self.assertFalse(valid)
        self.assertIn("restricted", err.lower())

        valid, err, _ = monitor.validate_and_normalize_url("192.168.1.1")
        self.assertFalse(valid)
        self.assertIn("restricted", err.lower())

        print("[OK] URL Validation & SSRF Security Protection passed!")

    def test_real_http_check(self):
        print("\n--- Testing Real HTTP Monitoring Checks ---")
        
        # Test real check against example.com
        res = monitor.perform_http_check("https://example.com")
        print(f"Check result for example.com: {res}")
        self.assertIn(res['status'], ['ONLINE', 'DEGRADED'])
        self.assertEqual(res['http_status'], 200)
        self.assertIsNotNone(res['response_time'])
        self.assertGreater(res['response_time'], 0)

        # Test HTTP 404 response handling
        res_404 = monitor.perform_http_check("https://httpbin.org/status/404")
        print(f"Check result for 404 endpoint: {res_404}")
        self.assertEqual(res_404['status'], 'OFFLINE')
        self.assertEqual(res_404['http_status'], 404)
        self.assertIn("404", res_404['error_message'])

        # Test unreachable domain connection error
        res_unreachable = monitor.perform_http_check("https://this-domain-definitely-does-not-exist-987654.org")
        print(f"Check result for unreachable domain: {res_unreachable}")
        self.assertEqual(res_unreachable['status'], 'OFFLINE')
        self.assertIsNone(res_unreachable['http_status'])
        self.assertIn("Unable to reach website", res_unreachable['error_message'])

        print("[OK] Real HTTP Monitoring checks passed!")

    def test_flask_api_workflow(self):
        print("\n--- Testing Flask REST API Workflow ---")
        
        # 1. Add website via API
        response = self.app.post('/api/websites', json={
            'name': 'Example Test',
            'url': 'example.com'
        })
        self.assertEqual(response.status_code, 201)
        data = response.get_json()
        self.assertTrue(data['success'])
        website_id = data['website']['id']
        self.assertEqual(data['website']['name'], 'Example Test')
        self.assertEqual(data['website']['url'], 'https://example.com')
        self.assertIn(data['initial_check']['status'], ['ONLINE', 'DEGRADED'])

        # 2. Get websites list
        response = self.app.get('/api/websites')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertGreaterEqual(len(data['websites']), 1)

        # 3. Trigger manual check for website
        response = self.app.post(f'/api/websites/{website_id}/check')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['latest_check']['website_id'], website_id)

        # 4. Get history for website
        response = self.app.get(f'/api/websites/{website_id}/history')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertGreaterEqual(len(data['history']), 2)

        # 5. Refresh All
        response = self.app.post('/api/check-all')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])

        # 6. Delete website
        response = self.app.delete(f'/api/websites/{website_id}')
        self.assertEqual(response.status_code, 200)

        print("[OK] Flask REST API Workflow passed!")

if __name__ == '__main__':
    unittest.main()
