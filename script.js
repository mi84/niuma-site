// Mobile menu toggle
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileNav = document.getElementById('mobileNav');

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        mobileNav.classList.toggle('active');
    });
}

// Close mobile menu on link click
document.querySelectorAll('.mobile-nav a').forEach(link => {
    link.addEventListener('click', () => {
        mobileNav.classList.remove('active');
    });
});

// FAQ toggle
function toggleFaq(button) {
    const item = button.closest('.faq-item');
    const isActive = item.classList.contains('active');
    
    // Close all
    document.querySelectorAll('.faq-item').forEach(el => {
        el.classList.remove('active');
    });
    
    // Open clicked if it was closed
    if (!isActive) {
        item.classList.add('active');
    }
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offset = 80;
            const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top, behavior: 'smooth' });
        }
    });
});

// Header background on scroll
const header = document.querySelector('.header');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        header.style.borderBottomColor = 'rgba(42, 42, 58, 0.8)';
    } else {
        header.style.borderBottomColor = 'rgba(42, 42, 58, 0.5)';
    }
});

// Animate elements on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Apply initial state and observe
document.addEventListener('DOMContentLoaded', () => {
    const animateElements = document.querySelectorAll(
        '.feature-card, .step, .pricing-card, .faq-item, .demo-window'
    );
    
    animateElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = `opacity 0.6s ease ${index * 0.08}s, transform 0.6s ease ${index * 0.08}s`;
        observer.observe(el);
    });

    const paymentReturn = document.getElementById('paymentReturn');
    const paymentReturnBadge = document.getElementById('paymentReturnBadge');
    const paymentReturnTitle = document.getElementById('paymentReturnTitle');
    const paymentReturnText = document.getElementById('paymentReturnText');
    const paymentReturnOrder = document.getElementById('paymentReturnOrder');
    const paymentReturnTimer = document.getElementById('paymentReturnTimer');
    const paymentReturnCountdown = document.getElementById('paymentReturnCountdown');
    const paymentReturnOpenBot = document.getElementById('paymentReturnOpenBot');
    const paymentReturnClose = document.getElementById('paymentReturnClose');

    const params = new URLSearchParams(window.location.search);
    const hasPaymentQuery = params.has('success') || params.has('error') || params.has('id') || params.has('order_id');
    const paymentReturnEnabled = paymentReturn && paymentReturn.dataset.enabled === 'true';

    if (paymentReturn && !paymentReturnEnabled) {
        if (hasPaymentQuery) {
            const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
            window.history.replaceState({}, document.title, cleanUrl);
        }
        return;
    }

    if (!paymentReturnEnabled || !paymentReturnBadge || !paymentReturnTitle || !paymentReturnText || !paymentReturnOrder) {
        return;
    }

    const isSuccess = params.has('success');
    const isError = params.has('error');
    const orderId = params.get('id') || params.get('order_id') || '';
    const tgHttpUrl = 'https://t.me/niuma_local_bot';
    const tgDeepLink = 'tg://resolve?domain=niuma_local_bot';

    if (!isSuccess && !isError) {
        return;
    }

    let seconds = 4;
    let redirected = false;

    function openBot() {
        if (redirected) {
            return;
        }
        redirected = true;
        window.location.href = tgDeepLink;
        window.setTimeout(() => {
            window.location.href = tgHttpUrl;
        }, 900);
    }

    function closeOverlay() {
        paymentReturn.hidden = true;
        document.body.style.overflow = '';
        const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    paymentReturn.hidden = false;
    document.body.style.overflow = 'hidden';

    if (orderId) {
        paymentReturnOrder.hidden = false;
        paymentReturnOrder.textContent = `Заказ #${orderId}`;
    }

    if (isSuccess) {
        paymentReturnBadge.textContent = '✅ Оплата прошла успешно';
        paymentReturnBadge.classList.add('is-success');
        paymentReturnTitle.textContent = 'Оплата подтверждена';
        paymentReturnText.textContent = 'Ключ и расширение уже отправляются в Telegram-бот Niuma. Сейчас мы автоматически откроем бота.';
        paymentReturnTimer.hidden = false;
        const timer = window.setInterval(() => {
            seconds -= 1;
            paymentReturnCountdown.textContent = String(Math.max(seconds, 0));
            if (seconds <= 0) {
                window.clearInterval(timer);
                openBot();
            }
        }, 1000);
    } else {
        paymentReturnBadge.textContent = '⚠️ Оплата не завершена';
        paymentReturnBadge.classList.add('is-error');
        paymentReturnTitle.textContent = 'Платёж не подтверждён';
        paymentReturnText.textContent = 'Вернитесь в Telegram-бот и попробуйте оплату ещё раз. Если деньги списались, но ключ не пришёл — напишите в поддержку.';
        paymentReturnTimer.hidden = true;
    }

    paymentReturnOpenBot.addEventListener('click', (event) => {
        event.preventDefault();
        openBot();
    });

    paymentReturnClose.addEventListener('click', () => {
        closeOverlay();
    });
});

// API на отдельном поддомене: niuma.ru обслуживается GitHub Pages (статика),
// динамические эндпоинты живут на api.niuma.ru. Legacy совместимость: если
// сайт обслуживается со старого origin (127.0.0.1:8088 / VPS), используем
// относительный путь.
const NIUMA_API_BASE = (() => {
    try {
        const host = (location && location.hostname) || '';
        if (host === 'niuma.ru' || host === 'www.niuma.ru') return 'https://api.niuma.ru';
    } catch (e) { /* ignore */ }
    return '';
})();

window.addEventListener('load', () => {
    fetch(`${NIUMA_API_BASE}/api/analytics/hit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            page: location.pathname
        }),
        keepalive: true
    }).catch(() => {});
});
