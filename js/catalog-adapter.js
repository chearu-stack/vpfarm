/* Temporary, reversible adapter for the shared Google Sheets CSV catalog. */
(() => {
    const requiredHeaders = ['id', 'name', 'category', 'unit', 'price', 'currency', 'status', 'image_url'];
    const optionalHeaders = ['note', 'details'];
    const fetchTimeoutMs = 10000;

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
        if (!rows.length) throw new Error('CSV пуст: отсутствует строка заголовков');

        const headers = rows[0].map((value) => String(value).trim().replace(/^\uFEFF/, ''));
        const optional = headers.slice(requiredHeaders.length);
        const validHeaders = headers.slice(0, requiredHeaders.length).every((header, index) => header === requiredHeaders[index])
            && (optional.length === 0 || optional.length === 1 && optional[0] === optionalHeaders[0]
                || optional.length === 2 && optional.every((header, index) => header === optionalHeaders[index]));
        if (headers.length < requiredHeaders.length || headers.length > requiredHeaders.length + optionalHeaders.length || !validHeaders) {
            throw new Error('Заголовки CSV должны содержать 8, 9 или 10 полей в утверждённом порядке');
        }

        return rows.slice(1).map((cells, index) => {
            const value = (field) => {
                const column = headers.indexOf(field);
                return column >= 0 ? String(cells[column] ?? '').trim() : '';
            };
            const rawCategory = value('category');
            const status = normalizeStatus(value('status'));
            const note = value('note');
            const details = value('details');
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
                note: note || null,
                details: details || null,
            };
        });
    }

    async function load(csvUrl) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), fetchTimeoutMs);
        try {
            const response = await fetch(csvUrl, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) {
                const error = new Error(`CSV Google Таблицы вернул HTTP ${response.status}`);
                error.isNetworkFailure = response.status >= 500;
                throw error;
            }
            return parse(await response.text());
        } catch (cause) {
            if (cause && typeof cause.message === 'string' && cause.message.startsWith('CSV Google Таблицы вернул HTTP')) throw cause;
            if (cause instanceof Error && !cause.name.includes('Abort') && !controller.signal.aborted
                && !(cause instanceof TypeError)) throw cause;
            const error = new Error(cause && cause.name === 'AbortError'
                ? 'Истекло время ожидания CSV (10 секунд)'
                : 'Не удалось получить CSV из-за сетевой ошибки');
            error.isNetworkFailure = true;
            error.cause = cause;
            throw error;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    window.ProductCatalogAdapter = { load };
})();
