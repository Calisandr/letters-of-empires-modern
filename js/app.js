(() => {
  const app = document.querySelector('.app-shell');
  const routeToggle = document.getElementById('routeToggle');
  const zoomLayer = document.getElementById('mapZoomLayer');
  const tooltip = document.getElementById('mapTooltip');
  const mapCanvas = document.querySelector('.map-canvas');
  const mapMode = document.getElementById('mapMode');

  const statusText = {
    russia: 'Ваша держава',
    ally: 'Союзники',
    friendly: 'Дружественные отношения',
    neutral: 'Нейтральный статус',
    risk: 'Риск конфликта',
    hostile: 'Враждебная держава',
    common: 'Неизвестный статус'
  };

  const countryNames = {
    Russia: 'Россия',
    'United States of America': 'США',
    Canada: 'Канада',
    Brazil: 'Бразилия',
    Argentina: 'Аргентина',
    France: 'Франция',
    Germany: 'Германия',
    Italy: 'Италия',
    Spain: 'Испания',
    Ukraine: 'Украина',
    China: 'Китай',
    India: 'Индия',
    Japan: 'Япония',
    Turkey: 'Турция',
    Kazakhstan: 'Казахстан',
    Egypt: 'Египет',
    Australia: 'Австралия',
    'South Africa': 'ЮАР',
    'United Kingdom': 'Великобритания',
    Mexico: 'Мексика',
    Greenland: 'Гренландия',
    Mongolia: 'Монголия',
    Iran: 'Иран',
    Iraq: 'Ирак',
    Afghanistan: 'Афганистан',
    Pakistan: 'Пакистан',
    Indonesia: 'Индонезия',
    Norway: 'Норвегия',
    Sweden: 'Швеция',
    Finland: 'Финляндия',
    Poland: 'Польша',
    Belarus: 'Беларусь',
    Romania: 'Румыния',
    Greece: 'Греция',
    Portugal: 'Португалия',
    Morocco: 'Марокко',
    Algeria: 'Алжир',
    Libya: 'Ливия',
    Sudan: 'Судан',
    Ethiopia: 'Эфиопия',
    Kenya: 'Кения',
    Nigeria: 'Нигерия',
    Peru: 'Перу',
    Chile: 'Чили',
    Colombia: 'Колумбия',
    Venezuela: 'Венесуэла'
  };

  document.querySelectorAll('.nav-link').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      showToast(`Раздел «${button.textContent.trim()}» выбран`);
    });
  });

  if (routeToggle) {
    routeToggle.addEventListener('change', () => {
      app.dataset.routes = routeToggle.checked ? 'on' : 'off';
    });
  }

  let zoom = 1;
  const applyZoom = () => {
    zoomLayer.style.transform = `scale(${zoom.toFixed(2)})`;
  };

  document.getElementById('zoomIn')?.addEventListener('click', () => {
    zoom = Math.min(1.7, zoom + 0.12);
    applyZoom();
  });

  document.getElementById('zoomOut')?.addEventListener('click', () => {
    zoom = Math.max(0.78, zoom - 0.12);
    applyZoom();
  });

  document.getElementById('centerMap')?.addEventListener('click', () => {
    zoom = 1;
    applyZoom();
    showToast('Карта центрирована');
  });

  document.getElementById('fitMap')?.addEventListener('click', async () => {
    const mapSection = document.querySelector('.map-section');
    if (!document.fullscreenElement && mapSection?.requestFullscreen) {
      await mapSection.requestFullscreen().catch(() => null);
    } else if (document.exitFullscreen) {
      await document.exitFullscreen().catch(() => null);
    }
  });

  const modes = [
    { title: 'Политическая карта', className: '' },
    { title: 'Торговая карта', className: 'trade-mode' },
    { title: 'Стратегическая карта', className: 'strategy-mode' }
  ];
  let modeIndex = 0;
  mapMode?.addEventListener('click', () => {
    modeIndex = (modeIndex + 1) % modes.length;
    modes.forEach((m) => m.className && app.classList.remove(m.className));
    const mode = modes[modeIndex];
    if (mode.className) app.classList.add(mode.className);
    mapMode.innerHTML = `${mode.title} <span>⌄</span>`;
    showToast(`Включён режим: ${mode.title}`);
  });

  const showTooltip = (event, country) => {
    const name = countryNames[country.dataset.name] || country.dataset.name;
    const status = statusText[country.dataset.status] || statusText.common;
    const rect = mapCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    tooltip.innerHTML = `<strong>${name}</strong><small>${status}</small>`;
    tooltip.classList.add('visible');

    const margin = 8;
    const tooltipWidth = tooltip.offsetWidth || 140;
    const tooltipHeight = tooltip.offsetHeight || 48;
    let left = x - tooltipWidth / 2;
    let top = y - tooltipHeight - 14;

    if (top < margin) top = y + 16;

    left = Math.max(margin, Math.min(left, rect.width - tooltipWidth - margin));
    top = Math.max(margin, Math.min(top, rect.height - tooltipHeight - margin));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  document.querySelectorAll('.country').forEach((country) => {
    country.addEventListener('mousemove', (event) => showTooltip(event, country));
    country.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    country.addEventListener('click', () => {
      document.querySelectorAll('.country.selected').forEach((item) => item.classList.remove('selected'));
      country.classList.add('selected');
      const name = countryNames[country.dataset.name] || country.dataset.name;
      showToast(`Выбрана страна: ${name}`);
    });
  });

  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');

  chatForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    const now = new Date();
    const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('p');
    row.innerHTML = `<time>${time}</time><span class="flag russia"></span><b>Россия:</b><span class="chat-text">${escapeHtml(text)}</span>`;
    chatMessages.append(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatInput.value = '';
  });

  document.querySelectorAll('.quick-actions button, .icon-button, .panel-heading button, .show-all, .create-order').forEach((button) => {
    button.addEventListener('click', () => {
      const label = button.getAttribute('aria-label') || button.textContent.trim();
      if (label) showToast(label);
    });
  });

  document.querySelectorAll('.order-card button[title="Отменить"]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.order-card');
      card.style.opacity = '.38';
      card.style.filter = 'grayscale(.55)';
      showToast('Приказ помечен к отмене');
    });
  });

  document.querySelectorAll('.order-card button[title="Посмотреть"]').forEach((button) => {
    button.addEventListener('click', () => {
      const title = button.closest('.order-card')?.querySelector('h3')?.textContent || 'Приказ';
      showToast(title);
    });
  });

  const clock = document.getElementById('turnClock');
  let seconds = 18 * 3600 + 42 * 60 + 31;
  setInterval(() => {
    seconds = Math.max(0, seconds - 1);
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    if (clock) clock.textContent = `${h}:${m}:${s}`;
  }, 1000);

  function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('visible'), 1700);
  }

  function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#039;',
      '"': '&quot;'
    }[char]));
  }
})();
