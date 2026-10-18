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
    const statusDetails = {
        in_stock: { label: 'В наличии', button: 'Связаться по поводу товара' },
        out_of_stock: { label: 'Нет в наличии', button: 'Уточнить наличие' },
        on_order: { label: 'Под заказ', button: 'Уточнить возможность заказа' },
        seasonal: { label: 'Сезонный товар', button: 'Оставить заявку на сезон' },
        waitlist: { label: 'Лист ожидания', button: 'Уточнить лист ожидания' },
    };
    const allowedCategories = new Set(categoryOrder.map(([category]) => category));
    const strictStatuses = new Set(['in_stock', 'on_order', 'seasonal', 'waitlist']);
    const catalogConfig = window.APP_CONFIG && window.APP_CONFIG.productsCatalog;
    let activeCatalogIsFallback = false;

    const formatPrice = (price) => price === null || price === undefined || price === ''
        ? 'Цена уточняется'
        : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(price);

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

    function renderProduct(product) {
        const article = document.createElement('article');
        article.className = 'product-card';

        const media = document.createElement('div');
        media.className = 'product-card-media';
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
        media.append(image);

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
        if (headers.length !== requiredHeaders.length || headers.some((header, index) => header !== requiredHeaders[index])) {
            throw new Error('Заголовки таблицы должны точно совпадать с утверждённым контрактом и порядком полей');
        }
        const products = rows.slice(1)
            .map((row) => {
                const values = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
                const rawPrice = String(values.price).trim();
                const price = rawPrice === '' ? Number.NaN : (typeof values.price === 'number' ? values.price : Number(rawPrice.replace(',', '.')));
                return { ...values, price };
            });
        return validateCatalog(products);
    }

    function renderCatalog(products, isFallback = false, permissive = false) {
        activeCatalogIsFallback = isFallback;
        sections.replaceChildren();
        const validProducts = permissive ? products : validateCatalog(products);

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
            const categoryProducts = validProducts.filter((product) => (product.category || 'Прочее') === category);
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
        const response = await fetch(catalogConfig.csvUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`CSV Google Таблицы вернул HTTP ${response.status}`);
        return parseGoogleSheetCsv(await response.text());
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
        catalogStatus.textContent = 'Загружаем актуальный каталог…';
        catalogStatus.className = 'catalog-status';
        try {
            const products = await loadLiveCatalog();
            renderCatalog(products, false, catalogConfig && catalogConfig.mode === 'permissive');
        } catch (error) {
            console.error('Не удалось загрузить CSV-каталог Google Sheets:', error);
            if (catalogConfig && catalogConfig.mode === 'permissive' && !error.isNetworkFailure) {
                sections.replaceChildren();
                catalogStatus.className = 'catalog-status is-error';
                catalogStatus.textContent = `${error.message}. Проверьте доступ к Google Таблице.`;
                return;
            }
            try {
                const response = await fetch('mock/products.json', { cache: 'no-store' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                renderCatalog(await response.json(), true);
                const sourceMessage = catalogConfig && catalogConfig.csvUrl
                    ? 'Опубликованный CSV недоступен или вернул некорректные данные.'
                    : 'Публичный CSV URL Google Таблицы ещё не настроен.';
                catalogStatus.textContent = `${sourceMessage} Показан резервный каталог: цены и статусы могут быть устаревшими, уточните их в MAX.`;
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
