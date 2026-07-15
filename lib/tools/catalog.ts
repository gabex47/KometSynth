import type { ToolCategory, ToolDefinition } from "@/lib/types";

type CatalogSeed = [id: string, name: string, description: string, tags?: string[]];

const catalogs: Record<ToolCategory, CatalogSeed[]> = {
  developer: [
    ["json-formatter", "JSON Formatter", "Format, minify, and validate JSON.", ["format", "validate"]],
    ["yaml-converter", "YAML Converter", "Convert JSON data into readable YAML.", ["json", "convert"]],
    ["xml-formatter", "XML Formatter", "Indent and inspect XML documents.", ["format"]],
    ["base64", "Base64 Codec", "Encode or decode Base64 text.", ["encode", "decode"]],
    ["url-codec", "URL Codec", "Encode and decode URL components.", ["encode", "decode"]],
    ["jwt-decoder", "JWT Inspector", "Inspect JWT headers and payloads locally.", ["token", "security"]],
    ["uuid-generator", "UUID Generator", "Generate cryptographically random UUIDs.", ["random"]],
    ["nanoid-generator", "Nano ID Generator", "Create compact, URL-safe identifiers.", ["random"]],
    ["password-generator", "Password Generator", "Create strong random passwords.", ["security", "random"]],
    ["hash-generator", "Hash Generator", "Create SHA-256, SHA-384, or SHA-512 digests.", ["sha", "checksum"]],
    ["md5-generator", "MD5 Generator", "Create legacy MD5 checksums for compatibility.", ["checksum"]],
    ["hmac-generator", "HMAC Generator", "Generate keyed message authentication codes.", ["security", "hash"]],
    ["timestamp-converter", "Timestamp Converter", "Convert Unix time and ISO dates.", ["date", "unix"]],
    ["regex-tester", "Regex Tester", "Test expressions and inspect matches.", ["pattern"]],
    ["html-preview", "HTML Preview", "Preview isolated HTML markup.", ["web"]],
    ["css-formatter", "CSS Formatter", "Beautify or minify CSS.", ["format", "minify"]],
    ["js-formatter", "JavaScript Formatter", "Beautify or minify JavaScript.", ["format", "minify"]],
    ["sql-formatter", "SQL Formatter", "Format common SQL statements.", ["database"]],
    ["color-converter", "Color Converter", "Convert HEX and RGB values.", ["design"]],
    ["qr-generator", "QR Code Generator", "Build a scannable QR code from text.", ["image"]],
    ["text-diff", "Text Diff", "Compare two text blocks line by line.", ["compare"]],
    ["markdown-editor", "Markdown Editor", "Write and preview Markdown safely.", ["text", "preview"]],
    ["cron-generator", "Cron Builder", "Create and explain cron expressions.", ["schedule"]],
  ],
  network: [
    ["ip-lookup", "IP Information", "Inspect public IP registration details.", ["ip"]],
    ["dns-lookup", "DNS Lookup", "Resolve A, AAAA, MX, TXT, and CNAME records.", ["domain"]],
    ["reverse-dns", "Reverse DNS", "Find hostnames associated with an IP.", ["ip", "domain"]],
    ["whois", "WHOIS Lookup", "Review public domain registration data.", ["domain"]],
    ["headers", "HTTP Header Viewer", "Inspect response headers safely.", ["http"]],
    ["ssl-inspector", "SSL Certificate", "Inspect certificate identity and validity.", ["tls", "security"]],
    ["domain-info", "Domain Information", "View consolidated domain diagnostics.", ["domain"]],
    ["asn-lookup", "ASN Lookup", "Look up public autonomous system metadata.", ["ip"]],
    ["geoip", "GeoIP Lookup", "Estimate the public region for an IP address.", ["ip"]],
    ["user-agent", "User Agent Parser", "Parse browser and device user agents.", ["http"]],
    ["http-status", "HTTP Status Lookup", "Explain standard HTTP status codes.", ["http"]],
    ["mime-lookup", "MIME Type Lookup", "Find common media types by extension.", ["http"]],
    ["open-graph", "Open Graph Preview", "Preview public social metadata.", ["seo"]],
    ["robots", "robots.txt Viewer", "Review a site's crawler policy.", ["seo"]],
    ["sitemap", "sitemap.xml Viewer", "Inspect a site's public sitemap.", ["seo"]],
  ],
  security: [
    ["password-strength", "Password Strength", "Estimate password entropy locally.", ["password"]],
    ["secure-hash", "Secure Hash", "Generate modern SHA digests locally.", ["hash"]],
    ["security-headers", "Security Headers", "Review defensive HTTP headers.", ["http", "csp"]],
    ["csp-analyzer", "CSP Analyzer", "Inspect a Content Security Policy.", ["http"]],
    ["cookie-inspector", "Cookie Inspector", "Parse cookie attributes locally.", ["http"]],
    ["cors-checker", "CORS Checker", "Review cross-origin response policy.", ["http"]],
    ["dns-security", "DNS Security Records", "Inspect SPF, DKIM, and DMARC records.", ["dns", "email"]],
    ["file-hash", "File Hash Checker", "Calculate a local file checksum.", ["file", "hash"]],
    ["entropy", "Entropy Calculator", "Estimate information density in text.", ["analysis"]],
    ["unicode", "Unicode Converter", "Inspect code points and escaped forms.", ["text"]],
    ["hex-viewer", "Hex Viewer", "Inspect text or file bytes in hexadecimal.", ["binary"]],
    ["binary-converter", "Binary Converter", "Convert decimal, binary, and hex values.", ["number"]],
  ],
  utilities: [
    ["calculator", "Calculator", "Evaluate everyday arithmetic safely.", ["math"]],
    ["unit-converter", "Unit Converter", "Convert common length and weight units.", ["convert"]],
    ["currency-converter", "Currency Converter", "Convert currencies with supplied rates.", ["money"]],
    ["timezone-converter", "Time Zone Converter", "Compare times across global zones.", ["date"]],
    ["lorem-ipsum", "Lorem Ipsum", "Generate placeholder copy.", ["text"]],
    ["random-generator", "Random Generator", "Generate secure numbers and selections.", ["random"]],
    ["random-name", "Random Name", "Create neutral sample names.", ["random"]],
    ["slug-generator", "Slug Generator", "Turn titles into URL-safe slugs.", ["text", "url"]],
    ["text-counter", "Text Counter", "Count words, characters, lines, and reading time.", ["text"]],
    ["case-converter", "Case Converter", "Change text casing instantly.", ["text"]],
    ["clipboard-history", "Clipboard History", "Keep temporary clipboard items in this browser.", ["local"]],
    ["notes", "Quick Notes", "Keep private notes in local browser storage.", ["local", "text"]],
    ["file-converter", "File Converter", "Run safe client-side text conversions.", ["file"]],
  ],
};

export const tools: ToolDefinition[] = Object.entries(catalogs).flatMap(([category, items]) =>
  items.map(([id, name, description, tags = []]) => ({
    id,
    name,
    description,
    category: category as ToolCategory,
    tags,
    available: true,
  })),
);

export const toolCategories = [
  { id: "developer", label: "Developer" },
  { id: "network", label: "Network" },
  { id: "security", label: "Security" },
  { id: "utilities", label: "Utilities" },
] as const;

export function getTool(id: string) {
  return tools.find((tool) => tool.id === id);
}
