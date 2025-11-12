import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { info } from "console";

// CAPTCHA issue, cannot proceed with page 2
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
  const books = await extractBooksFromMainPage(page, 24);

  // await page.goto("https://www.waterstones.com/books/bestsellers?page=2", {
  //   waitUntil: "networkidle2",
  //   timeout: 30000,
  // });
  // const booksPage2 = await extractBooksFromMainPage(page, 6);

  // const books = booksPage1.concat(
  //   booksPage2.map((book, index) => ({
  //     rank: 24 + index + 1,
  //     title: book.title,
  //     href: book.href,
  //   }))
  // );
  console.log(`Total ${books.length} of books retrieved.`);
  console.log('Starting detailed page crawling...');

  const concurrency = 5;
  for (let i = 0; i < books.length; i += concurrency) {
      const batch = books.slice(i, i + concurrency);
      const results = await Promise.all(batch.map(book => fetchBookDetail(browser, book.href)));
      results.forEach((data, idx) => {
          batch[idx].contents = data.contents;
      });
  }
  await browser.close();


  // --------------------- result_uk.json에 저장 ---------------------
  const resultPath = path.join(process.cwd(), "result_uk.json");
  fs.writeFileSync(resultPath, JSON.stringify(books, null, 2), "utf-8");
  console.log(`Total ${books.length} of books saved to ${resultPath}.`);
}

async function fetchBookDetail(browser, href) {
  const page = await browser.newPage();
      await page.goto(href, { waitUntil: 'networkidle2' });
  
      await page.waitForSelector('section.book-info-tabs.ws-tabs.span12', { timeout: 30000 }).catch(() => {});

      const html = await page.content();
      const $ = cheerio.load(html);
  
      // 개요
      const contentsEl = $('#scope_book_description')
      let contents = '';
      contentsEl.querySelectorAll('p').forEach(p => {
        contents += p.textContent + '\n';
      });

      await page.close();
      return { contents };
}


async function extractBooksFromMainPage(page, limit) {
  await page.waitForSelector("div.book-preview", { timeout: 0 });

  const books = await page.evaluate((limit) => {
    const cards = Array.from(
      document.querySelectorAll("div.book-preview")
    ).slice(0, limit);
    const result = [];

    cards.forEach((card, index) => {
      const imageWrap = card.querySelector(
        "div.inner > div.book-thumb-container > div.book-thumb > div.image-wrap"
      );
      const infoWrap = card.querySelector(
        "div.inner > div.info-wrap"
      );

      if (!imageWrap || !infoWrap) return;

      const aTag = imageWrap.querySelector("a");
      // const imgTag = imageWrap.querySelector("a > img");
      // console.log(`imgTag: ${imgTag}`);
      // const image = imgTag ? imgTag.src : null;
      const href = aTag ? aTag.href : null;

      const author = infoWrap.querySelector("span.author > a > b")?.textContent.trim() || null;

      const titleEl =
        imageWrap.querySelector(
          "div.hover-layer > div > div > div.pre-add > span.visuallyhidden"
        ) || imageWrap.querySelector("div.hover-layer span.visuallyhidden");

      const title = titleEl ? titleEl.textContent.trim() : null;

      result.push({ rank: index + 1, title, author, href });

    });
    return result;
  }, limit);
  return books;
}


fetchBooksMain();
