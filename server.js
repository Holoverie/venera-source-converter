const express = require('express');
const VeneraRuntime = require('./venera-runtime');
const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const runtime = new VeneraRuntime();

// 配置 HTTP/HTTPS Agent，复用连接并防止 ECONNRESET
const agentOptions = {
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000 // socket timeout
};
const httpAgent = new http.Agent(agentOptions);
const httpsAgent = new https.Agent(agentOptions);

// 漫画源文件目录
const SOURCES_DIR = path.join(__dirname, 'sources');

// 确保 sources 目录存在
if (!fs.existsSync(SOURCES_DIR)) {
    fs.mkdirSync(SOURCES_DIR, { recursive: true });
}

// 加载所有漫画源
async function loadAllSources() {
    const files = fs.readdirSync(SOURCES_DIR);
    const loadedSources = [];

    for (const file of files) {
        if (file.endsWith('.js')) {
            try {
                const sourcePath = path.join(SOURCES_DIR, file);
                const source = runtime.loadSource(sourcePath);

                // 设置默认设置值
                setDefaultSettings(source);

                // 调用 init 方法（如果存在）
                if (typeof source.init === 'function') {
                    try {
                        // 处理可能返回 Promise 的 init 方法
                        await Promise.resolve(source.init());
                    } catch (initError) {
                        console.warn(`Init error for ${source.name}:`, initError.message);
                    }
                }

                loadedSources.push({
                    name: source.name,
                    key: source.key,
                    file: file
                });
                console.log(`Loaded source: ${source.name} (${file})`);
            } catch (error) {
                console.error(`Failed to load source ${file}:`, error.message);
            }
        }
    }

    return loadedSources;
}

// 设置默认设置值
function setDefaultSettings(source) {
    // 获取类的静态属性作为默认设置
    const classDefaults = source.constructor;

    // 常见的默认设置
    const commonDefaults = {
        'base_url': classDefaults.defaultApiUrl,
        'region': classDefaults.defaultCopyRegion,
        'image_quality': classDefaults.defaultImageQuality,
    };

    for (const [key, value] of Object.entries(commonDefaults)) {
        if (value && !source.loadSetting(key)) {
            source.saveSetting(key, value);
        }
    }
}

// 初始化加载（异步）
let loadedSources = [];
loadAllSources().then(sources => {
    loadedSources = sources;
    console.log(`\nServer ready! Loaded ${sources.length} source(s): ${sources.map(s => s.name).join(', ') || 'None'}`);
}).catch(err => {
    console.error('Failed to load sources:', err);
});

// 中间件
app.use(express.json());

// CORS 支持
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

// 健康检查
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        sources: loadedSources.map(s => s.name),
        message: 'Venera Source Converter is running'
    });
});

