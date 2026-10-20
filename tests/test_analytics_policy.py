"""Guard CSP support for optional Cloudflare analytics without loosening admin policy."""
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

class AnalyticsPolicyTests(unittest.TestCase):
    def test_public_policy_allows_cloudflare_beacon_and_uploads_stay_private(self):
        headers=(ROOT/'static'/'_headers').read_text()
        admin=(ROOT/'static'/'admin.html').read_text()
        self.assertIn("script-src 'self' https://static.cloudflareinsights.com/beacon.min.js",headers)
        self.assertIn("connect-src 'self' https://cloudflareinsights.com",headers)
        self.assertIn("script-src 'self';",admin)
        self.assertNotIn('cloudflareinsights.com',admin)
        self.assertIn('Cache-Control: private, no-store',headers)
