const { Redis } = require('@upstash/redis');

// GANTI DENGAN DOMAIN NETLIFY BAWAAN ANDA
const NETLIFY_DOMAIN = 'sorturl.netlify.app'; 

// Inisiasi koneksi Upstash menggunakan Environment Variables Netlify
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Headers dasar untuk CORS
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': `https://${NETLIFY_DOMAIN}`, // Bolehkan domain Netlify sendiri
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

exports.handler = async (event) => {
    const { httpMethod, path, body } = event;

    // --- 0. TANGANI OPTIONS (CORS Preflight) ---
    if (httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    // --- 1. POST: CREATE NEW LINK (API Path: /api/create) ---
    // Kami mencari path yang berisi /api/create untuk memicu logika pembuatan link
    if (httpMethod === 'POST' && path.includes('/api/create')) {
        try {
            const { slug, url } = JSON.parse(body);

            if (!slug || !url || !url.startsWith('http')) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Input tidak valid.' }),
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
                };
            }

            const existingUrl = await redis.get(slug);
            if (existingUrl) {
                return {
                    statusCode: 409, // Conflict
                    body: JSON.stringify({ error: 'Slug sudah digunakan.' }),
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
                };
            }

            await redis.set(slug, url);

            return {
                statusCode: 200,
                // Mengembalikan URL shortlink menggunakan domain Netlify
                body: JSON.stringify({ short_url: `${NETLIFY_DOMAIN}/${slug}` }), 
                headers: { 
                    'Content-Type': 'application/json',
                    ...CORS_HEADERS
                }
            };

        } catch (error) {
            console.error('Upstash Error (POST):', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: `Internal server error: ${error.message}` }),
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
            };
        }
    }

    // --- 2. GET: REDIRECT LINK (Path: /slug) ---
    if (httpMethod === 'GET') {
        // Ambil slug dari path, pastikan bukan nama file function/root
        const slug = path.split('/').pop(); 
        
        if (slug && slug !== 'shortener' && slug !== 'api' && slug !== '') {
            try {
                const destinationURL = await redis.get(slug);

                if (destinationURL) {
                    return {
                        statusCode: 302, // Temporary Redirect untuk Media Sosial
                        headers: {
                            Location: destinationURL,
                            'Cache-Control': 'no-cache', 
                        },
                        body: '',
                    };
                }

                return { statusCode: 404, body: 'Shortlink tidak ditemukan.' };

            } catch (error) {
                console.error('Upstash Error (GET):', error);
                return { statusCode: 500, body: 'Kesalahan internal saat mencari link.' };
            }
        }
    }
    
    // Default response, jika request bukan GET redirect atau POST API
    return {
        statusCode: 200,
        body: 'Shortlink Creator Interface',
    };
};
