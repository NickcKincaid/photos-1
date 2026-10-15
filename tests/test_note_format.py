"""Safety and functionality of the restricted Notes markup renderer."""
import unittest
from note_format import render_note, embed_for_url


class NoteFormatTests(unittest.TestCase):
    def test_basic_formatting_and_escaping(self):
        text = '# My **Heading**\n\nHello *world* and `code` <script>alert(1)</script>\n\n- One\n- Two\n\n> Quoted'
        html = render_note(text)
        self.assertIn('<h2>My <strong>Heading</strong></h2>', html)
        self.assertIn('<em>world</em>', html)
        self.assertIn('<code>code</code>', html)
        self.assertIn('&lt;script&gt;', html)
        self.assertNotIn('<script>', html)
        self.assertIn('<ul><li>One</li><li>Two</li></ul>', html)
        self.assertIn('<blockquote>Quoted</blockquote>', html)

    def test_approved_links_and_embeds(self):
        video = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=13s'
        music = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc'
        output = render_note('Visit [example](https://example.org/?x=1&y=2)\n\n'+video+'\n\n'+music)
        self.assertIn('href="https://example.org/?x=1&amp;y=2"', output)
        self.assertIn('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', output)
        self.assertIn('https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC', output)
        self.assertIn('loading="lazy"', output)
        self.assertIn('allowfullscreen', output)

    def test_rejects_arbitrary_html_and_untrusted_embeds(self):
        malicious = 'https://open.spotify.com.evil.com/track/4uLU6hMCjMI75M1A2tKUQC'
        self.assertIsNone(embed_for_url(malicious))
        self.assertIsNone(embed_for_url('javascript:alert(1)'))
        self.assertIsNone(embed_for_url('https://youtube.com.evil.net/watch?v=dQw4w9WgXcQ'))
        output = render_note('<iframe src="https://evil.com"></iframe>\n\n'+malicious)
        self.assertNotIn('<iframe',output)
        self.assertIn('&lt;iframe',output)
        self.assertNotIn('<script',output)

    def test_legacy_plain_text(self):
        self.assertEqual(render_note('First line\nsecond line\n\nThird'), '<div class="note-body"><p>First line<br>second line</p><p>Third</p></div>')

if __name__ == '__main__':
    unittest.main()
