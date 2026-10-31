// The public home document is served by the beforeFiles rewrite in next.config.ts.
// Keep a usable fallback rather than a redirect loop if a host disables rewrites.
export default function Home(){return <main><h1>STANAIC</h1><p>International Artificial Intelligence Committee</p><a href="/institution">Explore the institution</a></main>;}
