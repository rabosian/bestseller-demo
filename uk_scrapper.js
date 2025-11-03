import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
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
    timeout: 60000,
  });
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  console.log("======got page======");

  await page.waitForSelector("div.book-preview", { timeout: 0 });
  console.log("======selector found=====");

  // lazy-load 스크롤
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    let prevCount = 0,
      retries = 0;
    while (retries < 5) {
      window.scrollBy(0, window.innerHeight);
      await sleep(1500);
      const currentCount = document.querySelectorAll("div.book-preview").length;
      console.log("current count:", currentCount);
      if (currentCount > prevCount) {
        prevCount = currentCount;
        retries = 0;
      } else {
        retries++;
      }
      if (currentCount >= 30) break; // 상위 30개면 종료
    }
  });
  console.log("=====scroll complete=====");

  await page.waitForFunction(
    () => document.querySelectorAll("div.book-preview").length >= 30,
    { timeout: 0 } // 30개 될때까지 무제한 대기
  );
  console.log("=====book-preview count reached 30=====");

  const books = await page.evaluate(() => {
    // 데이터 추출
    const cards = document.querySelectorAll("div.book-preview");
    const result = [];

    cards.forEach((card, index) => {
      const imageWrap = card.querySelector(
        "div.inner > div.book-thumb-container > div.book-thumb > div.image-wrap"
      );
      if (!imageWrap) return;

      // 1️⃣ href: image-wrap 내부 첫 번째 <a>
      const aTag = imageWrap.querySelector("a");
      const href = aTag ? aTag.href : null;

      // 2️⃣ title: hover-layer 내부 span.visuallyhidden
      const titleEl =
        imageWrap.querySelector(
          "div.hover-layer > div > div > div.pre-add > span.visuallyhidden"
        ) || imageWrap.querySelector("div.hover-layer span.visuallyhidden");

      const title = titleEl ? titleEl.textContent.trim() : null;

      if (title && href) {
        result.push({ rank: index + 1, title, href });
      }
      if (result.length >= 30) return;
    });
    return result;
  });

  // 상위 30개 선택
  // const html = await page.content();
  // const $ = cheerio.load(html);

  // const books = [];
  // $("div.book-preview")
  //   .slice(0, 30)
  //   .each((index, divEl) => {
  //     const bookContainer = $(divEl).find(
  //       "div.inner > div.book-thumb-container > div.book-thumb > div.image-wrap"
  //     );

  //     const aTag = bookContainer.find("a").first();
  //     const detailHref = aTag.attr("href");

  //     const titleEl =
  //       bookContainer.find(
  //         "div.hover-layer > div > div > div.pre-add > span.visuallyhidden"
  //       ).first() || bookContainer.find("div.hover-layer span.visuallyhidden").first();

  //     const title = titleEl.text().trim();

  //     // const title = aTag.text().trim();
  //     // const detailHref = aTag.attr("href");
  //     if (title && detailHref) {
  //       books.push({ rank: index + 1, title, detailHref });
  //     }
  //   });

  console.log(`총 ${books.length}권의 책 정보를 가져왔습니다.`);
  await browser.close();

  // --------------------- result_uk.json에 저장 ---------------------
  const resultPath = path.join(process.cwd(), "result_uk.json");
  fs.writeFileSync(resultPath, JSON.stringify(books, null, 2), "utf-8");
  console.log(`총 ${books.length}개의 결과가 ${resultPath}에 저장되었습니다.`);
}

const htmlChecker = async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });
  const page = await browser.newPage();

  await page.goto("https://www.waterstones.com/books/bestsellers", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  console.log("======got page======");

  await page.waitForSelector("div.book-preview", { timeout: 0 });
  // await page.waitForFunction(
  //   () => document.querySelectorAll("div.book-preview").length > 0,
  //   { timeout: 0 }
  // );

  const bookCard = await page.$("div.book-preview"); // null이면 없음
  if (bookCard) {
    let href = null;
    let title = null;

    const bookContainer = await bookCard.$(
      "div.inner > div.book-thumb-container > div.book-thumb > div.image-wrap"
    );

    const hrefHandle = await bookContainer.$("a");
    if (hrefHandle) {
      href = await page.evaluate((el) => el.href, hrefHandle);
    }

    const titleHandle =
      (await bookContainer.$(
        "div.hover-layer > div > div > div.pre-add > span.visuallyhidden"
      )) || (await bookContainer.$("div.hover-layer span.visuallyhidden"));
    if (titleHandle) {
      title = await page.evaluate((el) => el.textContent.trim(), titleHandle);
    }
    console.log("첫 번째 책 카드:", { title, href });
  } else {
    console.log("div.book-preview 요소가 존재하지 않습니다.");
  }

  await browser.close();
};

// htmlChecker();
fetchBooksMain();
