import sys, re, json
from pathlib import Path

def strip_html(html_text: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", html_text, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def main(root: Path, out: Path):
    items = []
    for p in root.rglob("*.html"):
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            t = p.read_text(errors="ignore")
        m = re.search(r"<title>(.*?)</title>", t, flags=re.IGNORECASE|re.DOTALL)
        title = m.group(1).strip() if m else p.stem
        text = strip_html(t)
        items.append({
            "title": title,
            "path": str(p.relative_to(root)),
            "anchor": "",
            "text": text
        })
    out.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Index mit {len(items)} Seiten geschrieben nach {out}")

if __name__ == "__main__":
    # Beispiel: python index_build.py "../../"  -> schreibt site_index.json neben dieses Script
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("../../")
    out = Path(__file__).parent / "site_index.json"
    main(root, out)