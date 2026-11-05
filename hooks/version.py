"""Sets config.extra.version from package.json, so the site always names the extension's current version. Also adds
each extra CSS and JS file's content hash to its URL, so a deploy never pairs new pages with a cached old stylesheet
(GitHub Pages lets browsers keep files for 10 minutes)."""
import hashlib
import json
from pathlib import Path


def _versioned(docs: Path, path: str) -> str:
    """path?v=<hash of the file>, or path as it is when it isn't a local file."""
    file = docs / path.split("?")[0]
    if not file.is_file():
        return path
    return f"{path.split('?')[0]}?v={hashlib.sha256(file.read_bytes()).hexdigest()[:10]}"


def on_config(config):
    package = Path(config.config_file_path).parent / "package.json"
    config.extra["version"] = json.loads(package.read_text(encoding="utf-8"))["version"]
    docs = Path(config.docs_dir)
    config.extra_css = [_versioned(docs, p) for p in config.extra_css]
    scripts = []
    for script in config.extra_javascript:
        if isinstance(script, str):
            script = _versioned(docs, script)
        else:
            script.path = _versioned(docs, script.path)
        scripts.append(script)
    config.extra_javascript = scripts
    return config
