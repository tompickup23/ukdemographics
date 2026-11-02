"""DHSC workbook layout regressions, using schema cells rather than statistical fixtures."""
import importlib.util
import unittest
from pathlib import Path

import pandas as pd

spec = importlib.util.spec_from_file_location(
    "asc", Path(__file__).resolve().parents[1] / "scripts/transform/transform_asc.py"
)
asc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(asc)


class AscSchemaTests(unittest.TestCase):
    def test_name_aliases_and_moved_columns(self):
        for label in ("LA name", "Local authority name"):
            with self.subTest(label=label):
                frame = pd.DataFrame([["Title", None, None], ["Total", label, "Geography code"]])
                row, columns = asc.header_map(frame, {"name": ("LA name", "Local authority name"), "code": "Geography code", "total": "Total"})
                self.assertEqual((row, columns), (1, {"name": 1, "code": 2, "total": 0}))

    def test_ambiguous_or_missing_name_is_rejected(self):
        for labels in (["LA name", "Local authority name"], ["Unrelated name"]):
            with self.subTest(labels=labels), self.assertRaises(SystemExit):
                asc.header_map(pd.DataFrame([labels]), {"name": ("LA name", "Local authority name")})

    def test_comparison_title_variants_and_ambiguity(self):
        subject = r"Gross current expenditure per 100,000 adults, year(?: |\x2d)on(?: |\x2d)year comparison"
        book = {}
        for index, wording in enumerate(("year on year", "year\x2don\x2dyear")):
            frame = pd.DataFrame([[f"Table 16: gross current expenditure per 100,000 adults, {wording} comparison, 2025 to 2026"]])
            asc.find_table({str(index): frame}, subject)
            book[str(index)] = frame
        with self.assertRaises(SystemExit):
            asc.find_table(book, subject)
        with self.assertRaises(SystemExit):
            asc.find_table({"wrong": pd.DataFrame([["Table 16: net expenditure, 2025 to 2026"]])}, subject)


if __name__ == "__main__":
    unittest.main()
