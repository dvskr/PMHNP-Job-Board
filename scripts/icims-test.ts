// Save raw iCIMS HTML for structure analysis
import * as fs from 'fs'

async function main() {
    const url = 'https://careers2-universalhealthservices.icims.com/jobs/search?ss=1&searchKeyword=psychiatric+nurse+practitioner&in_iframe=1'
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const html = await res.text()

    // Extract just the job listing section
    // Find all href patterns with /jobs/#### 
    const jobLinkRegex = /href="([^"]*\/jobs\/\d+[^"]*)"/gi
    let match
    console.log('=== JOB LINKS ===')
    while ((match = jobLinkRegex.exec(html)) !== null) {
        console.log(match[1])
    }

    // Also find the surrounding HTML to understand structure
    // Find class="iCIMS" elements near job links
    const surroundingRegex = /.{0,200}\/jobs\/\d+.{0,200}/gi
    let m2
    console.log('\n=== SURROUNDING HTML SNIPPETS ===')
    let count = 0
    while ((m2 = surroundingRegex.exec(html)) !== null && count < 3) {
        console.log(`\nSnippet ${++count}:`)
        console.log(m2[0].replace(/</g, '\n<'))
    }
}

main()
