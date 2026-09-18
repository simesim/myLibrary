const SPINE_COLORS = [
    "var(--spine-1)", "var(--spine-2)", "var(--spine-3)", "var(--spine-4)",
    "var(--spine-5)", "var(--spine-6)", "var(--spine-7)", "var(--spine-8)"
];

let ALL_BOOKS = [];
let FILTERED_BOOKS = [];

const els = {
    shelfContainer: document.getElementById("shelfContainer"),
    loadingState: document.getElementById("loadingState"),
    emptyState: document.getElementById("emptyState"),
    errorState: document.getElementById("errorState"),
    errorDetail: document.getElementById("errorDetail"),
    bookCount: document.getElementById("bookCount"),
    lastSync: document.getElementById("lastSync"),
    searchInput: document.getElementById("searchInput"),
    sortSelect: document.getElementById("sortSelect"),
    genreSelect: document.getElementById("genreSelect"),
    statusSelect: document.getElementById("statusSelect"),
    randomBtn: document.getElementById("randomBtn"),
    modal: document.getElementById("bookModal"),
    modalBackdrop: document.getElementById("modalBackdrop"),
    modalClose: document.getElementById("modalClose"),
    modalCard: document.getElementById("modalCard"),
    modalCover: document.getElementById("modalCover"),
    modalCoverFallback: document.getElementById("modalCoverFallback"),
    modalGenre: document.getElementById("modalGenre"),
    modalTitle: document.getElementById("modalTitle"),
    modalAuthor: document.getElementById("modalAuthor"),
    modalStatus: document.getElementById("modalStatus"),
    modalYear: document.getElementById("modalYear"),
    modalRating: document.getElementById("modalRating"),
};

function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (c === '"' && next === '"') {
                field += '"';
                i++;
            } else if (c === '"') { inQuotes = false; } else { field += c; }
        } else {
            if (c === '"') { inQuotes = true; } else if (c === ',') {
                row.push(field);
                field = "";
            } else if (c === '\r') {} else if (c === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = "";
            } else { field += c; }
        }
    }
    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter(r => r.some(cell => cell.trim() !== ""));
}

function normalizeKey(key) {
    return key.trim().toLowerCase()
        .replace("ё", "е");
}

function rowsToObjects(rows) {
    const headerRow = rows[0].map(normalizeKey);
    const colIndex = {
        title: headerRow.findIndex(h => h.includes("назв") || h.includes("title")),
        author: headerRow.findIndex(h => h.includes("автор") || h.includes("author")),
        genre: headerRow.findIndex(h => h.includes("жанр") || h.includes("genre")),
        status: headerRow.findIndex(h => h.includes("статус") || h.includes("status")),
        cover: headerRow.findIndex(h => h.includes("обложк") || h.includes("cover") || h.includes("image")),
        rating: headerRow.findIndex(h => h.includes("рейтинг") || h.includes("rating")),
        year: headerRow.findIndex(h => h.includes("год") || h.includes("year")),
    };

    const books = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const get = (idx) => (idx >= 0 && r[idx] !== undefined) ? r[idx].trim() : "";

        const title = get(colIndex.title);
        if (!title) continue;

        const ratingRaw = get(colIndex.rating);
        const ratingNum = parseFloat(ratingRaw.replace(",", "."));

        books.push({
            id: `b${i}`,
            title,
            author: get(colIndex.author) || "Автор неизвестен",
            genre: get(colIndex.genre) || "Без жанра",
            status: normalizeStatus(get(colIndex.status)),
            cover: get(colIndex.cover),
            rating: isNaN(ratingNum) ? null : Math.max(0, Math.min(5, ratingNum)),
            year: get(colIndex.year),
        });
    }
    return books;
}

function normalizeStatus(raw) {
    const s = raw.toLowerCase();
    if (s.includes("прочит") && !s.includes("хочу")) return "прочитано";
    if (s.includes("процесс") || s.includes("читаю")) return "в процессе";
    if (s.includes("хочу") || s.includes("план")) return "хочу прочитать";
    return s || "хочу прочитать";
}

