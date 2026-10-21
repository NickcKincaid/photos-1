"""V35 admin settings, Cloudflare link and no fake usage tracker regressions."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
AI_URL='https://dash.cloudflare.com/0f2e0380eafff7a2d0f444bfb5efab09/ai/workers-ai/usage'

class Markup(HTMLParser):
    def __init__(self):
        super().__init__();self.panels=[];self.ids=[];self.external=[]
    def handle_starttag(self, tag, attrs):
        attr=dict(attrs)
        if attr.get('id'):self.ids.append(attr['id'])
        if tag=='details' and 'admin-panel' in attr.get('class','').split():self.panels.append(attr.get('data-panel'))
        if tag=='a' and 'dash.cloudflare.com' in attr.get('href',''):self.external.append(attr)

class V35Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(ROOT/'static/admin.html').read_text()
        cls.markup=Markup();cls.markup.feed(cls.html)

    def test_order_of_project_details_and_panels(self):
        s=self.html
        fields=['project-title','project-blurb','project-published','project-order']
        self.assertEqual(sorted(fields,key=lambda name:s.index('id="'+name+'"')),fields)
        panels=['project-details','uploads','photo-list','batch-edit','ai-descriptions','sharing','integrity']
        self.assertEqual(self.markup.panels[:7],panels)
        self.assertIn('Identity &amp; Description',s)
        self.assertIn('Visibility &amp; Homepage Order',s)
        self.assertIn('id="project-order" type="number" min="0"',s)

    def test_official_ai_usage_link_without_local_estimates(self):
        matching=[a for a in self.markup.external if a['href']==AI_URL]
        self.assertEqual(len(matching),1)
        self.assertEqual(matching[0].get('target'),'_blank')
        self.assertIn('noopener',matching[0].get('rel',''))
        self.assertNotIn('ai-usage',self.markup.panels)
        self.assertNotIn('id="v34-ai-usage"',self.html)
        self.assertNotIn('data-usage=',self.html)
        self.assertNotIn('portfolio-ai-v33-usage',(ROOT/'static/admin-ui.js').read_text())
        self.assertNotIn('portfolio-ai-v33-usage',(ROOT/'static/admin-describe.js').read_text())
        self.assertNotIn('record(', (ROOT/'static/admin-describe.js').read_text())

    def test_project_field_ids_unique_and_ai_still_works(self):
        self.assertEqual(len(self.markup.ids),len(set(self.markup.ids)))
        for name in ('project-title','project-blurb','project-published','project-order','publish','preview-project','generate-descriptions','stop-descriptions'):
            self.assertIn(name,self.markup.ids)
        desc=(ROOT/'functions/api/admin/describe.js').read_text()
        self.assertIn('env.AI.run(MODEL',desc)
        self.assertNotIn('extractUsage(',desc)
        self.assertEqual(len(self.markup.panels),12)

if __name__=='__main__':unittest.main()
