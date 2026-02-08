const http = require('http');
const fs = require('fs');

const url = 'http://localhost:3000/jobs/missing-job-12345678-1234-1234-1234-1234567890ab';

console.log(`Checking URL: ${url}`);

const req = http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        const isNotFoundPage = data.includes('debug-is-not-found-page');
        const isErrorPage = data.includes('debug-is-error-page');

        let pageType = 'Unknown';
        if (isNotFoundPage) pageType = 'NotFound Page';
        if (isErrorPage) pageType = 'Error Page';

        const output = `Status: ${res.statusCode}\nPage Type: ${pageType}`;
        console.log(output);
        fs.writeFileSync('scripts/check-404-result.txt', output);
    });
}).on('error', (e) => {
    const result = `Error: ${e.message}`;
    console.log(result);
    fs.writeFileSync('scripts/check-404-result.txt', result);
});
