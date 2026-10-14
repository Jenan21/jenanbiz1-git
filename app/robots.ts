import type { MetadataRoute } from "next";

// Read on every request so the launch decision does not need a rebuild.
export const dynamic = "force-dynamic";

/** Crawlers are kept out until the owner approves the public launch; after it only the private areas stay closed. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.PUBLIC_LAUNCH !== "approved") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/user/", "/account/"] } };
}
