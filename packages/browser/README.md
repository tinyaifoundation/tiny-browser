# Tiny Browser SDK

A small browser-side library for agent browser use. See the [repository README](https://github.com/tinyaifoundation/tiny-browser) for the relay setup, security model, and demo.

```ts
import {
  TinyBrowser,
  IframeBrowserAdapter,
} from "@tinyaifoundation/tiny-browser";

const browser = new TinyBrowser(
  new IframeBrowserAdapter({ basePath: "/tinybrowser" }),
);
await browser.start();
const page = await browser.newPage();
document.querySelector("#browser")!.append(page.element);
await page.goto("https://example.com/");
console.log(await page.snapshot());
```

The relay must be exposed through the web app at the same-origin path supplied in `basePath`. It needs server-side authentication; never put its proxy secret in this package or browser JavaScript.
