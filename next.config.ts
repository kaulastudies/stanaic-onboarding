import type { NextConfig } from "next";
const config: NextConfig = {
  async redirects() {
    const pages = ['index', 'institution', 'research', 'journal', 'learning', 'membership', 'governance', 'network', 'architecture'];
    return pages.flatMap(page => {
      const destination = page === 'index' ? '/' : page === 'network' ? '/partnerships' : `/${page}`;
      return [`/institutional/${page}.html`, `/${page}.html`, `/institutional/${page}`].map(source => ({source, destination, permanent:true}));
    });
  },
  async rewrites() {
    return {beforeFiles: [
      {source:'/', destination:'/institutional/index.html'},
      ...['institution', 'research', 'journal', 'learning', 'membership', 'governance', 'architecture'].map(page => ({source:`/${page}`, destination:`/institutional/${page}.html`})),
      {source:'/partnerships', destination:'/institutional/network.html'},
    ]};
  },
  outputFileTracingIncludes: { "/api/*": ["./db/schema.sql", "./db/platform.sql"] },
  async headers() { return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "X-Frame-Options", value: "DENY" }] }]; },
};
export default config;
