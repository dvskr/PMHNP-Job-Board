
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function verifyQuality() {
    console.log('🔍 Verifying JSearch Data Quality...');

    const jobs = await prisma.job.findMany({
        where: { sourceProvider: 'jsearch' },
        select: { id: true, title: true, description: true, location: true, minSalary: true, maxSalary: true }
    });

    const suspiciousTitles = jobs.filter(j =>
        /technician|assistant|rna|cna/i.test(j.title) &&
        !/physician assistant/i.test(j.title)
    );

    const shortDescriptions = jobs.filter(j => j.description.length < 100);
    const missingLocation = jobs.filter(j => !j.location || j.location === 'United States');
    const withSalary = jobs.filter(j => j.minSalary || j.maxSalary);

    console.log(`\n📊 Analyzed ${jobs.length} JSearch Jobs:`);
    console.log(`   - 🚩 Suspicious Titles: ${suspiciousTitles.length}`);
    if (suspiciousTitles.length > 0) {
        suspiciousTitles.slice(0, 3).forEach(j => console.log(`      • ${j.title}`));
    }

    console.log(`   - 📉 Short Descriptions: ${shortDescriptions.length}`);
    console.log(`   - 🗺️  Generic/Missing Location: ${missingLocation.length}`);
    console.log(`   - 💰 With Salary Data: ${withSalary.length} (${((withSalary.length / jobs.length) * 100).toFixed(1)}%)`);

    if (suspiciousTitles.length === 0 && shortDescriptions.length < 5) {
        console.log('\n✅ Quality Check PASSED');
    } else {
        console.log('\n⚠️ Quality Check REQUIRES REVIEW');
    }
}

verifyQuality()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
