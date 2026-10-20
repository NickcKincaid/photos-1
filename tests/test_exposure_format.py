import unittest
from build import format_exposure_public, photo_info

class ExposurePresentationTest(unittest.TestCase):
    def test_normalizes_legacy_presentation(self):
        self.assertEqual(format_exposure_public('focal_length','35 mm'), '35mm')
        self.assertEqual(format_exposure_public('aperture','f8'), 'f/8')
        self.assertEqual(format_exposure_public('shutter_speed','1/250 s'), '1/250s')
        self.assertEqual(format_exposure_public('shutter_speed','0.008s'), '1/125s')
        self.assertEqual(format_exposure_public('iso','400'), 'ISO 400')
        self.assertEqual(photo_info('/media/cdmx/any.jpg', {'photo_details':[{'image':'/media/cdmx/any.jpg','focal_length':'35 mm','aperture':'f8','shutter_speed':'1/250 s','iso':'400'}]}), '35mm · f/8 · 1/250s · ISO 400')
    def test_unusual_existing_values_not_discarded(self):
        self.assertEqual(format_exposure_public('shutter_speed','Bulb'), 'Bulb')
