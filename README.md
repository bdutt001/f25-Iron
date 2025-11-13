# Team Iron — MingleMap Website

A modernized, responsive static site for GitHub Pages. This refresh keeps your original page structure and content while improving navigation, accessibility, responsiveness, and consistency across pages.

## What changed
- Unified global styles in `Stylesheets/modern.css` using CSS variables and dark-mode support
- Accessible, mobile-friendly navigation with a real menu button and Escape-to-close
- Consistent header/footer on all pages, plus a skip link for keyboard users
- Responsive embeds for presentations (Google Slides/Docs)
- Lightbox image viewer on the Deliverables page (click any deliverable image to enlarge)
- Small content fixes (e.g., a malformed tag in `References.html`)

## Structure
- `index.html` — Landing page
- `Deliverables.html` — Gallery of diagrams and artifacts (now with lightbox)
- `Presentations.html` — Embedded slides and documents (now responsive)
- `The_Team.html` — Team profiles
- `Labs.html` — Labs section (template)
- `References.html` — References and glossary image
- `Stylesheets/modern.css` — New global styles and utilities
- `scripts/lightbox.js` — Lightweight, dependency-free image lightbox
- Existing page-specific styles and scripts remain in place

## Local preview
You can open any HTML file directly in your browser, or use a simple local server for correct relative paths.

Windows PowerShell example:

```pwsh
# from repo root
Start-Process msedge.exe .\index.html
```

Or run a quick local server with Python if you have it installed:

```pwsh
python -m http.server 8080
# Then visit http://localhost:8080
```

## Adding new deliverables
- Place images in `main_assets/Deliverables/`
- On `Deliverables.html`, add a new block using the existing `.picture_container` markup
- Add `data-lightbox` to the `<img>` element to enable the lightbox (the attribute value becomes the caption)

Example:
```html
<div class="picture_container center_pic">
  <h3>New Diagram</h3>
  <img src="main_assets/Deliverables/my-diagram.jpg" alt="New Diagram" class="image_format" data-lightbox="New Diagram">
</div>
```

## Accessibility notes
- The mobile menu button updates `aria-expanded` and supports Escape to close
- A skip link lets keyboard users jump to main content
- Active page links include `aria-current="page"`

## Dependencies
- Google Material Icons (CDN) for the menu icon
- Google Fonts (Inter + Roboto via existing CSS)

## GitHub Pages
If this repo is already configured for GitHub Pages, push to the `website` branch (or your configured branch) and Pages will update automatically.

If you need to enable it:
1. Open the repository settings on GitHub
2. Go to "Pages"
3. Set the source to your default branch and root folder
4. Save and wait for deployment

---
Questions or tweaks you want? Open an issue or drop a note in the commit message and we can iterate.