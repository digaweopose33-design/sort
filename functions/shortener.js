const { Redis } = require('@upstash/redis');

// Inisiasi koneksi Upstash menggunakan Environment Variables
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Headers dasar untuk CORS
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
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
    if (httpMethod === 'POST' && path.includes('/api/create')) {
        try {
            const { slug, url } = JSON.parse(body);

            // Validasi sederhana
            if (!slug || !url || !url.startsWith('http')) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Input tidak valid.' }),
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
                };
            }

            // Cek apakah slug sudah ada di Upstash
            const existingUrl = await redis.get(slug);
            if (existingUrl) {
                return {
                    statusCode: 409,
                    body: JSON.stringify({ error: 'Slug sudah digunakan.' }),
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
                };
            }

            // Simpan slug (key) dan URL tujuan (value) di Upstash
            await redis.set(slug, url);

            return {
                statusCode: 200,
                body: JSON.stringify({ short_url: `short.nurts.xyz/${slug}` }),
                headers: { 
                    'Content-Type': 'application/json',
                    ...CORS_HEADERS
                }
            };

        } catch (error) {
            console.error('Upstash Error (POST):', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: `Internal server error.` }),
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
            };
        }
    }

    // --- 2. GET: REDIRECT LINK (Path: /slug) ---
    if (httpMethod === 'GET') {
        const slug = path.split('/').pop(); 
        
        if (slug && slug !== 'shortener' && slug !== '') {
            try {
                // Ambil URL tujuan dari Upstash
                const destinationURL = await redis.get(slug);

                if (destinationURL) {
                    return {
                        statusCode: 302, // Temporary Redirect (penting untuk SEO/Media Sosial)
                        headers: {
                            Location: destinationURL,
                            'Cache-Control': 'no-cache', 
                        },
                        body: '',
                    };
                }

                // Jika slug tidak ditemukan
                return { statusCode: 404, body: 'Shortlink tidak ditemukan.' };

            } catch (error) {
                console.error('Upstash Error (GET):', error);
                return { statusCode: 500, body: 'Kesalahan internal saat mencari link.' };
            }
        }
    }
    
    // Default response jika tidak ada yang cocok (akan dialihkan ke index.html)
    return {
        statusCode: 200,
        body: 'Shortlink Creator Interface',
    };
};