// 重新加载漫画源
app.post('/reload', async (req, res) => {
    try {
        loadedSources = await loadAllSources();
        res.json({
            status: 'ok',
            sources: loadedSources.map(s => s.name)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Config 端点 - 返回所有漫画源配置
app.get('/config', (req, res) => {
    const config = {};

    for (const sourceInfo of loadedSources) {
        const source = runtime.getSource(sourceInfo.name);
        if (source) {
            // 构建配置
            const sourceConfig = {
                name: source.name,
                apiUrl: `${req.protocol}://${req.get('host')}`,
                detailPath: `/comic/<id>?source=${encodeURIComponent(source.name)}`,
                photoPath: `/photo/<id>/chapter/<chapter>?source=${encodeURIComponent(source.name)}`,
                searchPath: `/search/<text>/<page>?source=${encodeURIComponent(source.name)}`,
                type: source.name
            };
            config[source.name] = sourceConfig;
        }
    }

    res.json(config);
});

// 漫画详情端点
app.get('/comic/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sourceName = req.query.source;

        if (!sourceName) {
            return res.status(400).json({ error: 'Missing source parameter' });
        }

        const source = runtime.getSource(sourceName);
        if (!source) {
            return res.status(404).json({ error: `Source not found: ${sourceName}` });
        }

        if (!source.comic || !source.comic.loadInfo) {
            return res.status(501).json({ error: 'Source does not support comic details' });
        }

        const comicDetails = await source.comic.loadInfo(id);

        // 转换为项目格式
        // 处理 tags - 可能是 Map、数组或对象
        let tags = [];
        if (comicDetails.tags) {
            if (comicDetails.tags instanceof Map) {
                tags = Array.from(comicDetails.tags.values()).flat();
            } else if (Array.isArray(comicDetails.tags)) {
                tags = comicDetails.tags;
            } else if (typeof comicDetails.tags === 'object') {
                tags = Object.values(comicDetails.tags).flat();
            }
        }

        // Calculate total chapters
        let totalChapters = 0;
        if (comicDetails.chapters) {
            if (comicDetails.chapters instanceof Map) {
                for (const val of comicDetails.chapters.values()) {
                    if (val instanceof Map) {
                        totalChapters += val.size;
                    } else {
                        totalChapters++;
                    }
                }
            } else if (typeof comicDetails.chapters === 'object') {
                 totalChapters = Object.keys(comicDetails.chapters).length;
            }
        }

        // Handle page count and chapter count logic:
        // - If it's a oneshot/single chapter (totalChapters <= 1): return page_count (if available) and total_chapters = 1
        // - If it's a multi-chapter comic (totalChapters > 1): return total_chapters and page_count = 0
        let finalPageCount = 0;
        let finalTotalChapters = totalChapters > 0 ? totalChapters : 1;

        if (finalTotalChapters <= 1) {
            // It's a single chapter, try to find the page count
            if (comicDetails.thumbnails && comicDetails.thumbnails.length > 0) {
                finalPageCount = comicDetails.thumbnails.length;
            } else if (comicDetails.maxPage !== null && comicDetails.maxPage !== undefined) {
                finalPageCount = comicDetails.maxPage;
            }
            finalTotalChapters = 1; // Ensure it's exactly 1
        } else {
            // It's a multi-chapter comic, do not return page count
            finalPageCount = 0;
        }

        const response = {
            item_id: comicDetails.id,
            name: comicDetails.title,
            page_count: finalPageCount,
            views: 0,
            rate: comicDetails.stars || 0,
            cover: comicDetails.cover,
            tags: tags,
            total_chapters: finalTotalChapters
        };

        res.json(response);
    } catch (error) {
        console.error('Error loading comic info:', error);
        res.status(500).json({ error: error.message });
    }
});

// 图片列表端点
app.get('/photo/:id/chapter/:chapter', async (req, res) => {
    try {
        const { id, chapter } = req.params;
        const sourceName = req.query.source;
        const width = req.query.width || 600;
        const quality = req.query.quality || 50;

        if (!sourceName) {
            return res.status(400).json({ error: 'Missing source parameter' });
        }

        const source = runtime.getSource(sourceName);
        if (!source) {
            return res.status(404).json({ error: `Source not found: ${sourceName}` });
        }

        if (!source.comic || !source.comic.loadEp) {
            return res.status(501).json({ error: 'Source does not support loading episodes' });
        }

        // 处理章节 ID - 某些源（如 MangaDex）使用 UUID 而不是章节号
        let epId = chapter;

        // 如果 chapter 是纯数字，可能需要查找对应的章节 ID
        if (/^\d+$/.test(chapter)) {
            // 尝试获取漫画详情来查找章节 ID
            if (source.comic.loadInfo) {
                try {
                    const comicDetails = await source.comic.loadInfo(id);

                    if (comicDetails.chapters) {
                        // 遍历章节 Map 查找对应序号的章节
                        let chapterIndex = parseInt(chapter) - 1; // 转换为 0-based 索引
                        let currentIndex = 0;
                        let foundId = null;

                        // Handle Map structure (Volume -> Chapter Map OR Chapter Id -> Title)
                        if (comicDetails.chapters instanceof Map) {
                            for (const [key, value] of comicDetails.chapters) {
                                if (value instanceof Map) {
                                    // Nested Map: key is volume name, value is chapters map
                                    for (const [chId, chTitle] of value) {
                                        if (currentIndex === chapterIndex) {
                                            foundId = chId;
                                            break;
                                        }
                                        currentIndex++;
                                    }
                                } else {
                                    // Flat Map: key is chapter id, value is title
                                    if (currentIndex === chapterIndex) {
                                        foundId = key;
                                        break;
                                    }
                                    currentIndex++;
                                }
                                if (foundId) break;
                            }
                        }

                        if (foundId) {
                            epId = foundId;
                        }
                    }
                } catch (e) {
                    console.warn('Failed to resolve chapter ID:', e.message);
                }
            }
        }

        const epData = await source.comic.loadEp(id, epId);

        // 构建基础 URL
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        // 转换为项目格式，添加代理 URL
        const response = {
            title: `Comic ${id}`,
            images: epData.images.map((url, index) => ({
                url: `${baseUrl}/image-proxy?url=${encodeURIComponent(url)}&width=${width}&quality=${quality}`
            }))
        };

        res.json(response);
    } catch (error) {
        console.error('Error loading episode:', error);
        res.status(500).json({ error: error.message });
    }
});

// 搜索端点
app.get('/search/:text/:page', async (req, res) => {
    try {
        const { text, page } = req.params;
        const sourceName = req.query.source;

        if (!sourceName) {
            return res.status(400).json({ error: 'Missing source parameter' });
        }

        const source = runtime.getSource(sourceName);
        if (!source) {
            return res.status(404).json({ error: `Source not found: ${sourceName}` });
        }

        if (!source.search || !source.search.load) {
            return res.status(501).json({ error: 'Source does not support search' });
        }

        // 调用搜索功能
        // 获取默认选项（使用第一个选项作为默认值）
        let options = [];
        if (source.search.optionList) {
            options = source.search.optionList.map(opt => {
                if (opt.default) return opt.default;
                // 从第一个选项中提取值（格式: "value-Label"）
                if (opt.options && opt.options.length > 0) {
                    const firstOption = opt.options[0];
                    if (typeof firstOption === 'string' && firstOption.includes('-')) {
                        return firstOption.split('-')[0];
                    }
                    return firstOption;
                }
                return null;
            });
        }
        const searchResult = await source.search.load(decodeURIComponent(text), options, parseInt(page));

        // 转换为项目格式
        const response = {
            page: parseInt(page),
            has_more: page < searchResult.maxPage,
            results: searchResult.comics.map(comic => ({
                comic_id: comic.id,
                title: comic.title,
                cover_url: comic.cover,
                pages: 0
            }))
        };

        res.json(response);
    } catch (error) {
        console.error('Error searching:', error);
        res.status(500).json({ error: error.message });
    }
});

// 图片代理端点
app.get('/image-proxy', async (req, res) => {
    try {
        const imageUrl = req.query.url;
        const width = parseInt(req.query.width) || 600;
        const quality = parseInt(req.query.quality) || 50;

        if (!imageUrl) {
            return res.status(400).json({ error: 'Missing url parameter' });
        }

        // 根据 URL 确定 Referer
        let referer = 'https://nhentai.net/';
        if (imageUrl.includes('mangadex.org')) {
            referer = 'https://mangadex.org/';
        } else if (imageUrl.includes('copymanga')) {
            referer = 'https://www.copymanga.site/';
        }

        // 下载图片，增加重试机制
        let response;
        let attempt = 0;
        const maxAttempts = 3;
        
        while (attempt < maxAttempts) {
            try {
                attempt++;
                response = await axios.get(imageUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
                        'Referer': referer
                    },
                    timeout: 30000,
                    httpAgent: httpAgent,
                    httpsAgent: httpsAgent,
                    validateStatus: () => true
                });
                
                if (response.status >= 200 && response.status < 300) {
                    break;
                }
                
                // 如果是 404 或 403，通常不重试
                if (response.status === 404 || response.status === 403) {
                     console.warn(`Image proxy HTTP ${response.status} for ${imageUrl}`);
                     return res.status(response.status).json({ error: `Failed to load image: ${response.status}` });
                }
                
                console.warn(`Attempt ${attempt} failed with status ${response.status} for ${imageUrl}`);
            } catch (err) {
                console.warn(`Attempt ${attempt} failed with error ${err.message} for ${imageUrl}`);
                if (attempt >= maxAttempts) throw err;
            }
            
            // 简单的指数退避
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            }
        }

        if (!response || response.status >= 300) {
            return res.status(502).json({ error: 'Failed to load image after retries' });
        }

        const contentType = response.headers['content-type'] || 'image/jpeg';

        // 如果是 GIF，直接返回（保留动画）
        // 如果是其他非 WebP 格式且不需要调整，直接返回
        // WebP 强制转换为 JPEG/PNG
        if (contentType.includes('gif') || (!contentType.includes('webp') && width === 0 && quality === 100)) {
            res.set('Content-Type', contentType);
            res.set('Cache-Control', 'public, max-age=86400');
            return res.send(response.data);
        }

        // 处理图片
        let image = sharp(response.data);

        // 调整尺寸
        if (width > 0) {
            image = image.resize(width, null, { withoutEnlargement: true });
        }

        // 根据格式输出
        let outputBuffer;
        if (contentType.includes('png')) {
            // PNG 保持 PNG
            outputBuffer = await image.png({ quality }).toBuffer();
            res.set('Content-Type', 'image/png');
        } else {
            // 其他格式（包括 WebP、JPEG）统一转换为 JPEG
            outputBuffer = await image.jpeg({ quality }).toBuffer();
            res.set('Content-Type', 'image/jpeg');
        }

        res.set('Cache-Control', 'public, max-age=86400');
        res.send(outputBuffer);
    } catch (error) {
        console.error('Error proxying image:', imageUrl, '-', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
        }
        res.status(500).json({ error: 'Failed to load image' });
    }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Venera Source Converter running on port ${PORT}`);
    console.log(`Please place your .js source files in: ${SOURCES_DIR}`);
    console.log('Loading sources...');
});