async function loadBooks() {
    try {
        if (!CONFIG.CSV_URL || CONFIG.CSV_URL.includes("ВСТАВЬ_СЮДА")) {
            throw new Error("CSV_URL не настроен в config.js");
        }
        const sep = CONFIG.CSV_URL.includes("?") ? "&" : "?";
        const res = await fetch(`${CONFIG.CSV_URL}${sep}_=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const rows = parseCSV(text);
        if (!rows.length) throw new Error("Таблица пуста");

        ALL_BOOKS = rowsToObjects(rows);
        if (!ALL_BOOKS.length) throw new Error("Не нашлось ни одной книги — проверь названия колонок");

        populateGenreOptions();
        applyFiltersAndRender();

        els.lastSync.textContent = new Date().toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch (err) {
        console.error(err);
        els.loadingState.hidden = true;
        els.errorState.hidden = false;
        els.errorDetail.textContent = `Подробность: ${err.message}. Проверь ссылку на CSV в config.js и доступ "Любой пользователь с ссылкой".`;
    }
}

function populateGenreOptions() {
    const genres = [...new Set(ALL_BOOKS.map(b => b.genre))].sort((a, b) => a.localeCompare(b, "ru"));
    els.genreSelect.innerHTML = `<option value="all">Все жанры</option>` +
        genres.map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join("");
}

function applyFiltersAndRender() {
    const q = els.searchInput.value.trim().toLowerCase();
    const genre = els.genreSelect.value;
    const status = els.statusSelect.value;
    const sort = els.sortSelect.value;

    let list = ALL_BOOKS.filter(b => {
        const matchesQ = !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
        const matchesGenre = genre === "all" || b.genre === genre;
        const matchesStatus = status === "all" || b.status === status;
        return matchesQ && matchesGenre && matchesStatus;
    });

    list.sort((a, b) => {
        switch (sort) {
            case "title-asc":
                return a.title.localeCompare(b.title, "ru");
            case "author-asc":
                return a.author.localeCompare(b.author, "ru");
            case "rating-desc":
                return (b.rating != null ? b.rating : -1) - (a.rating != null ? a.rating : -1);
            case "rating-asc":
                return (a.rating != null ? a.rating : 99) - (b.rating != null ? b.rating : 99);
            case "year-desc":
                return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
            case "year-asc":
                return (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999);
            default:
                return 0;
        }
    });

    FILTERED_BOOKS = list;
    render();
}

function hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
    return h;
}

function spineSizeClass(title) {
    const h = hashStr(title);
    const variants = ["", "spine-tall", "spine-short", "", ""];
    return variants[h % variants.length];
}

function spineWidthClass(title) {
    const h = hashStr(title + "w");
    const variants = ["", "", "spine-thick", "", "spine-thin", ""];
    return variants[h % variants.length];
}

function render() {
    els.loadingState.hidden = true;

    if (!FILTERED_BOOKS.length) {
        els.shelfContainer.innerHTML = "";
        els.emptyState.hidden = false;
        els.bookCount.textContent = `0 книг`;
        return;
    }
    els.emptyState.hidden = true;
    els.errorState.hidden = true;

    els.bookCount.textContent = pluralizeBooks(FILTERED_BOOKS.length) + (FILTERED_BOOKS.length !== ALL_BOOKS.length ? ` из ${ALL_BOOKS.length}` : "");

    const genreActive = els.genreSelect.value !== "all";
    const groups = new Map();

    if (genreActive) {
        groups.set(els.genreSelect.value, FILTERED_BOOKS);
    } else {
        for (const b of FILTERED_BOOKS) {
            if (!groups.has(b.genre)) groups.set(b.genre, []);
            groups.get(b.genre).push(b);
        }
    }

    const frag = document.createDocumentFragment();
    let colorCursor = 0;

    for (const [genre, books] of groups) {
        const rowWrap = document.createElement("section");
        rowWrap.className = "shelf-row";

        const label = document.createElement("div");
        label.className = "shelf-row-genre";
        label.innerHTML = `${escapeHtml(genre)} <span class="shelf-row-genre-count">${books.length}</span>`;
        rowWrap.appendChild(label);

        const spinesWrap = document.createElement("div");
        spinesWrap.className = "shelf-row-spines";

        for (const book of books) {
            const color = SPINE_COLORS[hashStr(book.title + book.author) % SPINE_COLORS.length];
            colorCursor++;

            const spine = document.createElement("button");
            spine.className = `spine ${spineSizeClass(book.title)} ${spineWidthClass(book.title)}`.trim();
            spine.style.setProperty("--spine-color", color);
            spine.setAttribute("aria-label", `${book.title}, ${book.author}`);
            spine.dataset.id = book.id;

            spine.innerHTML = `
        <span class="spine-headband"></span>
        <span class="spine-title">${escapeHtml(book.title)}</span>
        <span class="spine-pages" aria-hidden="true"></span>
      `;
            spine.addEventListener("click", () => openModal(book));
            spinesWrap.appendChild(spine);
        }

        rowWrap.appendChild(spinesWrap);

        const board = document.createElement("div");
        board.className = "shelf-row-board";
        rowWrap.appendChild(board);

        frag.appendChild(rowWrap);
    }

    els.shelfContainer.innerHTML = "";
    els.shelfContainer.appendChild(frag);
}

function pluralizeBooks(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    let word = "книг";
    if (mod10 === 1 && mod100 !== 11) word = "книга";
    else if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) word = "книги";
    return `${n} ${word}`;
}

function openModal(book) {
    els.modalGenre.textContent = book.genre;
    els.modalTitle.textContent = book.title;
    els.modalAuthor.textContent = book.author;
    els.modalStatus.textContent = capitalize(book.status);
    els.modalYear.textContent = book.year || "";

    els.modalRating.textContent = book.rating ? "★".repeat(Math.round(book.rating)) + "☆".repeat(5 - Math.round(book.rating)) : "";

    const color = SPINE_COLORS[hashStr(book.title + book.author) % SPINE_COLORS.length];
    els.modalCoverFallback.style.background = color;
    els.modalCoverFallback.textContent = book.title;

    if (book.cover) {
        els.modalCover.src = book.cover;
        els.modalCover.hidden = false;
        els.modalCover.onerror = () => { els.modalCover.hidden = true; };
        els.modalCoverFallback.style.display = "none";
        els.modalCover.onload = () => { els.modalCoverFallback.style.display = "none"; };
    } else {
        els.modalCover.hidden = true;
        els.modalCoverFallback.style.display = "flex";
    }

    els.modal.classList.add("open");
    els.modal.setAttribute("aria-hidden", "false");
    els.modalClose.focus();
}

function closeModal() {
    els.modal.classList.remove("open");
    els.modal.setAttribute("aria-hidden", "true");
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(s) { return escapeHtml(s); }

function pullRandomBook() {
    const pool = FILTERED_BOOKS.length ? FILTERED_BOOKS : ALL_BOOKS;
    if (!pool.length) return;
    const book = pool[Math.floor(Math.random() * pool.length)];

    const spineEl = document.querySelector(`.spine[data-id="${book.id}"]`);
    if (spineEl) {
        spineEl.scrollIntoView({ behavior: "smooth", block: "center" });
        spineEl.classList.add("spine-picked");
        spineEl.style.transform = "translateY(-26px) rotate(-2deg)";
        setTimeout(() => {
            openModal(book);
            spineEl.style.transform = "";
        }, 380);
    } else {
        openModal(book);
    }
}

els.searchInput.addEventListener("input", debounce(applyFiltersAndRender, 150));
els.sortSelect.addEventListener("change", applyFiltersAndRender);
els.genreSelect.addEventListener("change", applyFiltersAndRender);
els.statusSelect.addEventListener("change", applyFiltersAndRender);
els.randomBtn.addEventListener("click", pullRandomBook);
els.modalClose.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

function debounce(fn, ms) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

loadBooks();