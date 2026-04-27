// Loads http://localhost:3000/ in headless Chromium, captures console output,
// JS errors, and network failures. Prints JSON summary and takes a screenshot.
const { chromium } = require("playwright");

(async () => {
  const url = process.argv[2] || "http://localhost:3000/";
  const waitMs = parseInt(process.argv[3] || "3000", 10);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  const logs = [];
  const errors = [];
  const failures = [];

  page.on("console", (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (err) => {
    errors.push({ message: err.message, stack: err.stack });
  });
  page.on("requestfailed", (req) => {
    failures.push({ url: req.url(), error: req.failure()?.errorText });
  });

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
  } catch (e) {
    errors.push({ message: "navigation: " + e.message });
  }

  await page.waitForTimeout(waitMs);

  const screenshotPath = "/tmp/neurovis-check.png";
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const bodyText = await page.evaluate(() =>
    document.body.innerText.slice(0, 500),
  );
  const rootHTML = await page.evaluate(() => {
    const r = document.getElementById("root");
    return r ? r.innerHTML.slice(0, 300) : "NO #root ELEMENT";
  });

  console.log(
    JSON.stringify(
      {
        url,
        pageErrors: errors,
        consoleErrors: logs.filter((l) => l.type === "error"),
        consoleWarnings: logs.filter((l) => l.type === "warning").slice(0, 5),
        failedRequests: failures,
        bodyPreview: bodyText,
        rootPreview: rootHTML,
        screenshot: screenshotPath,
      },
      null,
      2,
    ),
  );

  await browser.close();
})();
