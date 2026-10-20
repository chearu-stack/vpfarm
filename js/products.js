(() => {
    const categoryOrder = [
        ['poultry_meat', 'Мясо птицы (тушки)'],
        ['food_eggs', 'Яйцо пищевое'],
        ['offal', 'Субпродукты'],
        ['preserves', 'Готовая продукция (консервация)'],
    ];

    const catalogStatus = document.getElementById('catalog-status');
    const sections = document.getElementById('products-sections');
    const dialog = document.getElementById('product-contact-dialog');
    const dialogProduct = document.getElementById('product-contact-details');
    const dialogMessage = document.getElementById('product-contact-message');
    const copyFeedback = document.getElementById('product-contact-feedback');
    const detailsDialog = document.getElementById('product-details-dialog');
    const detailsTitle = document.getElementById('product-details-title');
    const detailsImage = document.getElementById('product-details-image');
    const noteSection = document.getElementById('product-details-note-section');
    const noteText = document.getElementById('product-details-note');
    const detailsSection = document.getElementById('product-details-facts-section');
    const detailsText = document.getElementById('product-details-facts');
    const detailsDragRegion = document.getElementById('product-details-drag-region');
    const statusDetails = {
        in_stock: { label: 'В наличии', button: 'Связаться по поводу товара' },
        out_of_stock: { label: 'Нет в наличии', button: 'Уточнить наличие' },
        on_order: { label: 'Под заказ', button: 'Уточнить возможность заказа' },
        seasonal: { label: 'Сезонный товар', button: 'Оставить заявку на сезон' },
        waitlist: { label: 'Лист ожидания', button: 'Уточнить лист ожидания' },
    };
    const catalogStatusOrder = { in_stock: 0, on_order: 1, seasonal: 2 };
    const allowedCategories = new Set(categoryOrder.map(([category]) => category));
    const strictStatuses = new Set(['in_stock', 'on_order', 'seasonal', 'waitlist']);
    const catalogConfig = window.APP_CONFIG && window.APP_CONFIG.productsCatalog;
    const catalogCacheKey = 'vpfarm_catalog_cache_v1';
    const catalogCacheVersion = 1;
    const catalogCacheTtlMs = 48 * 60 * 60 * 1000;
    const catalogFetchTimeoutMs = 10000;
    let activeCatalogIsFallback = false;

    const formatPrice = (price) => price === null || price === undefined || price === ''
        ? 'Цена уточняется'
        : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(price);

    const optionalText = (value) => typeof value === 'string' ? value.trim() : '';

    function getProductStatus(product) {
        return statusDetails[product.status] || {
            label: product.statusLabel || 'Уточняйте наличие',
            button: 'Уточнить наличие',
        };
    }

    function getMaxContactUrl() {
        const config = window.APP_CONFIG || {};
        if (config.products && config.products.maxContactUrl) return config.products.maxContactUrl;
        const maxSocial = config.contact && Array.isArray(config.contact.socials)
            ? config.contact.socials.find((social) => typeof social.name === 'string' && social.name.toLowerCase() === 'макс')
            : null;
        return maxSocial ? maxSocial.url : '';
    }

    function formatContactMessage(product) {
        const productStatus = getProductStatus(product).label;
        const price = `${formatPrice(product.price)} ${product.currency} за ${product.unit}`;
        if (activeCatalogIsFallback) {
            return `Здравствуйте! Меня интересует товар «${product.name}». В резервном каталоге указана цена ${price}, статус: «${productStatus}». Данные могут быть устаревшими. Подскажите, пожалуйста, актуальные цену и наличие.`;
        }
        return `Здравствуйте! Меня интересует товар «${product.name}». В каталоге указаны цена ${price} и статус «${productStatus}». Подскажите, пожалуйста, актуальные условия.`;
    }

    function openProductDialog(product) {
        dialogProduct.textContent = `${product.name} — ${formatPrice(product.price)} ${product.currency} за ${product.unit}`;
        dialogMessage.textContent = formatContactMessage(product);
        copyFeedback.textContent = '';
        const maxLink = document.getElementById('product-contact-max');
        maxLink.href = getMaxContactUrl() || '#products-contacts';
        if (!getMaxContactUrl()) maxLink.removeAttribute('target');
        dialog.showModal();
    }

    function openProductDetails(product) {
        const note = optionalText(product.note);
        const details = optionalText(product.details);
        if (!note && !details) return;

        detailsTitle.textContent = product.name || '';
        noteText.textContent = note;
        noteSection.hidden = !note;
        detailsText.textContent = details;
        detailsSection.hidden = !details;

        detailsImage.alt = product.name || 'Фото товара';
        detailsImage.dataset.placeholder = 'false';
        detailsImage.onerror = () => {
            if (detailsImage.dataset.placeholder === 'true') {
                detailsImage.hidden = true;
                return;
            }
            detailsImage.dataset.placeholder = 'true';
            detailsImage.src = 'img/products/product-placeholder.svg';
        };
        const imageUrl = product.image_url && isSafeImageUrl(product.image_url)
            ? String(product.image_url).trim()
            : 'img/products/product-placeholder.svg';
        detailsImage.hidden = false;
        detailsImage.src = imageUrl;

        detailsDialog.showModal();
        document.body.classList.add('has-open-product-details');
    }

    function renderProduct(product) {
        const article = document.createElement('article');
        article.className = 'product-card';

        const media = document.createElement('div');
        media.className = 'product-card-media';
        const imageTrigger = document.createElement('div');
        imageTrigger.className = 'product-card-image-trigger';
        const hasDetails = Boolean(optionalText(product.note) || optionalText(product.details));
        if (hasDetails) {
            imageTrigger.setAttribute('role', 'button');
            imageTrigger.tabIndex = 0;
            imageTrigger.setAttribute('aria-label', 'Просмотреть детали товара');
            imageTrigger.addEventListener('click', (event) => {
                if (event.target === image || event.detail === 0) openProductDetails(product);
            });
            imageTrigger.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openProductDetails(product);
                }
            });
        }
        const placeholderUrl = 'img/products/product-placeholder.svg';
        const image = document.createElement('img');
        image.alt = product.name || 'Фото товара';
        image.loading = 'lazy';
        const showImageFallback = () => {
            if (image.dataset.placeholder === 'true') {
                image.hidden = true;
                const fallback = document.createElement('div');
                fallback.className = 'product-card-media-fallback';
                fallback.textContent = 'Фото товара пока не добавлено';
                media.append(fallback);
                return;
            }
            image.dataset.placeholder = 'true';
            image.classList.add('is-placeholder');
            image.alt = 'Фото товара пока не добавлено';
            image.src = placeholderUrl;
        };
        image.addEventListener('error', showImageFallback);
        const imageUrl = product.image_url && String(product.image_url).trim();
        if (imageUrl && isSafeImageUrl(imageUrl)) image.src = imageUrl;
        else showImageFallback();
        imageTrigger.append(image);
        media.append(imageTrigger);

        const body = document.createElement('div');
        body.className = 'product-card-body';
        const title = document.createElement('h4');
        title.textContent = product.name;
        const unit = document.createElement('p');
        unit.className = 'product-unit';
        unit.textContent = `Цена за ${product.unit}`;
        const price = document.createElement('p');
        price.className = 'product-price';
        price.textContent = `${formatPrice(product.price)} ${product.currency || 'RUB'}`;
        const stock = document.createElement('p');
        const productStatus = getProductStatus(product);
        stock.className = `product-stock product-status-${String(product.status || 'custom').replace(/[^a-z0-9_-]/gi, '-')}${product.status === 'in_stock' ? '' : ' is-unavailable'}`;
        stock.textContent = activeCatalogIsFallback
            ? 'Актуальность уточняйте'
            : (product.statusLabel || productStatus.label);
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'products-button products-button-primary product-card-action';
        action.textContent = activeCatalogIsFallback ? 'Уточнить цену и наличие' : productStatus.button;
        action.addEventListener('click', () => openProductDialog(product));

        body.append(title, unit, price, stock, action);
        article.append(media, body);
        return article;
    }

    function isSafeImageUrl(value) {
        const url = String(value).trim();
        if (url.startsWith('img/')) {
            return !url.split('/').some((segment) => !segment || segment === '.' || segment === '..') && !url.includes('\\');
        }
        try {
            const parsed = new URL(url, window.location.href);
            return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
                && (url.startsWith('https://') || url.startsWith('http://'));
        } catch {
            return false;
        }
    }

    function validateCatalog(products) {
        if (!Array.isArray(products)) throw new Error('Ожидался массив товаров');
        const ids = new Set();
        for (const product of products) {
            if (!product || typeof product.id !== 'string' || !product.id.trim()) throw new Error('У товара отсутствует строковый id');
            if (ids.has(product.id)) throw new Error(`Повторяется id товара: ${product.id}`);
            ids.add(product.id);
            if (typeof product.name !== 'string' || !product.name.trim()) throw new Error(`У товара ${product.id} отсутствует name`);
            if (!allowedCategories.has(product.category)) throw new Error(`У товара ${product.id} неизвестная category`);
            if (typeof product.unit !== 'string' || !product.unit.trim()) throw new Error(`У товара ${product.id} отсутствует unit`);
            if (typeof product.price !== 'number' || !Number.isFinite(product.price) || product.price < 0) throw new Error(`У товара ${product.id} некорректная price`);
            if (product.currency !== 'RUB') throw new Error(`У товара ${product.id} currency должна быть RUB`);
            if (!strictStatuses.has(product.status)) throw new Error(`У товара ${product.id} неизвестный status`);
            if (typeof product.image_url !== 'string') throw new Error(`У товара ${product.id} image_url должен быть строкой`);
            if (product.note !== undefined && product.note !== null && typeof product.note !== 'string') throw new Error(`У товара ${product.id} note должен быть строкой или null`);
            if (product.details !== undefined && product.details !== null && typeof product.details !== 'string') throw new Error(`У товара ${product.id} details должен быть строкой или null`);
            if (product.image_url.trim() && product.image_url.startsWith('img/')) {
                const pathSegments = product.image_url.split('/');
                if (pathSegments.some((segment) => !segment || segment === '.' || segment === '..') || product.image_url.includes('\\')) {
                    throw new Error(`У товара ${product.id} некорректный относительный image_url`);
                }
            } else if (product.image_url.trim()) {
                let imageUrl;
                try { imageUrl = new URL(product.image_url); } catch { throw new Error(`У товара ${product.id} image_url должен быть HTTPS URL`); }
                if (imageUrl.protocol !== 'https:') throw new Error(`У товара ${product.id} image_url должен быть HTTPS URL`);
            }
        }
        return products;
    }

    function validatePermissiveCatalog(products) {
        if (!Array.isArray(products)) throw new Error('Ожидался массив товаров');
        const ids = new Set();
        for (const product of products) {
            if (!product || typeof product !== 'object' || Array.isArray(product)) throw new Error('Некорректная запись товара');
            if (typeof product.id !== 'string' || !product.id.trim()) throw new Error('У товара отсутствует строковый id');
            if (ids.has(product.id)) throw new Error(`Повторяется id товара: ${product.id}`);
            ids.add(product.id);
            if (typeof product.name !== 'string' || !product.name.trim()) throw new Error(`У товара ${product.id} отсутствует name`);
            for (const field of ['category', 'unit', 'currency', 'status', 'image_url']) {
                if (typeof product[field] !== 'string') throw new Error(`У товара ${product.id} поле ${field} должно быть строкой`);
            }
            if (product.price !== null && (typeof product.price !== 'number' || !Number.isFinite(product.price) || product.price < 0)) {
                throw new Error(`У товара ${product.id} некорректная price`);
            }
            if (product.statusLabel !== undefined && typeof product.statusLabel !== 'string') {
                throw new Error(`У товара ${product.id} statusLabel должен быть строкой`);
            }
            for (const field of ['note', 'details']) {
                if (product[field] !== undefined && product[field] !== null && typeof product[field] !== 'string') {
                    throw new Error(`У товара ${product.id} поле ${field} должно быть строкой или null`);
                }
            }
        }
        return products;
    }

    function validateCatalogForMode(products) {
        return catalogConfig && catalogConfig.mode === 'permissive'
            ? validatePermissiveCatalog(products)
            : validateCatalog(products);
    }

    function readCatalogCache() {
        try {
            const raw = window.localStorage.getItem(catalogCacheKey);
            if (!raw) return null;
            const cached = JSON.parse(raw);
            const expectedSource = catalogConfig && catalogConfig.csvUrl || '';
            const expectedMode = catalogConfig && catalogConfig.mode || 'strict';
            if (!cached || cached.version !== catalogCacheVersion || cached.source !== expectedSource
                || cached.mode !== expectedMode || !Number.isFinite(cached.timestamp)
                || cached.timestamp <= 0 || cached.timestamp > Date.now() + 5 * 60 * 1000) {
                throw new Error('Некорректные метаданные кэша каталога');
            }
            validateCatalogForMode(cached.products);
            return cached;
        } catch (error) {
            try { window.localStorage.removeItem(catalogCacheKey); } catch { /* localStorage недоступен */ }
            return null;
        }
    }

    function saveCatalogCache(products) {
        try {
            window.localStorage.setItem(catalogCacheKey, JSON.stringify({
                version: catalogCacheVersion,
                source: catalogConfig && catalogConfig.csvUrl || '',
                mode: catalogConfig && catalogConfig.mode || 'strict',
                timestamp: Date.now(),
                products,
            }));
        } catch (error) {
            console.warn('Не удалось сохранить кэш каталога в localStorage:', error);
        }
    }

    function formatCatalogTimestamp(timestamp) {
        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        }).format(new Date(timestamp));
    }

    function showCatalogStatus(message, state = '') {
        catalogStatus.textContent = message;
        catalogStatus.className = `catalog-status${state ? ` is-${state}` : ''}`;
    }

    function showCachedCatalogStatus(timestamp, updateFailed = false) {
        const age = Date.now() - timestamp;
        const dateLabel = formatCatalogTimestamp(timestamp);
        const staleLabel = age > catalogCacheTtlMs ? 'Кэш старше 48 часов и может быть устаревшим. ' : '';
        const refreshLabel = updateFailed ? 'Не удалось проверить обновления. ' : 'Проверяем обновления. ';
        showCatalogStatus(`${staleLabel}Каталог сохранён ${dateLabel}. ${refreshLabel}Цены и наличие уточняются.`, 'stale');
    }

    async function fetchTextWithTimeout(url) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), catalogFetchTimeoutMs);
        try {
            const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) throw new Error(`Источник каталога вернул HTTP ${response.status}`);
            return await response.text();
        } catch (error) {
            if (error && error.name === 'AbortError') throw new Error('Истекло время ожидания источника каталога (10 секунд)');
            throw error;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    async function fetchJsonWithTimeout(url) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), catalogFetchTimeoutMs);
        try {
            const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) throw new Error(`Резервный каталог вернул HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (error && error.name === 'AbortError') throw new Error('Истекло время ожидания резервного каталога (10 секунд)');
            throw error;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let field = '';
        let quoted = false;
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (quoted) {
                if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
                else if (char === '"') quoted = false;
                else field += char;
            } else if (char === '"' && field === '') quoted = true;
            else if (char === ',') { row.push(field); field = ''; }
            else if (char === '\n' || char === '\r') {
                if (char === '\r' && text[index + 1] === '\n') index += 1;
                row.push(field); rows.push(row); row = []; field = '';
            } else field += char;
        }
        if (quoted) throw new Error('CSV содержит незакрытое quoted-поле');
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        return rows;
    }

    function parseGoogleSheetCsv(text) {
        const rows = parseCsv(text).filter((row) => row.some((value) => value.trim() !== ''));
        if (!rows.length) throw new Error('CSV-таблица пуста');
        const headers = rows[0].map((value) => value.trim().replace(/^\uFEFF/, ''));
        const requiredHeaders = ['id', 'name', 'category', 'unit', 'price', 'currency', 'status', 'image_url'];
        const optionalHeaders = ['note', 'details'];
        const optional = headers.slice(requiredHeaders.length);
        const validHeaders = headers.slice(0, requiredHeaders.length).every((header, index) => header === requiredHeaders[index])
            && (optional.length === 0 || optional.length === 1 && optional[0] === optionalHeaders[0]
                || optional.length === 2 && optional.every((header, index) => header === optionalHeaders[index]));
        if (headers.length < requiredHeaders.length || headers.length > requiredHeaders.length + optionalHeaders.length || !validHeaders) {
            throw new Error('Заголовки таблицы должны содержать 8, 9 или 10 полей в утверждённом порядке');
        }
        const products = rows.slice(1)
            .map((row) => {
                const values = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
                const rawPrice = String(values.price).trim();
                const price = rawPrice === '' ? Number.NaN : (typeof values.price === 'number' ? values.price : Number(rawPrice.replace(',', '.')));
                return {
                    ...values,
                    price,
                    note: optionalText(values.note) || null,
                    details: optionalText(values.details) || null,
                };
            });
        return validateCatalog(products);
    }

    function renderCatalog(products, isFallback = false, permissive = false) {
        activeCatalogIsFallback = isFallback;
        sections.replaceChildren();
        const validProducts = permissive ? validatePermissiveCatalog(products) : validateCatalog(products);

        const categories = permissive
            ? [...new Set(validProducts.map((product) => product.category || 'Прочее'))]
                .sort((left, right) => {
                    const leftIndex = categoryOrder.findIndex(([category]) => category === left);
                    const rightIndex = categoryOrder.findIndex(([category]) => category === right);
                    if (leftIndex < 0 && rightIndex < 0) return 0;
                    if (leftIndex < 0) return 1;
                    if (rightIndex < 0) return -1;
                    return leftIndex - rightIndex;
                })
            : categoryOrder.map(([category]) => category);
        for (const category of categories) {
            const label = categoryOrder.find(([key]) => key === category)?.[1] || category;
            const categoryProducts = validProducts
                .filter((product) => (product.category || 'Прочее') === category)
                .sort((left, right) => (catalogStatusOrder[left.status] ?? 3) - (catalogStatusOrder[right.status] ?? 3));
            if (!categoryProducts.length) continue;
            const section = document.createElement('section');
            section.className = 'products-category';
            const heading = document.createElement('h3');
            heading.textContent = label;
            const grid = document.createElement('div');
            grid.className = 'products-grid';
            categoryProducts.forEach((product) => grid.append(renderProduct(product)));
            section.append(heading, grid);
            sections.append(section);
        }

        catalogStatus.textContent = isFallback
            ? 'Таблица недоступна. Показан резервный каталог: цены и статусы могут быть устаревшими, уточните их в MAX.'
            : (validProducts.length ? '' : 'В таблице пока нет опубликованных товаров.');
        catalogStatus.className = `catalog-status${isFallback ? ' is-fallback' : ''}`;
    }

    async function loadLiveCatalog() {
        if (catalogConfig && catalogConfig.mode === 'permissive') {
            if (!catalogConfig.csvUrl) throw new Error('Не настроен URL CSV Google Таблицы');
            if (!window.ProductCatalogAdapter) throw new Error('Не загружен временный адаптер каталога');
            return window.ProductCatalogAdapter.load(catalogConfig.csvUrl);
        }
        if (!catalogConfig || !catalogConfig.csvUrl) throw new Error('Не настроен URL опубликованного CSV Google Таблицы');
        return parseGoogleSheetCsv(await fetchTextWithTimeout(catalogConfig.csvUrl));
    }

    function renderContactDetails() {
        const contact = window.APP_CONFIG && window.APP_CONFIG.contact;
        if (!contact) return;

        const phone = document.getElementById('products-contact-phone');
        if (phone && contact.phone) {
            phone.textContent = contact.phone;
            phone.href = contact.phoneHref || '#';
        }

        const address = document.getElementById('products-contact-address');
        if (address && contact.address) address.textContent = contact.address;

        const socials = document.getElementById('products-contact-socials');
        if (socials && Array.isArray(contact.socials)) {
            socials.replaceChildren();
            contact.socials.forEach((social) => {
                const item = document.createElement('li');
                const link = document.createElement('a');
                link.href = social.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = `${social.icon ? `${social.icon} ` : ''}${social.name}`;
                item.append(link);
                socials.append(item);
            });
        }
    }

    async function loadCatalog() {
        const permissive = catalogConfig && catalogConfig.mode === 'permissive';
        const cached = readCatalogCache();
        if (cached) {
            renderCatalog(cached.products, false, permissive);
            showCachedCatalogStatus(cached.timestamp);
        } else {
            sections.replaceChildren();
            showCatalogStatus('Загружаем актуальный каталог…');
        }

        try {
            const products = validateCatalogForMode(await loadLiveCatalog());
            const unchanged = cached && JSON.stringify(cached.products) === JSON.stringify(products);
            saveCatalogCache(products);
            if (unchanged) {
                activeCatalogIsFallback = false;
                showCatalogStatus('');
            } else {
                renderCatalog(products, false, permissive);
            }
        } catch (error) {
            console.error('Не удалось загрузить CSV-каталог Google Sheets:', error);
            if (cached) {
                showCachedCatalogStatus(cached.timestamp, true);
                return;
            }
            try {
                const fallbackProducts = validateCatalogForMode(await fetchJsonWithTimeout('mock/products.json'));
                renderCatalog(fallbackProducts, true, permissive);
                const sourceMessage = catalogConfig && catalogConfig.csvUrl
                    ? 'Опубликованный CSV недоступен или вернул некорректные данные.'
                    : 'Публичный CSV URL Google Таблицы ещё не настроен.';
                showCatalogStatus(`${sourceMessage} Показан резервный каталог: цены и статусы могут быть устаревшими, уточните их в MAX.`, 'fallback');
            } catch (fallbackError) {
                console.error('Не удалось загрузить аварийный JSON-каталог:', fallbackError);
                catalogStatus.className = 'catalog-status is-error';
                catalogStatus.replaceChildren(document.createTextNode('Не удалось загрузить каталог. '));
                const retry = document.createElement('button');
                retry.className = 'catalog-retry';
                retry.type = 'button';
                retry.textContent = 'Повторить';
                retry.addEventListener('click', loadCatalog);
                catalogStatus.append(retry);
            }
        }
    }

    document.querySelector('.products-menu-toggle').addEventListener('click', (event) => {
        const button = event.currentTarget;
        const nav = document.getElementById('products-nav');
        const isOpen = nav.classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(isOpen));
    });

    document.querySelectorAll('.products-nav a').forEach((link) => {
        link.addEventListener('click', () => {
            document.getElementById('products-nav').classList.remove('is-open');
            document.querySelector('.products-menu-toggle').setAttribute('aria-expanded', 'false');
        });
    });

    detailsDialog.addEventListener('click', (event) => {
        if (event.target === detailsDialog) detailsDialog.close();
    });
    detailsDialog.addEventListener('close', () => {
        document.body.classList.remove('has-open-product-details');
        detailsDialog.classList.remove('is-dragging');
        detailsDialog.style.removeProperty('--sheet-drag-y');
    });

    let dragStart = null;
    detailsDragRegion.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        dragStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        detailsDragRegion.setPointerCapture(event.pointerId);
        detailsDialog.classList.add('is-dragging');
    });
    detailsDragRegion.addEventListener('pointermove', (event) => {
        if (!dragStart || event.pointerId !== dragStart.pointerId) return;
        const distance = Math.max(0, event.clientY - dragStart.y);
        detailsDialog.style.setProperty('--sheet-drag-y', `${distance}px`);
    });
    const finishSheetDrag = (event) => {
        if (!dragStart || event.pointerId !== dragStart.pointerId) return;
        const distanceY = event.clientY - dragStart.y;
        const distanceX = event.clientX - dragStart.x;
        dragStart = null;
        detailsDialog.classList.remove('is-dragging');
        if (distanceY > 80 && distanceY > Math.abs(distanceX)) {
            detailsDialog.close();
        } else {
            detailsDialog.style.removeProperty('--sheet-drag-y');
        }
    };
    detailsDragRegion.addEventListener('pointerup', finishSheetDrag);
    detailsDragRegion.addEventListener('pointercancel', finishSheetDrag);

    document.getElementById('product-contact-copy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(dialogMessage.textContent);
            copyFeedback.textContent = 'Текст обращения скопирован.';
        } catch (error) {
            dialogMessage.focus();
            copyFeedback.textContent = 'Не удалось скопировать автоматически. Выделите текст обращения и скопируйте его вручную.';
        }
    });
    renderContactDetails();
    loadCatalog();
})();
