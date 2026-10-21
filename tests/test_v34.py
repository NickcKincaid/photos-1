"""V34 private editor structure regression tests, without browser dependencies."""
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class _Panels(HTMLParser):
    def __init__(self):
        super().__init__();self.names=[];self.summary_count=0;self.stack=[]
    def handle_starttag(self,tag,attrs):
        attr=dict(attrs)
        if tag=='details' and 'admin-panel' in attr.get('class','').split():
            self.names.append(attr.get('data-panel'));self.stack.append('details')
        if tag=='summary' and self.stack:self.summary_count+=1
    def handle_endtag(self,tag):
        if tag=='details' and self.stack:self.stack.pop()

class EditorV34Tests(unittest.TestCase):
    def test_explicit_panel_groups(self):
        html=(ROOT/'static/admin.html').read_text()
        p=_Panels();p.feed(html)
        self.assertEqual(len(p.names),11)
        self.assertEqual(len(p.names),len(set(p.names)))
        self.assertEqual(p.summary_count,len(p.names))
        self.assertFalse(p.stack)
        for needed in ('project-details','uploads','batch-edit','ai-descriptions','integrity','photo-list','sharing','note-editor','r2-storage','analytics','backups'):
            self.assertIn(needed,p.names)
    def test_project_actions_and_link_without_old_deployment_widget(self):
        html=(ROOT/'static/admin.html').read_text()
        for token in ('id="publish"','id="preview-project"','id="v34-cancel-changes"','id="delete-project"','View actual Workers AI usage in Cloudflare','src="/admin/admin-ui.js"'):
            self.assertIn(token,html)
        self.assertNotIn('admin-deployment.js',html)
        self.assertNotIn('Cloudflare deployments ↗',html)
        self.assertNotIn('id="deploy-indicator"',html)
        self.assertNotIn('id="deployment-refresh"',html)
    def test_ui_handles_validation_without_old_dom_observer(self):
        js=(ROOT/'static/admin-ui.js').read_text()
        self.assertIn("addEventListener('invalid'",js)
        self.assertIn('PortfolioDiscardChanges',js)
        self.assertNotIn('portfolio-ai-v33-usage',js)
        self.assertNotIn('MutationObserver',js)
