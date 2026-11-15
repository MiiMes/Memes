import { requestProviders } from "./ui/services/providerApi.js";

const AVAILABLE_PROVIDERS = new Set(["giphy", "tenor", "klipy"]);
const DEFAULT_PROVIDERS = ["giphy", "tenor", "klipy"];
const APP_BASE_URL = import.meta.url.slice(0, import.meta.url.lastIndexOf("/") + 1);

const styles = `
  :host{display:block;color:#222;font:16px/1.45 system-ui,sans-serif}
  *{box-sizing:border-box}
  .search{display:flex;gap:.5rem;flex-wrap:wrap}
  input,button{font:inherit;padding:.65rem .8rem;border:1px solid #bbb;border-radius:.5rem}
  input[type=search]{flex:1;min-width:12rem}
  button{cursor:pointer;background:#fff}
  button:disabled{cursor:wait;opacity:.65}
  .results{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.75rem;margin-top:1rem}
  article{overflow:hidden;border:1px solid #ddd;border-radius:.65rem}
  article img{display:block;width:100%;height:130px;object-fit:cover;background:#eee}
  article strong{display:block;min-height:2.6em;padding:.5rem;font-size:.9rem}
  article button{display:block;width:calc(100% - 1rem);margin:.5rem}
  .status{min-height:1.5em}
  dialog{width:min(900px,95vw);height:min(760px,90vh);padding:.5rem;border:0;border-radius:.8rem}
  dialog::backdrop{background:#0009}
  dialog header{display:flex;justify-content:space-between;align-items:center;padding:.5rem}
  dialog iframe{width:100%;height:calc(100% - 3.5rem);border:0}
`;

class MiiMesSearch extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.shadowRoot.querySelector("form")) return;
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <form class="search">
        <input type="search" name="query" aria-label="Search GIFs" placeholder="Search GIFs…" required maxlength="100">
        <button type="submit">Search</button>
      </form>
      <p class="status" role="status"></p>
      <div class="results" aria-live="polite"></div>
      <dialog aria-label="Edit selected GIF">
        <header><strong>Edit this GIF in MiiMes</strong><button type="button" data-close>Close</button></header>
        <iframe title="MiiMes meme editor" loading="lazy"></iframe>
      </dialog>
    `;
    this.shadowRoot.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.search(this.shadowRoot.querySelector('[name="query"]').value.trim());
    });
    this.shadowRoot.querySelector("[data-close]").addEventListener("click", () => {
      this.shadowRoot.querySelector("dialog").close();
    });
    this.shadowRoot.querySelector(".results").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-item-index]");
      if (!button) return;
      this.openEditor(this.results[Number(button.dataset.itemIndex)]);
    });
  }

  get providers() {
    const configured = (this.getAttribute("providers") || DEFAULT_PROVIDERS.join(","))
      .split(",")
      .map((provider) => provider.trim().toLocaleLowerCase())
      .filter((provider) => AVAILABLE_PROVIDERS.has(provider));
    return [...new Set(configured)];
  }

  async search(query) {
    const status = this.shadowRoot.querySelector(".status");
    const results = this.shadowRoot.querySelector(".results");
    const button = this.shadowRoot.querySelector('button[type="submit"]');
    if (!query) {
      status.textContent = "Enter a search phrase.";
      return;
    }
    if (!this.providers.length) {
      status.textContent = "Set the providers attribute to giphy, tenor, or klipy.";
      return;
    }

    button.disabled = true;
    status.textContent = "Searching selected GIF providers…";
    results.replaceChildren();
    try {
      const responses = await requestProviders({
        providers: this.providers,
        action: "search",
        q: query,
        kind: "gif",
        locale: this.getAttribute("locale") || "en_US",
        logRequest: () => {},
      });
      this.results = Object.values(responses).flatMap((response) => response.items ?? []);
      for (const [index, item] of this.results.entries()) {
        const card = document.createElement("article");
        const image = document.createElement("img");
        image.src = item.imageUrl;
        image.alt = item.title;
        image.loading = "lazy";
        const title = document.createElement("strong");
        title.textContent = item.title;
        const edit = document.createElement("button");
        edit.type = "button";
        edit.dataset.itemIndex = String(index);
        edit.textContent = "Edit GIF";
        card.append(image, title, edit);
        results.append(card);
      }
      const failures = Object.entries(responses)
        .filter(([, response]) => response.error)
        .map(([provider, response]) => `${provider}: ${response.error}`);
      status.textContent = this.results.length
        ? `${this.results.length} GIF(s) found.${failures.length ? ` ${failures.join(" ")}` : ""}`
        : failures.join(" ") || "No GIFs found.";
    } catch (cause) {
      status.textContent = `Search failed. ${cause instanceof Error ? cause.message : String(cause)}`;
    } finally {
      button.disabled = false;
    }
  }

  openEditor(item) {
    if (!item?.imageUrl) return;
    try {
      const source = new URL(item.imageUrl);
      if (source.protocol !== "https:" || source.username || source.password) {
        throw new Error("The selected media does not have a public HTTPS URL.");
      }
      const base = this.getAttribute("app-url") || APP_BASE_URL;
      const url = new URL(base, globalThis.location.href);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("The app-url attribute must be an HTTP(S) URL.");
      }
      const params = new URLSearchParams({
        source: source.href,
        title: item.title,
      });
      url.hash = `/editor?${params}`;
      const dialog = this.shadowRoot.querySelector("dialog");
      this.shadowRoot.querySelector("iframe").src = url.href;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else globalThis.open(url.href, "_blank", "noopener,noreferrer");
    } catch (cause) {
      this.shadowRoot.querySelector(".status").textContent =
        `The editor could not be opened. ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }
}

if (!customElements.get("miimes-search")) {
  customElements.define("miimes-search", MiiMesSearch);
}
