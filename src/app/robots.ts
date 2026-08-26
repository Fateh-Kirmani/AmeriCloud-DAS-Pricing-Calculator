// src/app/robots.ts
//
// No robots.txt existed anywhere in the app before this. Added specifically so /import (a plain
// GET that creates a project as a side effect — see src/app/import/route.ts) isn't crawled; kept
// otherwise permissive since nothing else in the app has ever asked to be excluded.
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/import'],
    },
  };
}
