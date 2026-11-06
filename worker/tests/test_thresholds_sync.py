"""The About page documents thresholds from web/lib/thresholds.json — keep it in sync."""

import json
from pathlib import Path

from flarewatch.config import Settings

WEB_THRESHOLDS = Path(__file__).resolve().parents[2] / "web" / "lib" / "thresholds.json"


def test_web_thresholds_match_config():
    expected = Settings(_env_file=None).thresholds()
    actual = json.loads(WEB_THRESHOLDS.read_text())
    assert actual == expected, (
        "web/lib/thresholds.json is out of date; regenerate with:\n"
        '  python -c "import json; from flarewatch.config import Settings; '
        'print(json.dumps(Settings(_env_file=None).thresholds(), indent=2))"'
        " > ../web/lib/thresholds.json"
    )
