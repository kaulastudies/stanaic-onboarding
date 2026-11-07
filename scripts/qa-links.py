#!/usr/bin/env python3
"""Read-only STANAIC route/link/asset audit using only Python's standard library.

Run: python scripts/qa-links.py --base-url https://… --output-prefix docs/qa-YYYY-MM-DD-links
No authentication, form submissions, account changes, or external side effects.
HTTP success proves availability only; controls are inventoried, not exercised.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGE_MAP = {"index": "/", "institution": "/institution", "research": "/research", "journal": "/journal", "learning": "/learning", "membership": "/membership", "governance": "/governance", "network": "/partnerships", "architecture": "/architecture"}
EXTRA_PAGES = ["/access", "/review-guide"]


class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs, self.ids, self.controls, self.options = [], set(), [], []
        self.current = None
        self.select = None
        self.title, self.in_title = "", False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "title":
            self.in_title = True
        if tag == "a" and a.get("href"):
            self.refs.append({"kind": "link", "href": a["href"]})
        if tag in ("img", "script", "iframe", "source", "video", "audio") and a.get("src"):
            self.refs.append({"kind": "asset", "href": a["src"]})
        if tag == "link" and a.get("href"):
            self.refs.append({"kind": "asset", "href": a["href"]})
        if tag in ("button", "select", "input", "textarea", "form", "summary"):
            control = {"tag": tag, **{k: v for k, v in a.items() if k in ("id", "type", "name", "action", "method", "aria-label", "required", "disabled")}}
            self.controls.append(control)
            if tag in ("button", "summary"):
                self.current = control
                control["text"] = ""
            if tag == "select":
                self.select = a.get("id") or a.get("name") or "unnamed"
        if tag == "option":
            self.current = {"tag": "option", "select": self.select, "value": a.get("value"), "text": ""}
            self.options.append(self.current)

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.current is not None:
            self.current["text"] += data

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if self.current and tag == self.current["tag"]:
            self.current["text"] = " ".join(self.current["text"].split())
            self.current = None
        if tag == "select":
            self.select = None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def fetch(url, *, redirect=True, timeout=20):
    result = {"url": url, "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    body = b""
    try:
        opener = urllib.request.build_opener() if redirect else urllib.request.build_opener(NoRedirect)
        request = urllib.request.Request(url, headers={"User-Agent": "STANAIC-ReadOnly-QA/1.0"})
        try:
            response = opener.open(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            response = error
        result.update(status=response.code, final_url=response.geturl(), location=response.headers.get("Location"), content_type=response.headers.get("Content-Type", ""))
        body = response.read(4 * 1024 * 1024)
        result["bytes"] = len(body)
        result["sha256"] = hashlib.sha256(body).hexdigest()
        if response.code in (401, 403, 429, 999):
            result["result"] = "blocked"
        elif response.code in (502, 503, 504):
            result["result"] = "unverified"
        else:
            result["result"] = "passed" if 200 <= response.code < 400 else "failed"
        if "text/html" in result["content_type"]:
            parser = Document()
            parser.feed(body.decode("utf-8", errors="replace"))
            result["title"] = parser.title.strip()
    except Exception as error:
        result.update(result="unverified", error=f"{type(error).__name__}: {error}")
    return result, body


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--base-url", default="https://stanaic-onboarding.vercel.app")
    cli.add_argument("--output-prefix", default="docs/qa-2026-11-07-links")
    cli.add_argument("--workers", type=int, default=4)
    cli.add_argument("--timeout", type=int, default=20)
    cli.add_argument("--skip-external", action="store_true")
    cli.add_argument("--external-assets", action="store_true", help="With --skip-external, still check external stylesheet/font/image dependencies")
    cli.add_argument("--private-name-pattern", help="Optional private-name expression; used in memory only and never saved in the report")
    args = cli.parse_args()
    base = args.base_url.rstrip("/")
    own_host = urllib.parse.urlparse(base).netloc
    occurrences, source_pages, live_pages = [], {}, {}
    controls, fragments, app_links, non_http = [], [], [], []
    source_ids = {}
    checks, bodies = {}, {}
    print(f"Checking {len(PAGE_MAP) + len(EXTRA_PAGES)} public and access/guide pages on {base}", flush=True)

    # Audit actual served documents as well as repository references.
    for name, path in PAGE_MAP.items():
        doc = Document()
        doc.feed((ROOT / "public/institutional" / (name + ".html")).read_text())
        source_pages[path] = {"source": f"public/institutional/{name}.html", "title": doc.title}
        source_ids[path] = doc.ids
        for ref in doc.refs:
            occurrences.append({"source": source_pages[path]["source"], "page": path, "scope": "source", **ref, "url": urllib.parse.urljoin(base + path, ref["href"])})
        controls.append({"page": path, "scope": "source", "controls": doc.controls, "options": doc.options})

    def get(url):
        return fetch(url, timeout=args.timeout)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        urls = [base + path for path in list(PAGE_MAP.values()) + EXTRA_PAGES]
        for url, (check, body) in zip(urls, pool.map(get, urls)):
            checks[url], bodies[url] = check, body
            path = urllib.parse.urlparse(url).path or "/"
            live_pages[path] = check
            if check.get("status") == 200 and "text/html" in check.get("content_type", ""):
                doc = Document()
                doc.feed(body.decode("utf-8", errors="replace"))
                live_pages[path] = {**check, "id_count": len(doc.ids), "ids": sorted(doc.ids)}
                controls.append({"page": path, "scope": "live_html", "controls": doc.controls, "options": doc.options})
                for ref in doc.refs:
                    occurrences.append({"source": path, "page": path, "scope": "live_html", **ref, "url": urllib.parse.urljoin(url, ref["href"])})

    # Literal Next.js links and option values are source coverage, not a claim
    # that dynamic record links or role-dependent controls were exercised.
    app_options = []
    dynamic_hrefs = []
    for file in sorted((ROOT / "app").rglob("*.tsx")):
        text = file.read_text()
        name = str(file.relative_to(ROOT))
        route_parts = file.parent.relative_to(ROOT / "app").parts
        source_route = "/" + "/".join(route_parts) if (file.parent / "page.tsx").exists() and not any("[" in part for part in route_parts) else "/"
        for match in re.finditer(r"href\s*=\s*(['\"])(.*?)\1", text):
            href = match.group(2)
            app_links.append({"source": name, "source_route": source_route, "href": href, "url": urllib.parse.urljoin(base + source_route, href)})
        for match in re.finditer(r"href\s*=\s*\{([^}]+)\}", text):
            expression = match.group(1)
            dynamic_hrefs.append({"source": name, "expression": expression[:300]})
            # Conditional constant strings can still be checked read-only.
            for href in re.findall(r"['\"](/[^'\"]*)['\"]", expression):
                if "${" not in href:
                    app_links.append({"source": name, "href": href, "url": urllib.parse.urljoin(base + "/", href), "conditional": True})
        for match in re.finditer(r"<option\b([^>]*)>(.*?)</option>", text, re.S):
            attrs, label = match.groups()
            value = re.search(r"value=['\"]([^'\"]*)", attrs)
            app_options.append({"source": name, "value": value.group(1) if value else None, "label": re.sub(r"<[^>]+>", "", label), "dynamic": "{" in label or "{" in attrs})

    # CSS import/url references are otherwise invisible to an HTML href crawl.
    css_refs = []
    for css in sorted((ROOT / "public/institutional/assets").glob("*.css")):
        relative = str(css.relative_to(ROOT / "public"))
        for href in re.findall(r"url\(\s*['\"]?([^'\")]+)", css.read_text()):
            css_refs.append({"source": str(css.relative_to(ROOT)), "kind": "css_asset", "href": href, "url": urllib.parse.urljoin(base + "/" + relative, href)})

    refs = occurrences + app_links + css_refs
    targets = set()
    for ref in refs:
        parsed = urllib.parse.urlparse(ref["url"])
        if parsed.scheme in ("http", "https"):
            if not args.skip_external or parsed.netloc == own_host or (args.external_assets and ref.get("kind") in ("asset", "css_asset")):
                targets.add(urllib.parse.urldefrag(ref["url"])[0])
        else:
            non_http.append(ref)
        if parsed.netloc == own_host and parsed.fragment:
            path = parsed.path or "/"
            # Known static target fragments are checked against served IDs.
            ids = live_pages.get(path, {}).get("ids")
            if ids is not None:
                fragments.append({**ref, "target_path": path, "exists_live": parsed.fragment in ids, "exists_source": parsed.fragment in source_ids.get(path, set())})

    pending = sorted(targets - checks.keys())
    print(f"Checking {len(pending)} additional unique HTTP targets", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for url, (check, body) in zip(pending, pool.map(get, pending)):
            checks[url], bodies[url] = check, body

    # Follow stylesheet dependencies once, including hosted font binaries.
    # Data URLs are embedded assets and do not need an HTTP request.
    dependency_refs = []
    for url, row in list(checks.items()):
        if row.get("status") == 200 and "text/css" in row.get("content_type", ""):
            css_body = bodies.get(url, b"").decode("utf-8", errors="replace")
            for href in re.findall(r"url\(\s*['\"]?([^'\")]+)", css_body):
                target = urllib.parse.urljoin(url, href)
                parsed = urllib.parse.urlparse(target)
                if parsed.scheme in ("http", "https"):
                    dependency_refs.append({"source": url, "href": href, "url": target, "kind": "stylesheet_dependency"})
    dependency_urls = sorted(set(ref["url"] for ref in dependency_refs) - checks.keys())
    if args.skip_external and not args.external_assets:
        dependency_urls = [url for url in dependency_urls if urllib.parse.urlparse(url).netloc == own_host]
    print(f"Checking {len(dependency_urls)} stylesheet dependencies", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for url, (check, body) in zip(dependency_urls, pool.map(get, dependency_urls)):
            checks[url], bodies[url] = check, body

    # Retry external transient failures once, with a smaller pool. Keep both
    # observations. Never classify access walls or timeouts as broken links.
    retry_urls = sorted(url for url, row in checks.items() if row["result"] == "unverified" and urllib.parse.urlparse(url).netloc != own_host)
    print(f"Retrying {len(retry_urls)} external transient failures once", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(2, args.workers)) as pool:
        for url, (check, body) in zip(retry_urls, pool.map(get, retry_urls)):
            check["previous_observation"] = checks[url]
            checks[url], bodies[url] = check, body

    # Read-only public catalogue: dynamic released records are not in HTML.
    catalogue_url = base + "/api/platform/catalogue"
    print("Checking public catalogue and its released record URLs", flush=True)
    catalogue_check, catalogue_body = get(catalogue_url)
    catalogue = {"http": catalogue_check}
    if catalogue_check.get("status") == 200:
        try:
            data = json.loads(catalogue_body)
            catalogue["collections"] = {key: len(value) for key, value in data.items() if isinstance(value, list)}
            catalogue["keys"] = sorted(data)
            dynamic_urls = []
            for item in data.get("resources", []):
                if item.get("url"):
                    dynamic_urls.append(item["url"])
            for item in data.get("publications", []):
                if item.get("id"):
                    dynamic_urls.append("/publications/" + urllib.parse.quote(str(item["id"]), safe=""))
            catalogue["dynamic_urls"] = dynamic_urls
            for href in dynamic_urls:
                url = urllib.parse.urljoin(base + "/", href)
                if url not in checks and (not args.skip_external or urllib.parse.urlparse(url).netloc == own_host):
                    checks[url], bodies[url] = get(url)
        except Exception as error:
            catalogue["parse_error"] = str(error)

    # Independently verify all 27 historical bookmarks preserve a query string.
    legacy_cases = []
    for name, clean in PAGE_MAP.items():
        for old in (f"/institutional/{name}.html", f"/{name}.html", f"/institutional/{name}"):
            legacy_cases.append((old, clean))

    def legacy(case):
        old, clean = case
        row, _ = fetch(base + old + "?qa=links", redirect=False, timeout=args.timeout)
        location = urllib.parse.urlparse(row.get("location") or "")
        row.update(path=old, expected_path=clean, passed=row.get("status") == 308 and location.path == clean and location.query == "qa=links")
        return row

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        print(f"Checking {len(legacy_cases)} legacy redirects", flush=True)
        redirects = list(pool.map(legacy, legacy_cases))

    # Source-only privacy/name scan. Avoid copying any detected private value
    # into the report; record a category/count/location instead.
    privacy = []
    patterns = {"personal_email_domain": r"[\w.+-]+@(?:gmail|yahoo|outlook|hotmail)\.[\w.-]+", "bank_or_upi_marker": r"\b(?:account\s*(?:number|no\.?)|ifsc|upi\s*id)\s*[:=]\s*[\"\']?[A-Z0-9][A-Z0-9@._-]{5,}", "public_chair_name": r"GuoMing|guomingxu"}
    if args.private_name_pattern:
        patterns["configured_private_name"] = args.private_name_pattern
    for folder in ("public", "app", "lib", "scripts"):
        for file in sorted((ROOT / folder).rglob("*")):
            if file.is_file() and file.suffix in (".html", ".js", ".mjs", ".ts", ".tsx", ".json", ".md", ".py"):
                text = file.read_text(errors="replace")
                for category, pattern in patterns.items():
                    if file.resolve() == pathlib.Path(__file__).resolve() and category == "public_chair_name":
                        continue  # The scanner's public-chair expression is not site content.
                    matches = list(re.finditer(pattern, text, re.I))
                    if matches:
                        privacy.append({"source": str(file.relative_to(ROOT)), "category": category, "count": len(matches), "line_numbers": sorted(set(text.count("\n", 0, match.start()) + 1 for match in matches))})

    data = {"base_url": base, "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "scope": "Read-only HTTP GET, served HTML, repository link/control inventory and source-only privacy scan", "summary": {"public_pages": len(PAGE_MAP), "served_pages": len(live_pages), "unique_fragment_targets": len(set(row["url"] for row in fragments)), "source_anchor_instances": sum(x["scope"] == "source" and x["kind"] == "link" for x in occurrences), "live_anchor_instances": sum(x["scope"] == "live_html" and x["kind"] == "link" for x in occurrences), "app_link_instances": len(app_links), "http_targets": len(checks), "http_results": dict(Counter(row["result"] for row in checks.values())), "internal_http_results": dict(Counter(row["result"] for url, row in checks.items() if urllib.parse.urlparse(url).netloc == own_host)), "fragment_checks": len(fragments), "broken_fragments": sum(not row["exists_live"] for row in fragments), "legacy_redirects_passed": sum(row["passed"] for row in redirects), "legacy_redirects_total": len(redirects)}, "public_pages": live_pages, "references": occurrences, "app_links": app_links, "dynamic_app_hrefs": dynamic_hrefs, "css_references": css_refs, "stylesheet_dependencies": dependency_refs, "controls": controls, "app_options": app_options, "fragments": fragments, "non_http_references": non_http, "http_checks": [checks[url] for url in sorted(checks)], "catalogue": catalogue, "legacy_redirects": redirects, "source_privacy_scan": privacy, "privacy_scan_configuration": {"folders": ["public", "app", "lib", "scripts"], "private_name_pattern_applied": bool(args.private_name_pattern), "private_pattern_saved": False}, "limitations": ["A successful GET does not prove a link's business workflow or any button works. Controls/options are inventoried for browser coverage by the UI audit.", "Protected pages may return a sign-in shell with HTTP 200; no authentication was attempted.", "Template/generated record URLs and JavaScript-created content require separate workflow/browser evidence.", "No email, payment, LinkedIn posting, credential issuance, or account change was triggered.", "External timeouts and 502/503/504 responses remain unverified; 401/403/429/999 are access blocks, not proof of broken destinations.", "Source privacy scan is pattern-based and does not establish absence of every possible personal value."]}
    output = ROOT / args.output_prefix
    output.parent.mkdir(parents=True, exist_ok=True)
    output.with_suffix(".json").write_text(json.dumps(data, indent=2) + "\n")
    lines = ["# STANAIC read-only link audit", "", f"Target: {base}", f"Captured: {data['captured_at']}", "", "## Coverage", ""]
    lines += [f"- {key}: {value}" for key, value in data["summary"].items()]
    lines += ["", "## HTTP targets", "", "| Result | HTTP | Target |", "|---|---:|---|"]
    lines += [f"| {row['result']} | {row.get('status', '—')} | {row['url']} |" for row in data["http_checks"]]
    lines += ["", "## Public controls and options", ""]
    for entry in controls:
        if entry["scope"] != "live_html":
            continue
        control_labels = [x.get("aria-label") or x.get("text") or x.get("id") or x.get("type") or x["tag"] for x in entry["controls"]]
        lines.append(f"- {entry['page']}: {', '.join(control_labels)}")
        if entry["options"]:
            lines.append("  - Options: " + "; ".join(x["text"] for x in entry["options"]))
    lines += ["", "## Source privacy/name scan", "", "Only category, count and source location are recorded. Public chair identity is an intentional public institutional reference; personal-name/email/bank categories require review if present.", ""]
    lines += [f"- {row['source']}: {row['category']} ({row['count']}; lines {', '.join(map(str, row['line_numbers']))})" for row in privacy] or ["- No configured patterns matched."]
    lines += ["", "## Limits", ""] + ["- " + note for note in data["limitations"]]
    output.with_suffix(".md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"output_prefix": str(output), **data["summary"]}, indent=2))


if __name__ == "__main__":
    main()
