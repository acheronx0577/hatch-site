import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..", "..");

describe("favicons and manifest", () => {
  it("routes favicons to Hatch Icon.jpg", () => {
    const vercel = JSON.parse(readFileSync(path.join(projectRoot, "vercel.json"), "utf8"));
    const dests = vercel.routes
      .filter((route: { src: string }) => ["/favicon.ico", "/favicon.png"].includes(route.src))
      .map((route: { dest: string }) => route.dest);
    expect(dests).toEqual(["Hatch Icon.jpg", "Hatch Icon.jpg"]);
  });

  it("links manifest and icons from index.html", () => {
    const html = readFileSync(path.join(projectRoot, "index.html"), "utf8");
    expect(html).toContain('/Hatch Icon.jpg');
    expect(html).toContain('rel="manifest" href="/site.webmanifest"');
  });
});
