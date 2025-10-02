const { Redis } = require('@upstash/redis');

// GANTI DENGAN DOMAIN NETLIFY ANDA
const NETLIFY_DOMAIN = 'sorturl.netlify.app'; 

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': `https://${NETLIFY_DOMAIN}`, 
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

exports.handler = async (event) => {
    const { httpMethod, path, body, headers } = event;

    // --- 0. TANGANI OPTIONS (CORS Preflight) ---
    if (httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    // --- 1. POST: CREATE NEW LINK (API Path: /api/create) ---
    if (httpMethod === 'POST' && path.includes('/api/create')) {
        try {
            const { slug, title, desc, imageUrl, redirect } = JSON.parse(body);

            if (!slug || !title || !redirect || !redirect.startsWith('http')) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Input title dan redirect URL tidak valid.' }),
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
                };
            }

            const existingRecord = await redis.get(slug);
            if (existingRecord) {
                return {
                    statusCode: 409,
                    body: JSON.stringify({ error: 'Slug sudah digunakan.' }),
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
                };
            }
            
            // Simpan semua data OG dan Redirect sebagai JSON di Upstash
            const recordData = JSON.stringify({ title, desc: desc || '', imageUrl: imageUrl || '', redirect });
            await redis.set(slug, recordData);

            return {
                statusCode: 200,
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

    // --- 2. GET: HANDLE OG PREVIEW DAN REDIRECT (Slug) ---
    if (httpMethod === 'GET') {
        const slug = path.split('/').pop(); 
        const fullUrl = `https://${NETLIFY_DOMAIN}/${slug}`;
        
        if (slug && slug !== 'shortener' && slug !== 'api' && slug !== '') {
            try {
                const recordJson = await redis.get(slug);

                if (!recordJson) {
                    return { statusCode: 404, body: 'Shortlink tidak ditemukan.' };
                }

                let recordData; 
                
                try {
                    // COBA 1: Coba parsing sebagai JSON (untuk data baru)
                    recordData = JSON.parse(recordJson);
                    if (!recordData.redirect) {
                        throw new Error("Missing redirect key in JSON"); 
                    }
                } catch (e) {
                    // COBA 2: Jika gagal parsing, perlakukan data sebagai string URL lama (resilience)
                    console.warn("Falling back to old URL format:", recordJson);
                    recordData = {
                        title: "Shortlink Lama (Redirecting)",
                        desc: "Redirecting to destination URL...",
                        imageUrl: "",
                        redirect: recordJson // Anggap recordJson adalah URL redirect
                    };
                }
                
                const { title, desc, imageUrl, redirect } = recordData;
                
                // Logika Deteksi Bot
                const userAgent = headers["user-agent"] || "";
                const isBot = /facebookexternalhit|Facebot|Googlebot|bingbot|Slackbot|Discordbot|Twitterbot/i.test(userAgent);

                // Halaman HTML yang akan ditayangkan
                const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${desc || ''}">
    <meta property="og:image" content="${imageUrl || ''}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${fullUrl}">
    <title>${title}</title>
    
    ${isBot ? 
        // Jika bot, sajikan OG tags dan jangan redirect
        '' : 
        // Jika manusia, gunakan JavaScript (PRIMARY) dan Meta Refresh (FALLBACK)
        `<meta http-equiv="refresh" content="1;url=${redirect}">
         <script>
            // Redirect yang lebih kuat menggunakan JavaScript
            setTimeout(function() {
                window.location.href = "${redirect}";
            }, 1000); // 1000ms = 1 detik
         </script>`
    }
</head>
<body style="font-family:sans-serif;text-align:center;padding-top:50px;">
    <h1>${title}</h1>
    <p>${isBot ? 'Bot detected. OG tags served. (Will not redirect)' : 'Redirecting you now...'}</p>
    <p>Destination: ${redirect}</p>
</body>
</html>`;

                return {
                    statusCode: 200, 
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                    body: html,
                };

            } catch (error) {
                console.error('Final GET Error:', error); 
                return { statusCode: 500, body: 'Kesalahan internal saat mencari link.' };
            }
        }
    }
    
    // Default response (untuk index.html)
    return {
        statusCode: 200,
        body: 'Shortlink Creator Interface',
    };
};
