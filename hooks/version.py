"""Sets config.extra.version from package.json, so the site always names the extension's current version."""
import json
from pathlib import Path


def on_config(config):
    package = Path(config.config_file_path).parent / "package.json"
    config.extra["version"] = json.loads(package.read_text(encoding="utf-8"))["version"]
    return config
