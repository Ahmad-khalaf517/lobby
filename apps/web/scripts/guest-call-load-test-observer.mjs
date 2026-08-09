import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';

import { chromium } from 'playwright';

const OBSERVER_DISPLAY_NAME = 'Load Test Observer';
const VIEWPORT = { width: 1440, height: 900 };

export class GuestCallEvidenceObserver {
  #browser = null;
  #context = null;
  #page = null;

  constructor({ webUrl, outputDirectory, settleTimeoutMs }) {
    this.webUrl = webUrl;
    this.outputDirectory = outputDirectory;
    this.settleTimeoutMs = settleTimeoutMs;
  }

  async start(channel) {
    await mkdir(this.outputDirectory, { recursive: true });
    this.#browser = await chromium.launch({ headless: true });
    this.#context = await this.#browser.newContext({
      viewport: VIEWPORT,
      colorScheme: 'dark',
    });
    this.#page = await this.#context.newPage();

    const roomUrl = new URL(`/guest/${encodeURIComponent(channel.code)}`, `${this.webUrl}/`);
    roomUrl.searchParams.set('name', OBSERVER_DISPLAY_NAME);
    await this.#page.goto(roomUrl.href, {
      waitUntil: 'domcontentloaded',
      timeout: this.settleTimeoutMs,
    });

    const roomHeading = this.#page.locator('header h1').first();
    await roomHeading.waitFor({ state: 'visible', timeout: this.settleTimeoutMs });
    const renderedRoomName = (await roomHeading.innerText()).trim();
    if (renderedRoomName !== channel.name) {
      throw new Error(
        `Browser observer opened room "${renderedRoomName}" instead of "${channel.name}".`,
      );
    }
  }

  async capture(filename, expectedCount, capacity) {
    const page = this.#page;
    if (!page) throw new Error('The visual evidence observer is not running.');

    try {
      const countText =
        expectedCount === 0
          ? new RegExp(`Ready.*0/${capacity}`)
          : `${expectedCount} of ${capacity} participants currently connected`;
      await page
        .getByText(countText, { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: this.settleTimeoutMs });

      if (expectedCount === capacity) {
        await page
          .getByText(new RegExp(`CALL FULL.*${capacity}/${capacity}`))
          .first()
          .waitFor({ state: 'visible', timeout: this.settleTimeoutMs });
      }
    } catch (error) {
      const diagnosticName = `debug-${filename}`;
      await page
        .screenshot({
          path: join(this.outputDirectory, diagnosticName),
          fullPage: false,
          animations: 'disabled',
          caret: 'hide',
        })
        .catch(() => undefined);
      const visibleState = (await page.locator('body').innerText())
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Visible UI: ${visibleState}. Diagnostic screenshot: ${diagnosticName}.`,
      );
    }

    const outputPath = join(this.outputDirectory, filename);
    await page.screenshot({
      path: outputPath,
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
    });
    return outputPath;
  }

  async close() {
    const context = this.#context;
    const browser = this.#browser;
    this.#page = null;
    this.#context = null;
    this.#browser = null;

    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
