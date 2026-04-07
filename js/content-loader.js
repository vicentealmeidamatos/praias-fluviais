/**
 * content-loader.js — Injetor universal de conteúdo CMS
 * Carrega data/content.json e preenche os elementos com data-content-* attrs.
 * Fallback: se o JSON falhar, o texto hardcoded nas páginas permanece visível.
 */
(async function () {
  try {
    const res = await fetch('/data/content.json');
    if (!res.ok) throw new Error('content.json não disponível');
    const content = await res.json();

    // Disponível globalmente para outros scripts (e.g., loja.js, index.js)
    window._siteContent = content;

    // Resolve um caminho de pontos no objeto content
    const resolve = (dotPath) =>
      dotPath.split('.').reduce((o, k) => (o != null ? o[k] : undefined), content);

    // Texto simples
    document.querySelectorAll('[data-content]').forEach((el) => {
      const val = resolve(el.dataset.content);
      if (val != null && val !== '') el.textContent = val;
    });

    // HTML (rich text — Quill output)
    document.querySelectorAll('[data-content-html]').forEach((el) => {
      const val = resolve(el.dataset.contentHtml);
      if (val != null && val !== '') el.innerHTML = val;
    });

    // Atributo src de imagens
    document.querySelectorAll('[data-content-img]').forEach((el) => {
      const val = resolve(el.dataset.contentImg);
      if (val) el.src = val;
    });

    // Atributo href de links
    document.querySelectorAll('[data-content-href]').forEach((el) => {
      const val = resolve(el.dataset.contentHref);
      if (val) el.href = val;
    });

    // Atributo placeholder de inputs
    document.querySelectorAll('[data-content-placeholder]').forEach((el) => {
      const val = resolve(el.dataset.contentPlaceholder);
      if (val) el.placeholder = val;
    });

    // Visibilidade de secções (booleano)
    document.querySelectorAll('[data-content-visible]').forEach((el) => {
      const val = resolve(el.dataset.contentVisible);
      if (val === false) {
        el.style.display = 'none';
      }
    });

    // Dispara evento para scripts que precisem saber que o conteúdo está carregado
    document.dispatchEvent(new CustomEvent('contentLoaded', { detail: content }));

  } catch (e) {
    console.warn('[content-loader] Erro ao carregar content.json:', e.message);
    // O texto hardcoded nas páginas permanece como fallback
    window._siteContent = null;
    document.dispatchEvent(new CustomEvent('contentLoaded', { detail: null }));
  }
})();
