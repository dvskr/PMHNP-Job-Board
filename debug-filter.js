async function test() {
    console.log('--- Testing GET /api/test-debug ---');
    try {
        const res = await fetch('http://localhost:3000/api/test-debug', { method: 'GET' });
        console.log('Status:', res.status);
        console.log('Body:', await res.text());
    } catch (err) {
        console.error('Test debug GET failed:', err);
    }

    console.log('\n--- Testing POST /api/test-debug ---');
    try {
        const res = await fetch('http://localhost:3000/api/test-debug', { method: 'POST' });
        console.log('Status:', res.status);
        console.log('Body:', await res.text());
    } catch (err) {
        console.error('Test debug POST failed:', err);
    }
}

test();
