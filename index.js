import puppeteer from 'puppeteer-extra';
import pluginStealth from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import fs from 'fs';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';

const inputCsvFilePath = 'vendor_urls.csv'; // Path to your input CSV file
const outputCsvFilePath = 'vendor_url_status.csv'; // Path to your output CSV file

// Function to read CSV file
const readCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const readStream = fs.createReadStream(filePath);

    readStream.on('error', (error) => reject(error));

    readStream.pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        console.log(`Read ${results.length} rows from ${filePath}`);
        resolve(results);
      })
      .on('error', (error) => reject(error));
  });
};

// Function to get status code through Cloudflare
const getStatusCodeThroughCloudflare = async (url) => {
  puppeteer.use(pluginStealth());
  const browser = await puppeteer.launch({ headless: true, executablePath: executablePath() });

  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }); // 30 seconds timeout
    const statusCode = response.status();
    await browser.close();
    return { status: statusCode, errorMsg: '' };
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    await browser.close();
    return { status: null, errorMsg: error }; // Change to error.message
  }
};

// Main function to process the CSV and get status codes
const main = async () => {
  try {
    const products = await readCSV(inputCsvFilePath);
    const updatedProducts = [];

    for (const product of products) {
      console.log(product);
      const productId = product['ProductID'];
      const sponsored = product['Sponsored'];
      const productUrl = product['URL'];

      if (!productUrl) {
        console.log(`Skipping product ${productId} due to missing URL`);
        continue;
      }

      const { status, errorMsg } = await getStatusCodeThroughCloudflare(productUrl);
      console.log(`Status Code for ${productUrl}: ${status} Error Message: ${errorMsg}`);

      if (status != 200 && status != 301) {
        console.log('Updating Status in file');
        updatedProducts.push({ 'ProductID': productId, 'Sponsored': sponsored, 'Status': status, 'URL': productUrl, 'ErrorMessage': errorMsg });
      }
    }

    console.log(`Total products to update: ${updatedProducts.length}`);

    if (updatedProducts.length > 0) {
      const csvWriter = createObjectCsvWriter({
        path: outputCsvFilePath,
        header: [
          { id: 'ProductID', title: 'ProductID' },
          { id: 'Sponsored', title: 'Sponsored' },
          { id: 'Status', title: 'Status' },
          { id: 'URL', title: 'URL' },
          { id: 'ErrorMessage', title: 'ErrorMessage' },
        ],
      });

      await csvWriter.writeRecords(updatedProducts);
      console.log(`Results saved to ${outputCsvFilePath}`);
    } else {
      console.log('No products to update.');
    }
  } catch (error) {
    console.error('Error processing CSV file:', error);
  }
};

main();
