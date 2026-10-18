// Sites where anyone can publish a page or that forward to arbitrary sites. Phishing
// often lives on them because the address shows a well-known domain (for example a fake
// sign-in page on sites.google.com). The dialog warns about them and the allowlist
// refuses them.

import { SHORTENER_DOMAINS } from "./shorteners.ts";

/**
 * Domains where anyone can publish a page or that forward to arbitrary sites. Allowing
 * one would let phishing hosted there skip the dialog.
 */
export const SHARED_HOSTING: readonly string[] = [
  // Google
  "sites.google.com",
  "docs.google.com",
  "drive.google.com",
  "script.google.com",
  "forms.gle",
  "googleusercontent.com",
  "storage.googleapis.com",
  "firebaseapp.com",
  "web.app",
  "appspot.com",
  "page.link",
  // Microsoft
  "sharepoint.com",
  "onedrive.live.com",
  "1drv.ms",
  "forms.office.com",
  "forms.microsoft.com",
  "sway.office.com",
  "azurewebsites.net",
  "blob.core.windows.net",
  "web.core.windows.net",
  // Hosting, builders and file sharing
  "github.io",
  "githubusercontent.com",
  "gitlab.io",
  "notion.site",
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "workers.dev",
  "herokuapp.com",
  "glitch.me",
  "repl.co",
  "replit.app",
  "blogspot.com",
  "wordpress.com",
  "wixsite.com",
  "weebly.com",
  "webflow.io",
  "framer.website",
  "carrd.co",
  "canva.site",
  "typeform.com",
  "jotform.com",
  "linktr.ee",
  "dropbox.com",
  "dropboxusercontent.com",
  "box.com",
  "amazonaws.com",
  "cloudfront.net",
  "ngrok.io",
  "ngrok-free.app",
  "trycloudflare.com",
  ...SHORTENER_DOMAINS,
];
