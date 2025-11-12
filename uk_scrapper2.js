import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

async function fetchBooksMain() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });
  const page = await browser.newPage();

  await page.goto("https://www.waterstones.com/books/bestsellers", {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  // Scroll loop to ensure at least 30 books are loaded
  let booksCount = 0;
  while (booksCount < 30) {
    const previousCount = booksCount;
    booksCount = await page.evaluate(() => document.querySelectorAll("div.book-preview").length);
    if (booksCount < 30) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForFunction(
        (prevCount) => document.querySelectorAll("div.book-preview").length > prevCount,
        {},
        previousCount
      );
    }
  }

  const books = await page.evaluate(() => {
    const bookElements = Array.from(document.querySelectorAll("div.book-preview")).slice(0, 30);
    return bookElements.map((el, index) => {
      const titleEl = el.querySelector("h3 a");
      return {
        rank: index + 1,
        title: titleEl ? titleEl.innerText.trim() : "",
        href: titleEl ? titleEl.href : "",
      };
    });
  });

  await browser.close();

  console.log(`Total ${books.length} of books retrieved.`);

  // --------------------- result_uk.json에 저장 ---------------------
  const resultPath = path.join(process.cwd(), "result_uk.json");
  fs.writeFileSync(resultPath, JSON.stringify(books, null, 2), "utf-8");
  console.log(`Total ${books.length} of books saved to ${resultPath}.`);
}


fetchBooksMain();
