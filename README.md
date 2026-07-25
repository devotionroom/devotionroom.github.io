# Devotion Room

Welcome to the Devotion Room GitHub repository! This is a modern, fast, scalable static website built with **Astro**.

## Project Structure

This project follows standard Astro structure, configured specifically for content management:

- `src/pages/` - Contains pages and routing.
- `src/content/` - Contains all Markdown content (devotionals, lessons, songs, etc.).
- `public/` - Static assets like images and fonts. The `CNAME` file here configures our custom domain.
- `astro.config.mjs` - The main configuration file for Astro.
- `.github/workflows/deploy.yml` - Automates deployment to GitHub Pages.

## Local Development

If you wish to run the project locally on your machine, you need **Node.js** installed.

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Visit `http://localhost:4321` in your browser.

## Deployment

The site is configured to automatically build and deploy to GitHub Pages whenever changes are pushed to the `main` branch. 
There is zero manual deployment required.

## Adding New Content

To add new content (in Phase 3), you will simply add a new Markdown (`.md`) file to the appropriate folder in `src/content/`. For example:
- `src/content/devotionals/my-new-devotional.md`
- `src/content/lessons/sunday-lesson.md`

You will not need to edit any HTML files.

## Future Maintenance

The site is designed to be minimal and easy to maintain. Keep the Markdown files organized. Astro requires zero ongoing maintenance unless you wish to upgrade the framework version in `package.json`.
