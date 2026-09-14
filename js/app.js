(function () {
  'use strict';

  // ---------- Конфигурация ----------
  const CONFIG = window.APP_CONFIG || {};
  const API_BASE_URL = (CONFIG.API_BASE_URL || '').replace(/\/$/, '');

  // ---------- Утилиты ----------
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatPrice(price) {
    const num = Number(price);
    if (isNaN(num)) return '—';
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getStockBadgeHtml(breed) {
    const status = breed.stock_status;
    let text = '';
    let className = 'stock-badge';

    switch (status) {
      case 'many':
        text = 'Много';
        className += ' many';
        break;
      case 'available':
        text = 'Есть в наличии';
        className += ' available';
        break;
      case 'few':
        text = 'Осталось мало';
        className += ' few';
        break;
      case 'none':
        text = 'Нет в наличии';
        className += ' none';
        break;
      case 'expected':
        if (breed.expected_date) {
          const date = new Date(breed.expected_date);
          if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            text = `Ожидается ${day}.${month}`;
          } else {
            text = 'Ожидается';
          }
        } else {
          text = 'Ожидается';
        }
        className += ' expected';
        break;
      default:
        return '';
    }

    return `<div class="${className}">${text}</div>`;
  }

  /**
   * Нормализация телефона для отправки: приводит к формату +7XXXXXXXXXX (11 цифр).
   * Принимает значение, оставляет только цифры и знак плюса.
   */
  function normalizePhone(phone) {
    // Оставляем только цифры и +, затем убираем лишние плюсы, кроме первого
    let digits = phone.replace(/[^\d+]/g, '');
    // Если есть + в середине — удалим
    digits = digits.replace(/\+/g, (match, offset, str) => offset === 0 ? match : '');
    // Если номер начинается с 8, заменяем на +7
    if (digits.startsWith('8')) {
      digits = '+7' + digits.slice(1);
    } else if (digits.startsWith('7')) {
      digits = '+7' + digits.slice(1);
    } else if (digits.startsWith('9')) {
      digits = '+7' + digits;
    } // если что-то ещё, оставляем как есть
    return digits;
  }

  /**
   * Проверка корректности российского номера.
   * Допустим: +7XXXXXXXXXX или 8XXXXXXXXXX (после нормализации) длиной 11 цифр (с учётом + или 8).
   */
  function validatePhone(phone) {
    const normalized = normalizePhone(phone);
    // После нормализации должно быть 12 символов: +7 и 10 цифр
    return /^\+7\d{10}$/.test(normalized);
  }

  /**
   * Валидация всей формы. Возвращает объект { valid: boolean, data: object, errors: object }
   */
  function validateForm(form) {
    const name = form.name.value.trim();
    const phoneRaw = form.phone.value.trim();
    const breed = form.breed_id.value;
    const quantity = form.quantity.value.trim();

    const errors = {};

    if (name.length < 2 || name.length > 100) {
      errors.name = 'Введите имя от 2 до 100 символов.';
    }

    if (!phoneRaw) {
      errors.phone = 'Введите телефон.';
    } else if (!validatePhone(phoneRaw)) {
      errors.phone = 'Введите корректный российский номер, например +7 900 123-45-67.';
    }

    if (!breed) {
      errors.breed = 'Выберите породу.';
    }

    const quantityNum = Number(quantity);
    if (!quantity || isNaN(quantityNum) || !Number.isInteger(quantityNum) || quantityNum < 1 || quantityNum > 10000) {
      errors.quantity = 'Введите целое число от 1 до 10000.';
    }

    const phoneNormalized = normalizePhone(phoneRaw);
    const data = {
      name: name,
      phone: phoneNormalized,
      breed_id: breed,
      quantity: quantityNum
    };

    return {
      valid: Object.keys(errors).length === 0,
      data,
      errors
    };
  }

  function showFieldError(fieldId, errorId, message) {
    const errorEl = document.getElementById(errorId);
    if (message) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
      document.getElementById(fieldId).setAttribute('aria-invalid', 'true');
    } else {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
      document.getElementById(fieldId).removeAttribute('aria-invalid');
    }
  }

  function clearFieldErrors() {
    const errorIds = ['name-error', 'phone-error', 'breed-error', 'quantity-error'];
    errorIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = '';
        el.classList.remove('visible');
      }
    });
    ['name', 'phone', 'breed', 'quantity'].forEach(id => {
      const field = document.getElementById(id);
      if (field) field.removeAttribute('aria-invalid');
    });
  }

  // ---------- Контент статических секций ----------
  function initStaticContent() {
    // Тексты о ферме, доставке, гарантиях
    const texts = CONFIG.texts || {};
    if (texts.about && Array.isArray(texts.about)) {
      const container = document.getElementById('about-text');
      container.innerHTML = texts.about.map(p => `<p>${escapeHtml(p)}</p>`).join('');
    }
    if (texts.delivery && Array.isArray(texts.delivery)) {
      const container = document.getElementById('delivery-text');
      container.innerHTML = texts.delivery.map(p => `<p>${escapeHtml(p)}</p>`).join('');
    }
    if (texts.guarantees && Array.isArray(texts.guarantees)) {
      const container = document.getElementById('guarantees-text');
      container.innerHTML = texts.guarantees.map(p => `<p>${escapeHtml(p)}</p>`).join('');
    }

    // Контактные данные
    const contact = CONFIG.contact || {};
    if (contact.phone) {
      document.getElementById('contact-phone').textContent = contact.phone;
      document.getElementById('footer-phone').textContent = contact.phone;
      document.getElementById('contact-phone').setAttribute('href', contact.phoneHref || '#');
      document.getElementById('footer-phone').setAttribute('href', contact.phoneHref || '#');
    }
    if (contact.address) {
      document.getElementById('contact-address').textContent = contact.address;
      document.getElementById('footer-address').textContent = contact.address;
    }
    if (contact.socials && Array.isArray(contact.socials)) {
      const socialsList = document.getElementById('contact-socials');
      socialsList.innerHTML = '';
      contact.socials.forEach(social => {
        const li = document.createElement('li');
        li.className = 'social-item';
        const link = document.createElement('a');
        link.href = social.url || '#';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'social-link';
        link.textContent = `${social.icon ? social.icon + ' ' : ''}${social.name}`;
        li.appendChild(link);
        socialsList.appendChild(li);
      });
    }

    // Год в футере
    document.getElementById('current-year').textContent = new Date().getFullYear();
  }

  // ---------- Каталог пород ----------
  async function loadBreeds() {
    const statusEl = document.getElementById('catalog-status');
    const gridEl = document.getElementById('catalog-grid');
    statusEl.innerHTML = '';
    gridEl.innerHTML = '';

    statusEl.textContent = 'Загрузка каталога...';
    statusEl.className = 'catalog-status loading';

    try {
      const response = await fetch(`${API_BASE_URL}/api/breeds`);
      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }
      const breeds = await response.json();
      if (!Array.isArray(breeds) || breeds.length === 0) {
        statusEl.textContent = 'Каталог пуст. Загляните позже или свяжитесь с нами.';
        statusEl.className = 'catalog-status empty';
        return;
      }

      renderBreeds(breeds);
      fillBreedSelect(breeds);
      statusEl.textContent = '';
      statusEl.className = 'catalog-status';
    } catch (error) {
      console.error('Ошибка загрузки каталога:', error);
      statusEl.className = 'catalog-status error';
      statusEl.innerHTML = `
        <p>Не удалось загрузить каталог. Проверьте подключение и попробуйте ещё раз.</p>
        <button class="btn btn-outline" id="retry-load-breeds">Повторить</button>
      `;
      const retryBtn = document.getElementById('retry-load-breeds');
      if (retryBtn) {
        retryBtn.addEventListener('click', loadBreeds);
      }
    }
  }

  function renderBreeds(breeds) {
    const grid = document.getElementById('catalog-grid');
    grid.innerHTML = breeds.map(breed => {
      const imgUrl = breed.image_url || 'assets/images/placeholder.jpg';
      return `
        <article class="breed-card" data-breed-id="${escapeHtml(breed.id)}">
          <div class="breed-image-wrapper">
            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(breed.name)}" class="breed-image" loading="lazy"
                 onerror="this.onerror=null; this.src='assets/images/placeholder.jpg';">
          </div>
          <div class="breed-info">
            <h3 class="breed-name">${escapeHtml(breed.name)}</h3>
            ${getStockBadgeHtml(breed)}
            <p class="breed-price">${formatPrice(breed.price)} <span class="currency">₽</span></p>
            <p class="breed-description">${escapeHtml(breed.description || '')}</p>
            <button class="btn btn-primary btn-order" data-breed-id="${escapeHtml(breed.id)}">Заказать</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function fillBreedSelect(breeds) {
    const select = document.getElementById('breed');
    // Очищаем все опции, кроме первой
    select.querySelectorAll('option:not([value=""])').forEach(opt => opt.remove());
    breeds.forEach(breed => {
      const option = document.createElement('option');
      option.value = breed.id;
      option.textContent = `${breed.name} (${formatPrice(breed.price)} ₽)`;
      select.appendChild(option);
    });
  }

  function onBreedOrderClick(e) {
    const button = e.target.closest('.btn-order');
    if (!button) return;
    const breedId = button.dataset.breedId;
    const select = document.getElementById('breed');
    // Устанавливаем значение и прокручиваем к форме
    select.value = breedId;
    document.getElementById('application').scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Фокус на форме для удобства
    document.getElementById('name').focus({ preventScroll: true });
  }

  // ---------- Форма заявки ----------
  async function handleFormSubmit(e) {
    e.preventDefault();
    clearFieldErrors();
    const feedback = document.getElementById('form-feedback');
    feedback.textContent = '';
    feedback.className = 'form-feedback';

    const form = e.target;
    const validation = validateForm(form);

    if (!validation.valid) {
      // Показываем ошибки
      const errors = validation.errors;
      if (errors.name) showFieldError('name', 'name-error', errors.name);
      if (errors.phone) showFieldError('phone', 'phone-error', errors.phone);
      if (errors.breed) showFieldError('breed', 'breed-error', errors.breed);
      if (errors.quantity) showFieldError('quantity', 'quantity-error', errors.quantity);
      feedback.textContent = 'Пожалуйста, исправьте ошибки в форме.';
      feedback.className = 'form-feedback error';
      return;
    }

    // Проверка Turnstile: ищем скрытый инпут, создаваемый виджетом
    const turnstileInput = form.querySelector('input[name="cf-turnstile-response"]');
    const turnstileToken = turnstileInput ? turnstileInput.value.trim() : '';
    if (!turnstileToken) {
      feedback.textContent = 'Пройдите проверку, что вы не робот';
      feedback.className = 'form-feedback error';
      return;
    }

    // Добавляем токен в данные запроса
    validation.data.turnstile_token = turnstileToken;

    // Отправка
    const submitBtn = form.querySelector('.btn-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправка...';

    try {
      const response = await fetch(`${API_BASE_URL}/api/applications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(validation.data)
      });

      if (!response.ok) {
        let errorMessage = 'Не удалось отправить заявку. Пожалуйста, попробуйте позже.';
        try {
          const errorData = await response.json();
          if (errorData && errorData.detail) {
            errorMessage = typeof errorData.detail === 'string' ? errorData.detail : errorMessage;
          }
        } catch (parseError) {
          // ignore
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('Заявка успешно отправлена:', result);

      // Успешная отправка
      feedback.textContent = 'Заявка отправлена! Мы свяжемся с вами в ближайшее время.';
      feedback.className = 'form-feedback success';
      form.reset();
      // Сбрасываем значения полей (браузер сбросит, но select может остаться)
      form.breed_id.value = '';
      clearFieldErrors();

      // Сбрасываем Turnstile после успешной отправки
      if (window.turnstile && typeof window.turnstile.reset === 'function') {
        window.turnstile.reset();
      }
    } catch (error) {
      console.error('Ошибка отправки формы:', error);
      feedback.textContent = error.message || 'Произошла ошибка. Попробуйте ещё раз.';
      feedback.className = 'form-feedback error';
      // В случае ошибки не сбрасываем Turnstile, чтобы пользователь мог повторить без прохождения повторной проверки,
      // но токен мог быть использован, поэтому лучше тоже сбросить? Оставляем как есть: если ошибка серверная, токен может быть не израсходован.
      // При необходимости можно сбросить, но по ТЗ не требуется.
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Отправить заявку';
    }
  }

  // ---------- Мобильная навигация ----------
  function initMobileNav() {
    const toggle = document.querySelector('.nav-toggle');
    const navList = document.querySelector('.nav-list');
    if (!toggle || !navList) return;

    toggle.addEventListener('click', () => {
      const isOpen = navList.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
    });

    // Закрываем меню при клике на ссылку (для мобильных)
    navList.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navList.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Открыть меню');
      });
    });
  }

  // ---------- Обработка ввода телефона (лёгкая маска) ----------
  function initPhoneInput() {
    const phoneInput = document.getElementById('phone');
    if (!phoneInput) return;

    phoneInput.addEventListener('input', () => {
      let value = phoneInput.value;
      // Удаляем всё, кроме цифр, +, пробелов, скобок, дефисов
      value = value.replace(/[^\d+\s\-()]/g, '');
      // Ограничим длину в разумных пределах
      const digits = value.replace(/\D/g, '');
      if (digits.length > 11) {
        // Обрезаем лишние цифры
        const truncated = digits.slice(0, 11);
        // Восстанавливаем форматирование? Просто оставим цифры с плюсом
        phoneInput.value = '+7' + truncated.slice(1);
      } else {
        phoneInput.value = value;
      }
      // Автоматически добавляем +7, если начинается с 8 или 9
      if (value.startsWith('8') && value.length === 1) {
        phoneInput.value = '+7';
      } else if (value.startsWith('9') && value.length === 1) {
        phoneInput.value = '+7';
      }
    });
  }

  // ---------- Инициализация ----------
  document.addEventListener('DOMContentLoaded', () => {
    initStaticContent();
    initMobileNav();
    initPhoneInput();

    // Делегирование для кнопок "Заказать" в каталоге
    document.getElementById('catalog-grid').addEventListener('click', onBreedOrderClick);

    // Загрузка каталога
    loadBreeds();

    // Обработчик формы
    const form = document.getElementById('application-form');
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
    }
  });
})();
