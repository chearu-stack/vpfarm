/* Temporary, reversible adapter for the shared Google Sheets CSV catalog. */
(() => {
    const aliases = {
        id: ['id', 'product_id', 'sku'],
        name: ['name', 'title', 'product', 'product_name', 'наименование', 'название'],
        category: ['category', 'категория', 'раздел'],
        unit: ['unit', 'единица', 'ед_изм', 'единица_измерения'],
        price: ['price', 'цена', 'стоимость'],
        currency: ['currency', 'валюта'],
        status: ['status', 'availability', 'in_stock', 'наличие', 'статус'],
        image_url: ['image_url', 'image', 'photo', 'фото', 'изображение', 'ссылка_на_фото'],
    };

    const cleanHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let field = '';
        let quoted = false;
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (quoted && char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
            else if (char === '"') quoted = !quoted;
            else if (!quoted && char === ',') { row.push(field); field = ''; }
            else if (!quoted && (char === '\n' || char === '\r')) {
                if (char === '\r' && text[index + 1] === '\n') index += 1;
                row.push(field); rows.push(row); row = []; field = '';
            } else field += char;
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
    }

    function normalizeStatus(value) {
        const raw = String(value ?? '').trim();
        const normalized = raw.toLowerCase().replace(/[ё]/g, 'е').replace(/[\s-]+/g, '_');
        const known = {
            'in_stock': ['in_stock', 'available', 'true', 'yes', '1', 'в_наличии', 'есть'],
            'out_of_stock': ['out_of_stock', 'unavailable', 'false', 'no', '0', 'нет_в_наличии', 'нет'],
            'on_order': ['on_order', 'order', 'под_заказ'],
            'seasonal': ['seasonal', 'season', 'сезонный', 'сезонная'],
            'waitlist': ['waitlist', 'waiting_list', 'лист_ожидания'],
        };
        const match = Object.entries(known).find(([, values]) => values.includes(normalized));
        if (match) return { code: match[0], label: '' };
        return { code: 'custom', label: raw || 'Уточняйте наличие' };
    }

    function normalizePrice(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const raw = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
        if (!raw) return null;
        const price = Number(raw);
        return Number.isFinite(price) && price >= 0 ? price : null;
    }

    function parse(text) {
        const rows = parseCsv(text);
        if (!rows.length) return [];

        const headers = rows[0].map((value) => cleanHeader(String(value).replace(/^\uFEFF/, '')));
        const columns = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [
            field,
            headers.findIndex((header) => names.includes(header)),
        ]));

        return rows.slice(1).map((cells, index) => {
            const value = (field) => columns[field] >= 0 ? String(cells[columns[field]] ?? '').trim() : '';
            const rawCategory = value('category');
            const status = normalizeStatus(value('status'));
            return {
                id: value('id') || `sheet-row-${index + 1}`,
                name: value('name') || cells.find((cell) => String(cell).trim()) || `Товар ${index + 1}`,
                category: rawCategory || 'Прочее',
                unit: value('unit'),
                price: normalizePrice(value('price')),
                currency: value('currency') || 'RUB',
                status: status.code,
                statusLabel: status.label,
                image_url: value('image_url'),
            };
        });
    }

    async function load(csvUrl) {
        let response;
        try {
            response = await fetch(csvUrl, { cache: 'no-store' });
        } catch (cause) {
            const error = new Error('Не удалось получить CSV из-за сетевой ошибки');
            error.isNetworkFailure = true;
            error.cause = cause;
            throw error;
        }
        if (!response.ok) {
            const error = new Error(`CSV Google Таблицы вернул HTTP ${response.status}`);
            error.isNetworkFailure = response.status >= 500;
            throw error;
        }
        try {
            return parse(await response.text());
        } catch (cause) {
            const error = new Error('Соединение с CSV прервалось во время загрузки');
            error.isNetworkFailure = true;
            error.cause = cause;
            throw error;
        }
    }

    window.ProductCatalogAdapter = { load };
})();
