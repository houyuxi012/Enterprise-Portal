/**
 * NGEP Landing Page Application Module
 * @version 2.4.1
 * @module ngep/app
 *
 * Architecture:
 *   content.json → DataService → RenderEngine → DOM
 *
 * Dependencies: AOS.js, Tailwind CSS
 */

'use strict';

const NGEP = (() => {
    // ============ Private State ============
    let _config = null;
    let _initialized = false;
    const _API_BASE = '/api';
    const _CACHE_KEY = 'ngep_content_v2';

    // ============ Data Service ============
    const DataService = {
        async fetchContent() {
            try {
                const cached = sessionStorage.getItem(_CACHE_KEY);
                if (cached) {
                    const { data, ts } = JSON.parse(cached);
                    if (Date.now() - ts < 300000) {
                        console.log('[NGEP] Content loaded from cache');
                        return data;
                    }
                }
            } catch (e) { /* ignore */ }

            const response = await fetch('/data/content.json', {
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) throw new Error(`Content fetch failed: ${response.status}`);
            const data = await response.json();

            try {
                sessionStorage.setItem(_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
            } catch (e) { /* quota exceeded */ }

            console.log(`[NGEP] Content loaded (v${data.meta?.version || 'unknown'})`);
            return data;
        },

        async submitLead(formData) {
            const response = await fetch(`${_API_BASE}/leads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || '网络请求异常');
            }
            return response.json();
        }
    };

    // ============ DOM Helpers ============
    function $(sel, parent) {
        return (parent || document).querySelector(sel);
    }
    function $$(sel, parent) {
        return (parent || document).querySelectorAll(sel);
    }
    function setText(el, text) {
        if (el) el.textContent = text || '';
    }

    // ============ Render Engine ============
    const RenderEngine = {

        // ---------- Hero ----------
        renderHero(data) {
            const section = $('[data-section="hero"]');
            if (!section || !data) return;

            setText($('[data-bind="hero-badge"]', section), data.badge);
            setText($('[data-bind="hero-subtitle"]', section), data.subtitle);

            // Title: first line + highlighted second line
            const h1 = $('[data-bind="hero-title"]', section);
            if (h1 && data.title?.length) {
                const highlight = $('[data-bind="hero-title-highlight"]', h1);
                // Set first line as text node before <br>
                const br = h1.querySelector('br');
                if (br && br.previousSibling) {
                    br.previousSibling.textContent = data.title[0];
                }
                setText(highlight, data.title[1]);
            }

            // Floating cards
            if (data.floatingCards?.length) {
                data.floatingCards.forEach((card, i) => {
                    setText($(`[data-bind="float-card-${i}-title"]`, section), card.title);
                    setText($(`[data-bind="float-card-${i}-desc"]`, section), card.desc);
                });
            }
        },

        // ---------- Features ----------
        renderFeatures(data) {
            const section = $('[data-section="features"]');
            if (!section || !data) return;

            setText($('[data-bind="features-title"]', section), data.sectionTitle);
            setText($('[data-bind="features-desc"]', section), data.sectionDesc);

            if (data.items?.length) {
                data.items.forEach((item, i) => {
                    const card = $(`[data-feature="${i}"]`, section);
                    if (!card) return;
                    setText($('[data-bind="title"]', card), item.title);
                    setText($('[data-bind="desc"]', card), item.desc);
                });
            }
        },

        // ---------- Use Cases ----------
        renderUseCases(data) {
            const section = $('[data-section="useCases"]');
            if (!section || !data) return;

            setText($('[data-bind="uc-title"]', section), data.sectionTitle);
            setText($('[data-bind="uc-desc"]', section), data.sectionDesc);

            if (data.groups?.length) {
                data.groups.forEach((group, i) => {
                    setText($(`[data-bind="uc-group-${i}-title"]`, section), group.title);
                });
            }
        },

        // ---------- Architecture ----------
        renderArchitecture(data) {
            const section = $('[data-section="architecture"]');
            if (!section || !data) return;

            setText($('[data-bind="arch-title"]', section), data.sectionTitle);
            setText($('[data-bind="arch-desc"]', section), data.sectionDesc);

            if (data.items?.length) {
                data.items.forEach((item, i) => {
                    const card = $(`[data-arch="${i}"]`, section);
                    if (!card) return;
                    setText($('[data-bind="title"]', card), item.title);
                    setText($('[data-bind="desc"]', card), item.desc);
                });
            }
        },

        // ---------- Trust Logos ----------
        renderTrustLogos(data) {
            const section = $('[data-section="trustLogos"]');
            if (!section || !data) return;

            setText($('[data-bind="trust-title"]', section), data.sectionTitle);

            const grid = $('[data-bind="trust-grid"]', section);
            if (!grid || !data.items?.length) return;

            grid.innerHTML = data.items.map(logo => {
                const iconHtml = logo.type === 'image'
                    ? `<img src="${logo.src}" alt="${logo.abbr}" class="w-8 h-8 object-contain" />`
                    : `<svg class="w-8 h-8 text-[${logo.color}]" viewBox="0 0 24 24" fill="currentColor"><path d="${logo.svgPath}" /></svg>`;

                const nameClass = logo.nameClass || 'text-[15px] font-bold text-gray-800 tracking-tight';
                const abbrClass = logo.abbrClass || 'text-[8px] text-gray-400';

                return `<div class="flex items-center gap-2 group cursor-default">
                    ${iconHtml}
                    <div class="flex flex-col items-start leading-none">
                        <span class="${nameClass.includes('text-[') ? nameClass : 'text-[15px] font-bold text-gray-800 ' + nameClass}">${logo.name}</span>
                        <span class="${abbrClass.includes('text-[') ? abbrClass : 'text-[8px] text-gray-400 ' + abbrClass} uppercase mt-0.5 scale-90 origin-left">${logo.abbr}</span>
                    </div>
                </div>`;
            }).join('');
        },

        // ---------- Render All ----------
        renderAll(config) {
            this.renderHero(config.hero);
            this.renderFeatures(config.features);
            this.renderUseCases(config.useCases);
            this.renderArchitecture(config.architecture);
            this.renderTrustLogos(config.trustLogos);
            console.log('[NGEP] All sections rendered from data');
        }
    };

    // ============ UI Controller ============
    const UIController = {
        modal: null,
        modalContent: null,
        leadForm: null,
        submitBtn: null,
        spinner: null,
        formMsg: null,

        init() {
            this.modal = document.getElementById('contact-modal');
            this.modalContent = document.getElementById('modal-content');
            this.leadForm = document.getElementById('lead-form');
            this.submitBtn = document.getElementById('submit-btn');
            this.spinner = document.getElementById('loading-spinner');
            this.formMsg = document.getElementById('form-msg');

            $$('[data-ngep-open-modal]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openModal();
                });
            });
            $$('[data-ngep-close-modal]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.closeModal();
                });
            });

            if (this.leadForm) {
                this.leadForm.addEventListener('submit', (e) => this.handleSubmit(e));
            }

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.modal && !this.modal.classList.contains('opacity-0')) {
                    this.closeModal();
                }
            });

            window.addEventListener('scroll', () => {
                const nav = document.getElementById('navbar');
                if (nav) {
                    nav.style.boxShadow = window.scrollY > 40 ? '0 4px 24px rgba(0,0,0,0.08)' : 'none';
                }
            });
        },

        openModal() {
            if (!this.modal) return;
            this.modal.classList.remove('opacity-0', 'pointer-events-none');
            this.modalContent?.classList.remove('scale-95');
            this.modalContent?.classList.add('scale-100');
            this.formMsg?.classList.add('hidden');
        },

        closeModal() {
            if (!this.modal) return;
            this.modal.classList.add('opacity-0', 'pointer-events-none');
            this.modalContent?.classList.remove('scale-100');
            this.modalContent?.classList.add('scale-95');
            setTimeout(() => this.leadForm?.reset(), 300);
        },

        async handleSubmit(e) {
            e.preventDefault();
            if (!this.leadForm) return;

            this.setLoading(true);
            const formData = Object.fromEntries(new FormData(this.leadForm).entries());

            try {
                await DataService.submitLead(formData);
                this.showMessage(_config?.form?.successMsg || '提交成功！', 'success');
                setTimeout(() => this.closeModal(), 2000);
            } catch (error) {
                console.error('[NGEP] Submit error:', error);
                this.showMessage(error.message || _config?.form?.errorMsg || '提交失败，请稍后重试。', 'error');
            } finally {
                this.setLoading(false);
            }
        },

        setLoading(loading) {
            if (this.submitBtn) {
                this.submitBtn.disabled = loading;
                this.submitBtn.classList.toggle('opacity-80', loading);
                this.submitBtn.classList.toggle('cursor-not-allowed', loading);
            }
            this.spinner?.classList.toggle('hidden', !loading);
        },

        showMessage(text, type) {
            if (!this.formMsg) return;
            this.formMsg.textContent = text;
            this.formMsg.className = `text-center text-sm mt-4 ${type === 'success' ? 'text-green-600' : 'text-red-500'}`;
        }
    };

    // ============ Public API ============
    return {
        async init() {
            if (_initialized) return;
            console.log('[NGEP] Initializing application...');

            try {
                _config = await DataService.fetchContent();
                UIController.init();
                RenderEngine.renderAll(_config);

                if (typeof AOS !== 'undefined') {
                    AOS.init({ once: true, offset: 40 });
                }

                _initialized = true;
                console.log(`[NGEP] Application ready (build: ${_config.meta?.buildId || 'dev'})`);
            } catch (error) {
                console.error('[NGEP] Initialization failed:', error);
                if (typeof AOS !== 'undefined') AOS.init({ once: true, offset: 40 });
                UIController.init();
            }
        },

        openModal() { UIController.openModal(); },
        closeModal() { UIController.closeModal(); },
        getConfig() { return _config; },
        get version() { return _config?.meta?.version || '0.0.0'; }
    };
})();

document.addEventListener('DOMContentLoaded', () => NGEP.init());
