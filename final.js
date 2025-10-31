import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// --------------------- 페이지 크롤링 ---------------------
async function fetchPageBooks(page, pageNum) {
    const url = `https://store.kyobobook.co.kr/bestseller/total/weekly?page=${pageNum}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('ol li', { timeout: 10000 });
    await page.waitForSelector('a.prod_link.line-clamp-2.font-medium.text-black', { timeout: 10000 });
    await page.waitForSelector('a.prod_link.relative img', { timeout: 10000 });
    await page.waitForSelector('div.line-clamp-2.flex', { timeout: 10000 });
    const html = await page.content();
    const $ = cheerio.load(html);

    const books = [];
    
    $('ol').slice(1, 3).each((olIndex, olEl) => {
        $(olEl).children('li').each((index, el) => {
            if (pageNum === 2 && books.length >= 10) return; // 2페이지는 최대 10개까지만
            let rank;
            if (pageNum === 2) {
                rank = books.length + 21; // 2페이지는 21위부터로 저장, 개선 필요
            } else {
                rank = books.length + 1;
            }

            const titleEl = $(el).find('a.prod_link.line-clamp-2.font-medium.text-black');
            const title = titleEl.text().trim();
            const detailHref = titleEl.attr('href');
            const coverImage = $(el).find('a.prod_link.relative img').attr('src');

            const authorPublisherText = $(el).find('div.line-clamp-2.flex').text().replace(/\s+/g, ' ').trim();
            const parts = authorPublisherText.split('·').map(t => t.trim());
            const author = parts[0] || '';
            const publisher = parts[1] || '';

            if (rank && title && author && publisher && coverImage && detailHref) {
                books.push({ rank, title, author, publisher, coverImage, detailHref });
            }
        });
    });
    books.sort((a, b) => a.rank - b.rank);

    return books;
}

async function fetchBookDetail(browser, detailHref) {
    const page = await browser.newPage();
    await page.goto(detailHref, { waitUntil: 'networkidle2' });

    await page.waitForSelector('div.writer_info_box .auto_overflow_inner p.info_text', { timeout: 30000 }).catch(() => {});
    await page.waitForSelector('div.product_detail_area.book_publish_review .auto_overflow_inner p.info_text', { timeout: 30000 }).catch(() => {});
    await page.waitForSelector('li.book_contents_item', { timeout: 30000 }).catch(() => {});

    const html = await page.content();
    const $ = cheerio.load(html);

    // 작가 정보
    const writerInfo = $('div.writer_info_box .auto_overflow_inner p.info_text').text().trim() || '';
    // 목차
    const contents = $('li.book_contents_item').text().trim() || '';
    // 출판사 서평
    const publisherReview = $('div.product_detail_area.book_publish_review .auto_overflow_inner p.info_text').text().trim() || '';

    await page.close();
    return { writerInfo, contents, publisherReview };
}

// --------------------- 전체 크롤러 ---------------------
async function bestSellerScrapper(options = { topN: 30 }) {
    const startTime = Date.now();

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const mainPage = await browser.newPage();
    const firstPageBooks = await fetchPageBooks(mainPage, 1);
    const secondPageBooks = await fetchPageBooks(mainPage, 2);
    let allBooks = [...firstPageBooks, ...secondPageBooks].slice(0, options.topN);

    console.log(`총 ${allBooks.length}개의 기본 결과를 가져왔습니다. 상세페이지를 크롤링합니다...`);

    // --------------------- 상세페이지 병렬 처리 ---------------------
    const concurrency = 5;
    for (let i = 0; i < allBooks.length; i += concurrency) {
        const batch = allBooks.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(book => fetchBookDetail(browser, book.detailHref)));
        results.forEach((data, idx) => {
            batch[idx].writerInfo = data.writerInfo;
            batch[idx].contents = data.contents;
            batch[idx].publisherReview = data.publisherReview;
            // delete batch[idx].detailHref;
            console.log(`${batch[idx].title}: ${batch[idx].publisherReview.length}`);
        });
    }

    // --------------------- 상세페이지 순차 처리 ---------------------
    // for (const book of allBooks) {
    //     const data = await fetchBookDetail(browser, book.detailHref);
    //     book.writerInfo = data.writerInfo;
    //     book.contents = data.contents;
    //     book.publisherReview = data.publisherReview;
    //     console.log(`book.publisherReview.length: ${book.publisherReview.length}`);
    //     // delete book.detailHref;
    // }


    await mainPage.close();
    await browser.close();

    const endTime = Date.now();
    console.log(`크롤링 완료. 소요시간: ${((endTime - startTime) / 1000).toFixed(2)}초`);

    // --------------------- result.json에 저장 ---------------------
    const resultPath = path.join(process.cwd(), 'result.json');
    fs.writeFileSync(resultPath, JSON.stringify(allBooks, null, 2), 'utf-8');
    console.log(`총 ${allBooks.length}개의 결과가 ${resultPath}에 저장되었습니다.`);

    return allBooks;
}

// --------------------- 테스트용 5위까지만 가져오기 ---------------------
async function testTop5Books() {
    const testBooks = await bestSellerScrapper({ topN: 5 });
    return testBooks;
}

// --------------------- 실행 ---------------------
bestSellerScrapper();         // 전체 top30 크롤링
// testTop5Books();         // 테스트용