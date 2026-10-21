export const site = {
  name: "Kinetiq",
  tagline: "Motion components, ready to ship.",
  description:
    "A hand-curated library of scroll, WebGL, hover, text and transition effects. Watch every component live, then star the repo to unlock the full source.",
  author: "Meet Chauhan",
  authorGithub: "Meet-1010",
  /** The public repo visitors must star to unlock downloads. */
  starRepo: process.env.NEXT_PUBLIC_STAR_REPO ?? "Meet-1010/kinetiq",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export const repoUrl = `https://github.com/${site.starRepo}`;
